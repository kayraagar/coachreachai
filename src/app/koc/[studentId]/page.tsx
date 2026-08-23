import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rel } from "@/lib/rel";
import {
  getDailyQuestionTrend,
  getSubjectBreakdown,
  getExamNetTrend,
  getGoalsWithProgress,
  getPlanAdherence,
  getWeeklyBreakdown,
  getWeakTopics,
  getRoutineSummary,
  getOpenStudySession,
} from "@/lib/queries";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { StatTile } from "@/components/charts/StatTile";
import { ProgressBar, MiniMeter } from "@/components/charts/ProgressBar";
import { WeekStrip } from "@/components/charts/WeekStrip";
import { GoalForm } from "@/components/forms/GoalForm";
import { NoteForm } from "@/components/forms/NoteForm";
import { deactivateGoal } from "@/lib/actions/goals";
import { PageHeader, Panel, Reveal, EmptyState } from "@/components/ui/Reveal";
import { IconArrowRight, IconSpark } from "@/components/ui/Icons";
import { PresenceDot } from "@/components/realtime/PresenceProvider";
import { ElapsedShort } from "@/components/realtime/Elapsed";
import { MOOD_LABEL, formatDate, formatDuration, formatShortDate } from "@/lib/labels";

export default async function OgrenciDetayPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("profiles")
    .select("id, full_name, email, target_exam_date")
    .eq("id", studentId)
    .maybeSingle();

  if (!student) notFound();

  const [
    subjectsRes,
    trend,
    breakdown,
    tytNet,
    aytNet,
    goals,
    plan,
    week,
    prevWeek,
    weak,
    routines,
    notesRes,
    sessionsRes,
    liveSession,
  ] = await Promise.all([
    supabase.from("subjects").select("*").order("sort_order"),
    getDailyQuestionTrend(studentId, 14),
    getSubjectBreakdown(studentId, 30),
    getExamNetTrend(studentId, "TYT"),
    getExamNetTrend(studentId, "AYT"),
    getGoalsWithProgress(studentId),
    getPlanAdherence(studentId, 14),
    getWeeklyBreakdown(studentId, 0),
    getWeeklyBreakdown(studentId, 1),
    getWeakTopics(studentId, 14),
    getRoutineSummary(studentId, 7),
    supabase
      .from("notes")
      .select("id, note_date, content, mood, profiles!notes_author_id_fkey(full_name, role)")
      .eq("student_id", studentId)
      .order("note_date", { ascending: false })
      .limit(8),
    supabase
      .from("weekly_sessions")
      .select("id, week_no, meeting_date, status, main_focus")
      .eq("student_id", studentId)
      .order("meeting_date", { ascending: false })
      .limit(3),
    getOpenStudySession(studentId),
  ]);

  const weekDelta =
    prevWeek.totalQuestions > 0
      ? Math.round(
          ((week.totalQuestions - prevWeek.totalQuestions) / prevWeek.totalQuestions) * 100
        )
      : null;
  const lastTytNet = tytNet[tytNet.length - 1]?.y;
  const lastAytNet = aytNet[aytNet.length - 1]?.y;
  const sessions = sessionsRes.data ?? [];

  const summary = buildSummary({
    name: student.full_name || student.email,
    weekTotal: week.totalQuestions,
    weekMinutes: week.totalMinutes,
    weekDelta,
    planPct: plan.pct,
    lastTytNet,
    lastAytNet,
    weakTop: weak[0],
    avgSleep: routines.avgSleep,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={student.full_name || student.email}
        subtitle={`${student.email}${
          student.target_exam_date ? ` · Hedef sınav: ${formatDate(student.target_exam_date)}` : ""
        }`}
        actions={
          <>
            <span className="chip">
              <PresenceDot userId={studentId} /> Çevrimiçi durumu
            </span>
            <Link href={`/koc/${studentId}/gorusmeler`} className="btn btn-ghost">
              Görüşmeler
            </Link>
            <Link href={`/koc/${studentId}/gorusmeler/yeni`} className="btn btn-primary">
              Haftalık görüşme
            </Link>
          </>
        }
      />

      {liveSession && (
        <Reveal as="section" className="card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="live-dot h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--status-good)" }}
            />
            <span className="text-sm font-medium" style={{ color: "var(--status-good)" }}>
              Şu an çalışıyor
              {liveSession.subjectName ? ` · ${liveSession.subjectName}` : ""}
              {liveSession.topicName ? ` · ${liveSession.topicName}` : ""}
            </span>
            <span className="tabular ml-auto text-sm" style={{ color: "var(--text-secondary)" }}>
              <ElapsedShort since={liveSession.started_at} />
            </span>
          </div>
        </Reveal>
      )}

      {/* --- görüşmeye hazırlık özeti --- */}
      <Reveal as="section" className="card card-glow p-5">
        <div className="flex items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <IconSpark />
          </span>
          <div>
            <h2 className="section-title">Görüşme hazırlık özeti</h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {summary}
            </p>
          </div>
        </div>
      </Reveal>

      <div className="flex flex-wrap gap-3">
        <StatTile
          label="Bu hafta soru"
          value={week.totalQuestions}
          tone="accent"
          hint={
            weekDelta !== null
              ? `${weekDelta >= 0 ? "+" : ""}%${Math.abs(weekDelta)} önceki haftaya göre`
              : undefined
          }
          delay={0}
        />
        <StatTile
          label="Bu hafta çalışma"
          value={formatDuration(week.totalMinutes)}
          hint={`${week.activeDays}/7 aktif gün`}
          delay={60}
        />
        <StatTile
          label="Program uyumu (14 gün)"
          value={plan.pct === null ? "—" : `%${plan.pct}`}
          tone={plan.pct === null ? "neutral" : plan.pct >= 70 ? "good" : "warning"}
          delay={120}
        />
        <StatTile
          label="Son TYT net"
          value={lastTytNet !== undefined ? lastTytNet : "—"}
          decimals={1}
          delay={180}
        />
        <StatTile
          label="Son AYT net"
          value={lastAytNet !== undefined ? lastAytNet : "—"}
          decimals={1}
          delay={240}
        />
      </div>

      <Panel
        title="Gün gün çalışma takibi"
        hint={`${week.start} – ${week.end}`}
        delay={80}
      >
        <WeekStrip days={week.days} delay={120} />
      </Panel>

      {/* --- son görüşmeler --- */}
      <Panel
        title="Haftalık görüşmeler"
        hint="Ajanda kayıtları"
        delay={110}
        actions={
          <Link href={`/koc/${studentId}/gorusmeler`} className="btn btn-quiet">
            Tümü →
          </Link>
        }
      >
        {sessions.length === 0 ? (
          <EmptyState
            title="Henüz görüşme kaydı yok"
            hint="Haftalık görüşme ajandasını doldurarak ilk kaydı oluşturabilirsin."
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {sessions.map((s, i) => (
              <li key={s.id}>
                <Link
                  href={`/koc/${studentId}/gorusmeler/${s.id}`}
                  className="row-hover animate-pop flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{ ["--d" as string]: `${i * 60}ms` }}
                >
                  <span className="chip chip-accent shrink-0">{s.week_no}. hafta</span>
                  <span className="flex-1 truncate text-sm" style={{ color: "var(--text-primary)" }}>
                    {s.main_focus || "Ana odak belirtilmedi"}
                  </span>
                  <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatShortDate(s.meeting_date)}
                  </span>
                  {s.status === "draft" && <span className="chip chip-warn shrink-0">Taslak</span>}
                  <IconArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* --- ağırlıklı yanlış yapılan konular --- */}
      <Panel title="Ağırlıklı yanlış yapılan konular" hint="Son 14 gün · hata oranına göre" delay={140}>
        {weak.length === 0 ? (
          <EmptyState
            title="Yeterli veri yok"
            hint="Öğrenci konu seçerek soru girişi yaptıkça bu liste dolar."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {weak.map((w, i) => (
              <li key={`${w.subject}-${w.topic}`} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span style={{ color: "var(--text-primary)" }}>
                    {w.subject} <span style={{ color: "var(--text-muted)" }}>· {w.topic}</span>
                  </span>
                  <span className="tabular whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                    %{w.errorPct} hata · {w.wrong}Y / {w.total} soru
                  </span>
                </div>
                <MiniMeter
                  value={w.errorPct}
                  tone={w.errorPct >= 50 ? "var(--status-critical)" : "var(--status-warning)"}
                  delay={200 + i * 70}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* --- rutinler --- */}
      <Panel title="Genel rutinler" hint="Öğrencinin son 7 günlük kaydı" delay={170}>
        {routines.count === 0 ? (
          <EmptyState title="Öğrenci henüz rutin kaydı girmemiş" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat
              label="Ortalama uyku"
              value={routines.avgSleep === null ? "—" : `${routines.avgSleep} sa`}
              warn={routines.avgSleep !== null && routines.avgSleep < 6.5}
            />
            <MiniStat
              label="Ortalama ekran"
              value={routines.avgScreen === null ? "—" : formatDuration(routines.avgScreen)}
              warn={routines.avgScreen !== null && routines.avgScreen > 180}
            />
            <MiniStat
              label="Beslenme"
              value={`%${routines.nutritionPct}`}
              warn={(routines.nutritionPct ?? 0) < 50}
            />
            <MiniStat
              label="Mola / nefes"
              value={`%${routines.breaksPct}`}
              warn={(routines.breaksPct ?? 0) < 50}
            />
          </div>
        )}
      </Panel>

      {/* --- hedefler --- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Aktif hedefler" delay={200}>
          {goals.length === 0 ? (
            <EmptyState title="Henüz hedef atanmadı" />
          ) : (
            <div className="flex flex-col gap-4">
              {goals.map((g, i) => (
                <div key={g.id} className="flex flex-col gap-1.5">
                  <ProgressBar
                    label={g.label}
                    current={g.current}
                    target={g.target}
                    unit={g.unit}
                    delay={240 + i * 90}
                  />
                  <form action={deactivateGoal.bind(null, g.id, studentId)}>
                    <button className="btn btn-quiet self-start">Hedefi kapat</button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Reveal delay={240}>
          <GoalForm studentId={studentId} subjects={subjectsRes.data ?? []} />
        </Reveal>
      </div>

      <Panel title="Günlük çözülen soru trendi" hint="Son 14 gün" delay={260}>
        <LineChart series={[{ name: "Toplam soru", points: trend }]} />
      </Panel>

      <Panel title="Ders bazlı dağılım" hint="Son 30 gün" delay={290}>
        <BarChart data={breakdown} />
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="TYT net trendi" delay={320}>
          <LineChart series={[{ name: "TYT net", points: tytNet }]} decimals={1} />
        </Panel>
        <Panel title="AYT net trendi" delay={350}>
          <LineChart series={[{ name: "AYT net", points: aytNet }]} decimals={1} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Reveal delay={380}>
          <NoteForm studentId={studentId} />
        </Reveal>
        <Panel title="Son notlar" delay={410}>
          {(notesRes.data ?? []).length === 0 ? (
            <EmptyState title="Henüz not yok" />
          ) : (
            <ul className="flex flex-col gap-3">
              {(notesRes.data ?? []).map((n, i) => (
                <li
                  key={n.id}
                  className="animate-pop border-b pb-3 last:border-0 last:pb-0"
                  style={{ borderColor: "var(--gridline)", ["--d" as string]: `${i * 60}ms` }}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span>{formatShortDate(n.note_date)}</span>
                    <span>·</span>
                    <span>
                      {rel(n.profiles)?.full_name} ({rel(n.profiles)?.role === "coach" ? "Koç" : "Öğrenci"})
                    </span>
                    {n.mood && <span className="chip">{MOOD_LABEL[n.mood as keyof typeof MOOD_LABEL]}</span>}
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                    {n.content}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function MiniStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="surface-inset px-3.5 py-3">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p
        className="tabular mt-0.5 text-lg font-semibold"
        style={{ color: warn ? "var(--status-warning)" : "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}

/** Görüşmeye girmeden önce koçun okuyacağı 3–4 cümlelik durum özeti. */
function buildSummary({
  name,
  weekTotal,
  weekMinutes,
  weekDelta,
  planPct,
  lastTytNet,
  lastAytNet,
  weakTop,
  avgSleep,
}: {
  name: string;
  weekTotal: number;
  weekMinutes: number;
  weekDelta: number | null;
  planPct: number | null;
  lastTytNet?: number;
  lastAytNet?: number;
  weakTop?: { subject: string; topic: string; errorPct: number };
  avgSleep: number | null;
}) {
  const parts: string[] = [];
  parts.push(
    `${name} bu hafta ${weekTotal} soru çözdü ve ${formatDuration(weekMinutes)} çalıştı.`
  );
  if (weekDelta !== null) {
    parts.push(
      weekDelta >= 0
        ? `Bu, önceki haftaya göre %${weekDelta} artış.`
        : `Bu, önceki haftaya göre %${Math.abs(weekDelta)} düşüş — sebebini birlikte konuşmakta fayda var.`
    );
  }
  if (planPct !== null) {
    parts.push(
      planPct >= 70
        ? `Programa uyumu iyi durumda (%${planPct}).`
        : `Programa uyumu düşük (%${planPct}) — planı gözden geçirmek gerekebilir.`
    );
  }
  if (weakTop) {
    parts.push(
      `En çok zorlandığı yer ${weakTop.subject} · ${weakTop.topic} (%${weakTop.errorPct} hata).`
    );
  }
  if (lastTytNet !== undefined) parts.push(`Son TYT denemesi ${lastTytNet.toFixed(1)} net.`);
  if (lastAytNet !== undefined) parts.push(`Son AYT denemesi ${lastAytNet.toFixed(1)} net.`);
  if (avgSleep !== null && avgSleep < 6.5) {
    parts.push(`Ortalama uykusu ${avgSleep} saat — rutin başlığında ele alınmalı.`);
  }
  return parts.join(" ");
}
