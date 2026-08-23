import { createClient } from "@/lib/supabase/server";
import { rel } from "@/lib/rel";
import {
  subDays,
  format,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  getISOWeek,
} from "date-fns";

type SubjectRef = { name: string } | null;

type GoalRow = {
  id: string;
  goal_type: string;
  subject_id: string | null;
  target_value: number;
  subjects: SubjectRef | SubjectRef[];
};

export async function getSubjects() {
  const supabase = await createClient();
  const { data } = await supabase.from("subjects").select("*").order("sort_order");
  return data ?? [];
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
export async function getDailyQuestionTrend(studentId: string, days = 14) {
  const supabase = await createClient();
  const from = format(subDays(new Date(), days - 1), "yyyy-MM-dd");

  const { data } = await supabase
    .from("daily_logs")
    .select("log_date, correct_count, wrong_count, blank_count")
    .eq("student_id", studentId)
    .gte("log_date", from);

  const byDate = new Map<string, number>();
  (data ?? []).forEach((row) => {
    const total = row.correct_count + row.wrong_count + row.blank_count;
    byDate.set(row.log_date, (byDate.get(row.log_date) ?? 0) + total);
  });

  const interval = eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() });
  return interval.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    return { x: format(d, "d MMM"), y: byDate.get(key) ?? 0 };
  });
}

/** Ders bazlı doğru/yanlış/boş toplamları (son N gün). */
export async function getSubjectBreakdown(studentId: string, days = 30) {
  const supabase = await createClient();
  const from = format(subDays(new Date(), days - 1), "yyyy-MM-dd");

  const { data } = await supabase
    .from("daily_logs")
    .select("correct_count, wrong_count, blank_count, subject_id, subjects(name)")
    .eq("student_id", studentId)
    .gte("log_date", from);

  const byId = new Map<
    string,
    { label: string; correct: number; wrong: number; blank: number }
  >();

  (data ?? []).forEach((row) => {
    const name = rel(row.subjects)?.name ?? "Diğer";
    const entry = byId.get(row.subject_id) ?? { label: name, correct: 0, wrong: 0, blank: 0 };
    entry.correct += row.correct_count;
    entry.wrong += row.wrong_count;
    entry.blank += row.blank_count;
    byId.set(row.subject_id, entry);
  });

  return Array.from(byId.values()).sort(
    (a, b) => b.correct + b.wrong + b.blank - (a.correct + a.wrong + a.blank)
  );
}

/** Deneme sınavı toplam net trendi (TYT/AYT ayrı ayrı). */
export async function getExamNetTrend(studentId: string, examType: "TYT" | "AYT") {
  const supabase = await createClient();
  const { data: exams } = await supabase
    .from("exams")
    .select("id, exam_date, name")
    .eq("student_id", studentId)
    .eq("exam_type", examType)
    .order("exam_date");

  if (!exams || exams.length === 0) return [];

  const { data: results } = await supabase
    .from("exam_results")
    .select("exam_id, net")
    .in(
      "exam_id",
      exams.map((e) => e.id)
    );

  const netByExam = new Map<string, number>();
  (results ?? []).forEach((r) => {
    netByExam.set(r.exam_id, (netByExam.get(r.exam_id) ?? 0) + Number(r.net));
  });

  return exams.map((e) => ({
    x: format(new Date(e.exam_date), "d MMM"),
    y: Math.round((netByExam.get(e.id) ?? 0) * 10) / 10,
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
        const { data } = await supabase
          .from("daily_logs")
          .select("correct_count, wrong_count, blank_count")
          .eq("student_id", studentId)
          .eq("log_date", today);
        current = (data ?? []).reduce(
          (s, r) => s + r.correct_count + r.wrong_count + r.blank_count,
          0
        );
      } else if (g.goal_type === "weekly_questions") {
        const from = format(subDays(new Date(), 6), "yyyy-MM-dd");
        const { data } = await supabase
          .from("daily_logs")
          .select("correct_count, wrong_count, blank_count")
          .eq("student_id", studentId)
          .gte("log_date", from);
        current = (data ?? []).reduce(
          (s, r) => s + r.correct_count + r.wrong_count + r.blank_count,
          0
        );
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

  const [{ data: logs }, { data: plans }] = await Promise.all([
    supabase
      .from("daily_logs")
      .select("log_date, correct_count, wrong_count, blank_count, duration_minutes")
      .eq("student_id", studentId)
      .gte("log_date", start)
      .lte("log_date", end),
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

  (logs ?? []).forEach((r) => {
    const cell = cells.get(r.log_date);
    if (!cell) return;
    cell.questions += r.correct_count + r.wrong_count + r.blank_count;
    cell.minutes += r.duration_minutes ?? 0;
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
  const supabase = await createClient();
  const from = format(subDays(new Date(), days - 1), "yyyy-MM-dd");

  const { data } = await supabase
    .from("daily_logs")
    .select("correct_count, wrong_count, blank_count, subjects(name), topics(name)")
    .eq("student_id", studentId)
    .gte("log_date", from);

  const byKey = new Map<
    string,
    { subject: string; topic: string; correct: number; wrong: number; blank: number }
  >();

  (data ?? []).forEach((row) => {
    const subject = rel(row.subjects)?.name ?? "Diğer";
    const topic = rel(row.topics)?.name ?? "Genel";
    const key = `${subject}//${topic}`;
    const e = byKey.get(key) ?? { subject, topic, correct: 0, wrong: 0, blank: 0 };
    e.correct += row.correct_count;
    e.wrong += row.wrong_count;
    e.blank += row.blank_count;
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

/** Hafta içinde girilen denemelerin net ortalaması (TYT / AYT). */
export async function getWeekExamNets(studentId: string, start: string, end: string) {
  const supabase = await createClient();
  const { data: exams } = await supabase
    .from("exams")
    .select("id, exam_type, name, exam_date")
    .eq("student_id", studentId)
    .gte("exam_date", start)
    .lte("exam_date", end);

  if (!exams || exams.length === 0) return { tyt: null, ayt: null, exams: [] };

  const { data: results } = await supabase
    .from("exam_results")
    .select("exam_id, net")
    .in("exam_id", exams.map((e) => e.id));

  const netByExam = new Map<string, number>();
  (results ?? []).forEach((r) => {
    netByExam.set(r.exam_id, (netByExam.get(r.exam_id) ?? 0) + Number(r.net));
  });

  const withNet = exams.map((e) => ({
    ...e,
    net: Math.round((netByExam.get(e.id) ?? 0) * 10) / 10,
  }));

  const avg = (type: string) => {
    const list = withNet.filter((e) => e.exam_type === type);
    if (list.length === 0) return null;
    return Math.round((list.reduce((s, e) => s + e.net, 0) / list.length) * 10) / 10;
  };

  return { tyt: avg("TYT"), ayt: avg("AYT"), exams: withNet };
}

/** Görüşme formunu ön-dolduran özet paket. */
export async function getSessionPrefill(studentId: string, offsetWeeks = 1) {
  const week = await getWeeklyBreakdown(studentId, offsetWeeks);
  const [nets, weak, routines] = await Promise.all([
    getWeekExamNets(studentId, week.start, week.end),
    getWeakTopics(studentId, 14),
    getRoutineSummary(studentId, 7),
  ]);
  return { week, nets, weak, routines };
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
