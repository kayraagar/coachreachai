import { createClient } from "@/lib/supabase/server";
import { rel } from "@/lib/rel";
import { asTrack, trackConfig, type NetSection, type Track, type TrackConfig } from "@/lib/track";
import {
  subDays,
  format,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  getISOWeek,
  addDays,
} from "date-fns";

type SubjectRef = { name: string } | null;

type GoalRow = {
  id: string;
  goal_type: string;
  subject_id: string | null;
  target_value: number;
  subjects: SubjectRef | SubjectRef[];
};

/** Bir öğrencinin sınav kolu; profil okunamazsa güvenli varsayılan YKS. */
export async function getStudentTrack(studentId: string): Promise<Track> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("track")
    .eq("id", studentId)
    .maybeSingle();
  return asTrack(data?.track);
}

/** Ders kataloğu — yalnızca ilgili sınav koluna ait dersler. */
export async function getSubjects(track: Track) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subjects")
    .select("*")
    .eq("track", track)
    .order("sort_order");
  return data ?? [];
}

/**
 * Ders + konu kataloğunu birlikte getirir. Konular ders üzerinden kola
 * bağlı olduğu için, kolun dersleri süzüldükten sonra onların konuları alınır.
 */
export async function getCatalog(track: Track) {
  const supabase = await createClient();
  const subjects = await getSubjects(track);
  if (subjects.length === 0) return { subjects, topics: [] };

  const { data: topics } = await supabase
    .from("topics")
    .select("*")
    .in(
      "subject_id",
      subjects.map((s) => s.id)
    )
    .order("sort_order");

  return { subjects, topics: topics ?? [] };
}

export async function getTopics(subjectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("topics")
    .select("*")
    .eq("subject_id", subjectId)
    .order("sort_order");
  return data ?? [];
}

/** Son N gün için günlük toplam çözülen soru sayısı (doğru+yanlış+boş). */
/**
 * Çözülen soruların TEK kaynağı: günlük soru girişleri + deneme sonuçları.
 *
 * Denemede çözülen sorular da "çözülen soru" sayılır; bu yüzden soru sayan
 * her hesap (günlük trend, haftalık takip, ders dağılımı, hedefler, zorlanılan
 * konular) buradan beslenir. Ayrı ayrı daily_logs sorgulanırsa denemeler
 * sayımın dışında kalır.
 *
 * Süre yalnızca günlük girişlerden gelir — deneme sonuçlarında süre tutulmuyor,
 * uydurulmuş bir değerle çalışma süresini şişirmek doğru olmaz.
 */
export type QuestionEvent = {
  date: string;
  subjectId: string | null;
  subjectName: string | null;
  topicName: string | null;
  correct: number;
  wrong: number;
  blank: number;
  minutes: number | null;
  source: "log" | "exam";
};

export async function getQuestionEvents(
  studentId: string,
  from: string,
  to?: string
): Promise<QuestionEvent[]> {
  const supabase = await createClient();

  let logsQuery = supabase
    .from("daily_logs")
    .select(
      "log_date, subject_id, correct_count, wrong_count, blank_count, duration_minutes, topic_text, subjects(name), topics(name)"
    )
    .eq("student_id", studentId)
    .gte("log_date", from);
  if (to) logsQuery = logsQuery.lte("log_date", to);

  let examsQuery = supabase
    .from("exams")
    .select("id, exam_date")
    .eq("student_id", studentId)
    .gte("exam_date", from);
  if (to) examsQuery = examsQuery.lte("exam_date", to);

  const [{ data: logs }, { data: exams }] = await Promise.all([logsQuery, examsQuery]);

  const events: QuestionEvent[] = (logs ?? []).map((row) => ({
    date: row.log_date,
    subjectId: row.subject_id,
    subjectName: rel(row.subjects)?.name ?? null,
    // Elle yazılan konu (006) önce; eski kayıtlarda listeden seçilen konu.
    topicName: row.topic_text ?? rel(row.topics)?.name ?? null,
    correct: row.correct_count,
    wrong: row.wrong_count,
    blank: row.blank_count,
    minutes: row.duration_minutes,
    source: "log",
  }));

  if (exams && exams.length > 0) {
    const dateByExam = new Map(exams.map((e) => [e.id, e.exam_date]));
    const { data: results } = await supabase
      .from("exam_results")
      .select("exam_id, subject_id, correct_count, wrong_count, blank_count, subjects(name)")
      .in(
        "exam_id",
        exams.map((e) => e.id)
      );

    (results ?? []).forEach((row) => {
      const date = dateByExam.get(row.exam_id);
      if (!date) return;
      events.push({
        date,
        subjectId: row.subject_id,
        subjectName: rel(row.subjects)?.name ?? null,
        // Deneme sonuçları konu bazında tutulmuyor; konusuz girişlerle aynı
        // şekilde "Genel" altında toplanır.
        topicName: null,
        correct: row.correct_count,
        wrong: row.wrong_count,
        blank: row.blank_count,
        minutes: null,
        source: "exam",
      });
    });
  }

  return events;
}

/** Bir olaydaki toplam soru sayısı (doğru + yanlış + boş). */
function questionTotal(e: QuestionEvent) {
  return e.correct + e.wrong + e.blank;
}

export async function getDailyQuestionTrend(studentId: string, days = 14) {
  const from = format(subDays(new Date(), days - 1), "yyyy-MM-dd");
  const events = await getQuestionEvents(studentId, from);

  const byDate = new Map<string, number>();
  events.forEach((e) => {
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + questionTotal(e));
  });

  const interval = eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() });
  return interval.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    return { x: format(d, "d MMM"), y: byDate.get(key) ?? 0 };
  });
}

/**
 * Son N gün için günlük çalışma süresi (saat).
 *
 * İki kaynağın toplamı:
 *   * study_time_entries — sorulardan bağımsız girilen süre (migration 007),
 *   * daily_logs.duration_minutes — eski soru girişlerindeki ve kronometre
 *     oturumlarının yazdığı süreler (geçmiş veri kaybolmasın diye).
 */
export async function getDailyStudyTrend(studentId: string, days = 14) {
  const supabase = await createClient();
  const from = format(subDays(new Date(), days - 1), "yyyy-MM-dd");

  const [{ data: logs }, { data: entries }] = await Promise.all([
    supabase
      .from("daily_logs")
      .select("log_date, duration_minutes")
      .eq("student_id", studentId)
      .gte("log_date", from)
      .not("duration_minutes", "is", null),
    supabase
      .from("study_time_entries")
      .select("entry_date, minutes")
      .eq("student_id", studentId)
      .gte("entry_date", from),
  ]);

  const byDate = new Map<string, number>();
  (logs ?? []).forEach((r) => {
    byDate.set(r.log_date, (byDate.get(r.log_date) ?? 0) + (r.duration_minutes ?? 0));
  });
  (entries ?? []).forEach((r) => {
    byDate.set(r.entry_date, (byDate.get(r.entry_date) ?? 0) + r.minutes);
  });

  const interval = eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() });
  return interval.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    return { x: format(d, "d MMM"), y: Math.round(((byDate.get(key) ?? 0) / 60) * 10) / 10 };
  });
}

/** Öğrencinin son çalışma süresi kayıtları (migration 007). */
export async function getRecentStudyTime(studentId: string, limit = 10) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("study_time_entries")
    .select("id, entry_date, minutes, note, subjects(name)")
    .eq("student_id", studentId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    date: row.entry_date,
    minutes: row.minutes,
    note: row.note,
    subjectName: rel(row.subjects)?.name ?? null,
  }));
}

/** Ders bazlı doğru/yanlış/boş toplamları (son N gün). */
export async function getSubjectBreakdown(studentId: string, days = 30) {
  const from = format(subDays(new Date(), days - 1), "yyyy-MM-dd");
  const events = await getQuestionEvents(studentId, from);

  const byId = new Map<
    string,
    { label: string; correct: number; wrong: number; blank: number }
  >();

  events.forEach((e) => {
    const key = e.subjectId ?? "diger";
    const entry = byId.get(key) ?? {
      label: e.subjectName ?? "Diğer",
      correct: 0,
      wrong: 0,
      blank: 0,
    };
    entry.correct += e.correct;
    entry.wrong += e.wrong;
    entry.blank += e.blank;
    byId.set(key, entry);
  });

  return Array.from(byId.values()).sort(
    (a, b) => b.correct + b.wrong + b.blank - (a.correct + a.wrong + a.blank)
  );
}

/**
 * Bir bölümün deneme netlerini denemelere göre toplar.
 *
 * `section.categories` doluysa yalnızca o kategorideki derslerin sonuçları
 * sayılır — LGS'de tek bir 90 soruluk deneme hem sözel hem sayısal netini
 * taşıdığı için bölüm kırılımı bu şekilde çıkarılır. YKS'de kategori süzgeci
 * yoktur; denemenin bütün ders sonuçları toplanır (mevcut davranış).
 */
async function netByExam(studentId: string, section: NetSection) {
  const supabase = await createClient();
  const { data: exams } = await supabase
    .from("exams")
    .select("id, exam_date, name, exam_type")
    .eq("student_id", studentId)
    .in("exam_type", section.examTypes)
    .order("exam_date");

  if (!exams || exams.length === 0) return [];

  const { data: results } = await supabase
    .from("exam_results")
    .select("exam_id, net, subjects(category)")
    .in(
      "exam_id",
      exams.map((e) => e.id)
    );

  const totals = new Map<string, number>();
  (results ?? []).forEach((r) => {
    if (section.categories) {
      const category = rel(r.subjects)?.category;
      if (!category || !section.categories.includes(category)) return;
    }
    totals.set(r.exam_id, (totals.get(r.exam_id) ?? 0) + Number(r.net));
  });

  return exams.map((e) => ({
    ...e,
    net: Math.round((totals.get(e.id) ?? 0) * 10) / 10,
  }));
}

/** Deneme sınavı net trendi — grafik noktaları. */
export async function getExamNetTrend(studentId: string, section: NetSection) {
  const exams = await netByExam(studentId, section);
  return exams.map((e) => ({
    x: format(new Date(e.exam_date), "d MMM"),
    y: e.net,
  }));
}

/** Aktif hedefler + güncel ilerleme. */
export async function getGoalsWithProgress(studentId: string) {
  const supabase = await createClient();
  const { data: goals } = await supabase
    .from("goals")
    .select("*, subjects(name)")
    .eq("student_id", studentId)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (!goals) return [];

  const results = await Promise.all(
    goals.map(async (g) => {
      let current = 0;

      if (g.goal_type === "daily_questions") {
        const today = format(new Date(), "yyyy-MM-dd");
        const events = await getQuestionEvents(studentId, today, today);
        current = events.reduce((sum, e) => sum + questionTotal(e), 0);
      } else if (g.goal_type === "weekly_questions") {
        const from = format(subDays(new Date(), 6), "yyyy-MM-dd");
        const events = await getQuestionEvents(studentId, from);
        current = events.reduce((sum, e) => sum + questionTotal(e), 0);
      } else if (g.goal_type === "exam_net" || g.goal_type === "subject_net") {
        const { data: lastExam } = await supabase
          .from("exams")
          .select("id, exam_date")
          .eq("student_id", studentId)
          .order("exam_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastExam) {
          let q = supabase.from("exam_results").select("net, subject_id").eq("exam_id", lastExam.id);
          if (g.goal_type === "subject_net" && g.subject_id) {
            q = q.eq("subject_id", g.subject_id);
          }
          const { data: res } = await q;
          current = (res ?? []).reduce((s, r) => s + Number(r.net), 0);
          current = Math.round(current * 10) / 10;
        }
      }

      return {
        id: g.id,
        label: goalLabel(g),
        current,
        target: Number(g.target_value),
        unit: g.goal_type.includes("net") ? " net" : " soru",
      };
    })
  );

  return results;
}

function goalLabel(g: GoalRow) {
  const name = rel(g.subjects)?.name;
  const subj = name ? ` — ${name}` : "";
  switch (g.goal_type) {
    case "daily_questions":
      return "Günlük soru hedefi";
    case "weekly_questions":
      return "Haftalık soru hedefi";
    case "exam_net":
      return "Son deneme toplam net hedefi";
    case "subject_net":
      return `Son deneme net hedefi${subj}`;
    default:
      return "Hedef";
  }
}

/** Program uyumu: son N gündeki planlanan vs tamamlanan öğe sayısı. */
export async function getPlanAdherence(studentId: string, days = 14) {
  const supabase = await createClient();
  const from = format(subDays(new Date(), days - 1), "yyyy-MM-dd");

  const { data } = await supabase
    .from("study_plan_items")
    .select("plan_date, completed")
    .eq("student_id", studentId)
    .gte("plan_date", from);

  const byDate = new Map<string, { planned: number; completed: number }>();
  (data ?? []).forEach((row) => {
    const entry = byDate.get(row.plan_date) ?? { planned: 0, completed: 0 };
    entry.planned += 1;
    if (row.completed) entry.completed += 1;
    byDate.set(row.plan_date, entry);
  });

  const totalPlanned = (data ?? []).length;
  const totalCompleted = (data ?? []).filter((r) => r.completed).length;
  const pct = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : null;

  return { pct, totalPlanned, totalCompleted };
}

// ============================================================================
// Haftalık Görüşme Ajandası — otomatik hesaplanan bölümler
// ============================================================================

/** Pazartesi başlangıçlı hafta aralığı (yyyy-MM-dd). */
export function weekRange(offsetWeeks = 0) {
  const base = subDays(new Date(), offsetWeeks * 7);
  const start = startOfWeek(base, { weekStartsOn: 1 });
  const end = endOfWeek(base, { weekStartsOn: 1 });
  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
    startDate: start,
    endDate: end,
    /** YKS sezonunun kaçıncı haftası olduğu değil, ISO hafta numarası. */
    weekNo: getISOWeek(start),
  };
}

/** Pazartesi başlangıçlı hafta başını yyyy-MM-dd olarak verir. */
export function weekStartOf(date: Date | string = new Date()) {
  const base = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  const safe = Number.isNaN(base.getTime()) ? new Date() : base;
  return format(startOfWeek(safe, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export type AgendaItem = {
  id: string;
  plan_date: string;
  title: string;
  planned_minutes: number | null;
  completed: boolean;
  sort_order: number;
};

/**
 * Haftalık ajandanın bir haftalık içeriği.
 * weekStart pazartesi olmalı; aralık o günden itibaren 7 gündür.
 */
export async function getWeekPlan(studentId: string, weekStart: string): Promise<AgendaItem[]> {
  const supabase = await createClient();
  const start = new Date(weekStart + "T00:00:00");
  const end = format(addDays(start, 6), "yyyy-MM-dd");

  const { data } = await supabase
    .from("study_plan_items")
    .select("id, plan_date, title, planned_minutes, completed, sort_order")
    .eq("student_id", studentId)
    .gte("plan_date", weekStart)
    .lte("plan_date", end)
    .order("plan_date")
    .order("sort_order");

  return data ?? [];
}

export type DayCell = {
  date: string;
  label: string;
  questions: number;
  minutes: number;
  planned: number;
  completed: number;
};

/**
 * Ajanda 1. madde — "Gün Gün Çalışma Takibi".
 * Haftanın her günü için çözülen soru, çalışma süresi ve plan durumu.
 */
export async function getWeeklyBreakdown(studentId: string, offsetWeeks = 0) {
  const supabase = await createClient();
  const { start, end, startDate, endDate, weekNo } = weekRange(offsetWeeks);

  const [events, { data: plans }] = await Promise.all([
    getQuestionEvents(studentId, start, end),
    supabase
      .from("study_plan_items")
      .select("plan_date, completed")
      .eq("student_id", studentId)
      .gte("plan_date", start)
      .lte("plan_date", end),
  ]);

  const cells = new Map<string, DayCell>();
  eachDayOfInterval({ start: startDate, end: endDate }).forEach((d) => {
    const key = format(d, "yyyy-MM-dd");
    cells.set(key, {
      date: key,
      label: DAY_LABELS[(d.getDay() + 6) % 7],
      questions: 0,
      minutes: 0,
      planned: 0,
      completed: 0,
    });
  });

  events.forEach((e) => {
    const cell = cells.get(e.date);
    if (!cell) return;
    cell.questions += questionTotal(e);
    cell.minutes += e.minutes ?? 0;
  });

  (plans ?? []).forEach((r) => {
    const cell = cells.get(r.plan_date);
    if (!cell) return;
    cell.planned += 1;
    if (r.completed) cell.completed += 1;
  });

  const days = Array.from(cells.values());
  const totalQuestions = days.reduce((s, d) => s + d.questions, 0);
  const totalMinutes = days.reduce((s, d) => s + d.minutes, 0);
  const totalPlanned = days.reduce((s, d) => s + d.planned, 0);
  const totalCompleted = days.reduce((s, d) => s + d.completed, 0);

  return {
    weekNo,
    start,
    end,
    days,
    totalQuestions,
    totalMinutes,
    totalPlanned,
    totalCompleted,
    adherencePct: totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : null,
    activeDays: days.filter((d) => d.questions > 0).length,
  };
}

const DAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

/**
 * Ajanda 2. madde — "Ağırlıklı Yanlış Yapılan Konular".
 * Son N günde yanlış oranı en yüksek konu/ders kırılımı.
 */
export async function getWeakTopics(studentId: string, days = 14, limit = 6) {
  const from = format(subDays(new Date(), days - 1), "yyyy-MM-dd");

  const events = await getQuestionEvents(studentId, from);

  const byKey = new Map<
    string,
    { subject: string; topic: string; correct: number; wrong: number; blank: number }
  >();

  events.forEach((ev) => {
    const subject = ev.subjectName ?? "Diğer";
    const topic = ev.topicName ?? "Genel";
    const key = `${subject}//${topic}`;
    const e = byKey.get(key) ?? { subject, topic, correct: 0, wrong: 0, blank: 0 };
    e.correct += ev.correct;
    e.wrong += ev.wrong;
    e.blank += ev.blank;
    byKey.set(key, e);
  });

  return Array.from(byKey.values())
    .map((e) => {
      const total = e.correct + e.wrong + e.blank;
      return {
        ...e,
        total,
        errorPct: total > 0 ? Math.round(((e.wrong + e.blank) / total) * 100) : 0,
      };
    })
    .filter((e) => e.total >= 5 && e.wrong > 0)
    .sort((a, b) => b.errorPct - a.errorPct || b.wrong - a.wrong)
    .slice(0, limit);
}

/** Ajanda 6. madde — rutin özeti (uyku / ekran / beslenme / mola). */
export async function getRoutineSummary(studentId: string, days = 7) {
  const supabase = await createClient();
  const from = format(subDays(new Date(), days - 1), "yyyy-MM-dd");

  const { data } = await supabase
    .from("daily_routines")
    .select("log_date, sleep_hours, screen_minutes, nutrition_ok, breaks_ok, mood")
    .eq("student_id", studentId)
    .gte("log_date", from)
    .order("log_date");

  const rows = data ?? [];
  if (rows.length === 0) {
    return { count: 0, avgSleep: null, avgScreen: null, nutritionPct: null, breaksPct: null, rows };
  }

  const sleeps = rows.map((r) => r.sleep_hours).filter((v): v is number => v !== null);
  const screens = rows.map((r) => r.screen_minutes).filter((v): v is number => v !== null);

  return {
    count: rows.length,
    avgSleep: sleeps.length ? Math.round((sleeps.reduce((s, v) => s + v, 0) / sleeps.length) * 10) / 10 : null,
    avgScreen: screens.length ? Math.round(screens.reduce((s, v) => s + v, 0) / screens.length) : null,
    nutritionPct: Math.round((rows.filter((r) => r.nutrition_ok).length / rows.length) * 100),
    breaksPct: Math.round((rows.filter((r) => r.breaks_ok).length / rows.length) * 100),
    rows,
  };
}

/**
 * Hafta içinde girilen denemelerin bölüm bazlı net ortalaması.
 * YKS'de TYT / AYT, LGS'de sayısal / sözel karşılığı gelir.
 */
export async function getWeekExamNets(
  studentId: string,
  start: string,
  end: string,
  config: TrackConfig
) {
  const inWeek = <T extends { exam_date: string }>(rows: T[]) =>
    rows.filter((e) => e.exam_date >= start && e.exam_date <= end);

  const [primaryExams, secondaryExams] = await Promise.all([
    netByExam(studentId, config.primary),
    netByExam(studentId, config.secondary),
  ]);

  const avg = (rows: { net: number }[]) => {
    if (rows.length === 0) return null;
    return Math.round((rows.reduce((s, e) => s + e.net, 0) / rows.length) * 10) / 10;
  };

  const primaryWeek = inWeek(primaryExams);
  const secondaryWeek = inWeek(secondaryExams);

  // Aynı deneme her iki bölüme de girebilir (LGS tam denemesi); listede bir kez
  // görünmesi için id'ye göre tekilleştirilir.
  const seen = new Set<string>();
  const exams = [...primaryWeek, ...secondaryWeek].filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  return {
    primary: avg(primaryWeek),
    secondary: avg(secondaryWeek),
    exams,
  };
}

/**
 * Görüşme formunu ön-dolduran özet paket.
 *
 * `planAnchor` — 7. maddedeki haftalık ajandanın hangi haftayı planladığını
 * belirler. Yeni görüşmede bugünün haftası, mevcut bir görüşme düzenlenirken
 * o görüşmenin tarihini içeren hafta kullanılır. (Değerlendirilen hafta
 * `offsetWeeks` ile geriye bakar; planlanan hafta ise güncel olandır.)
 */
export async function getSessionPrefill(
  studentId: string,
  offsetWeeks = 1,
  planAnchor?: string
) {
  const track = await getStudentTrack(studentId);
  const config = trackConfig(track);
  const planWeekStart = weekStartOf(planAnchor ?? new Date());

  const week = await getWeeklyBreakdown(studentId, offsetWeeks);
  const [nets, weak, routines, planItems] = await Promise.all([
    getWeekExamNets(studentId, week.start, week.end, config),
    getWeakTopics(studentId, 14),
    getRoutineSummary(studentId, 7),
    getWeekPlan(studentId, planWeekStart),
  ]);
  return { week, nets, weak, routines, track, planWeekStart, planItems };
}

/** Bir öğrencinin görüşme listesi (koç: hepsi, öğrenci: paylaşılanlar). */
export async function getWeeklySessions(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("weekly_sessions")
    .select("*")
    .eq("student_id", studentId)
    .order("meeting_date", { ascending: false });
  return data ?? [];
}

export async function getWeeklySession(sessionId: string) {
  const supabase = await createClient();
  const [{ data: session }, { data: actions }] = await Promise.all([
    supabase.from("weekly_sessions").select("*").eq("id", sessionId).maybeSingle(),
    supabase
      .from("session_actions")
      .select("*")
      .eq("session_id", sessionId)
      .order("sort_order"),
  ]);
  return { session, actions: actions ?? [] };
}

/** Öğrencinin açık (yapılmamış) aksiyon maddeleri. */
export async function getOpenActions(studentId: string, limit = 8) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("session_actions")
    .select("id, title, category, done, session_id")
    .eq("student_id", studentId)
    .eq("done", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ============================================================================
// Canlı çalışma oturumları
// ============================================================================

/** Öğrencinin o an açık olan çalışma oturumu (varsa). */
export async function getOpenStudySession(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("study_sessions")
    .select("id, started_at, subject_id, subjects(name), topics(name)")
    .eq("student_id", studentId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    started_at: data.started_at,
    subject_id: data.subject_id,
    subjectName: rel(data.subjects)?.name ?? null,
    topicName: rel(data.topics)?.name ?? null,
  };
}

/** Koç panelinde "şu an çalışıyor" rozetleri için toplu sorgu. */
export async function getOpenStudySessions(studentIds: string[]) {
  if (studentIds.length === 0) return new Map<string, { started_at: string; subjectName: string | null }>();

  const supabase = await createClient();
  const { data } = await supabase
    .from("study_sessions")
    .select("student_id, started_at, subjects(name)")
    .in("student_id", studentIds)
    .is("ended_at", null);

  const map = new Map<string, { started_at: string; subjectName: string | null }>();
  (data ?? []).forEach((row) => {
    map.set(row.student_id, {
      started_at: row.started_at,
      subjectName: rel(row.subjects)?.name ?? null,
    });
  });
  return map;
}

/** Son tamamlanan çalışma oturumları — öğrenci panelindeki canlı akış. */
export async function getRecentStudySessions(studentId: string, limit = 5) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("study_sessions")
    .select("id, started_at, ended_at, minutes, note, subjects(name)")
    .eq("student_id", studentId)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    minutes: row.minutes,
    note: row.note,
    subjectName: rel(row.subjects)?.name ?? null,
  }));
}
