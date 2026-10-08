import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getDailyQuestionTrend,
  getDailyStudyTrend,
  getSubjectBreakdown,
  getExamNetTrend,
  getGoalsWithProgress,
  getPlanAdherence,
  getWeeklyBreakdown,
  getRoutineSummary,
  getOpenActions,
  getOpenStudySession,
  getRecentStudySessions,
  getCatalog,
  getStudentTrack,
} from "@/lib/queries";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { StatTile } from "@/components/charts/StatTile";
import { ProgressBar } from "@/components/charts/ProgressBar";
import { WeekStrip } from "@/components/charts/WeekStrip";
import { PageHeader, Panel, Reveal, EmptyState } from "@/components/ui/Reveal";
import { ActionChecklist } from "@/components/session/ActionChecklist";
import { IconArrowRight, IconTarget } from "@/components/ui/Icons";
import { formatDuration, formatShortDate } from "@/lib/labels";
import { StudyTimer } from "@/components/realtime/StudyTimer";
import { LinkCoachForm } from "@/components/forms/LinkCoachForm";
import type { SessionAction } from "@/lib/database.types";
import { trackConfig } from "@/lib/track";

export default async function OgrenciDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const studentId = user!.id;

  // Panelin ders kataloğu, net başlıkları ve deneme türleri öğrencinin
  // hazırlandığı sınava göre kurulur.
  const track = await getStudentTrack(studentId);
  const config = trackConfig(track);

  const [
    trend,
    studyTrend,
    breakdown,
    primaryNet,
    secondaryNet,
    goals,
    plan,
    week,
    routines,
    openActions,
    lastSession,
    openSession,
    recentSessions,
    catalog,
    profileRes,
  ] = await Promise.all([
      getDailyQuestionTrend(studentId, 14),
      getDailyStudyTrend(studentId, 14),
      getSubjectBreakdown(studentId, 30),
      getExamNetTrend(studentId, config.primary),
      getExamNetTrend(studentId, config.secondary),
      getGoalsWithProgress(studentId),
      getPlanAdherence(studentId, 14),
      getWeeklyBreakdown(studentId, 0),
      getRoutineSummary(studentId, 7),
      getOpenActions(studentId),
      supabase
        .from("weekly_sessions")
        .select("id, week_no, meeting_date, main_focus, planned_exams, coach_feedback")
        .eq("student_id", studentId)
        .eq("status", "shared")
        .order("meeting_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getOpenStudySession(studentId),
      getRecentStudySessions(studentId, 5),
      getCatalog(track),
      supabase.from("profiles").select("coach_id").eq("id", studentId).maybeSingle(),
    ]);

  const today = trend[trend.length - 1]?.y ?? 0;
  const dailyGoal = goals.find((g) => g.label === "Günlük soru hedefi");
  const focus = lastSession.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Panelim"
        subtitle={`${config.label} · haftalık görüşme ajandanla aynı başlıklar üzerinden ilerlemen`}
      />

      {/* --- bu haftanın odağı --- */}
      {focus && (focus.main_focus || openActions.length > 0) && (
        <Reveal as="section" className="card card-glow p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                <IconTarget />
              </span>
              <div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {focus.week_no}. hafta görüşmesinden — bu haftanın ana odağı
                </p>
                <p className="mt-0.5 text-base font-medium" style={{ color: "var(--text-primary)" }}>
                  {focus.main_focus || "Odak belirtilmedi"}
                </p>
                {focus.planned_exams && (
                  <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                    Planlanan deneme: {focus.planned_exams}
                  </p>
                )}
              </div>
            </div>
            <Link href="/ogrenci/gorusmeler" className="btn btn-ghost">
              Görüşmeler <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {openActions.length > 0 && (
            <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border-hairline)" }}>
              <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Açık aksiyon maddelerin ({openActions.length})
              </p>
              <ActionChecklist actions={openActions as SessionAction[]} interactive />
            </div>
          )}
        </Reveal>
      )}

      {!profileRes.data?.coach_id && <LinkCoachForm />}

      <StudyTimer open={openSession} subjects={catalog.subjects} topics={catalog.topics} />

      {/* --- özet kutuları --- */}
      <div className="flex flex-wrap gap-3">
        <StatTile label="Bugün çözülen soru" value={today} delay={0} />
        <StatTile label="Bu hafta çözülen soru" value={week.totalQuestions} tone="accent" delay={60} />
        <StatTile
          label="Bu hafta çalışma"
          value={formatDuration(week.totalMinutes)}
          hint={`${week.activeDays}/7 aktif gün`}
          delay={120}
        />
        <StatTile
          label="Program uyumu (14 gün)"
          value={plan.pct === null ? "—" : `%${plan.pct}`}
          tone={plan.pct === null ? "neutral" : plan.pct >= 70 ? "good" : "warning"}
          hint={plan.totalPlanned > 0 ? `${plan.totalCompleted}/${plan.totalPlanned} görev` : "Henüz plan yok"}
          delay={180}
        />
      </div>

      {/* --- gün gün çalışma takibi --- */}
      <Panel
        title="Gün gün çalışma takibi"
        hint={`${week.start} – ${week.end} · toplam ${week.totalQuestions} soru`}
        delay={80}
      >
        <WeekStrip days={week.days} delay={120} />
      </Panel>

      {recentSessions.length > 0 && (
        <Panel title="Son çalışma oturumların" hint="Kronometreyle kaydedilenler" delay={100}>
          <ul className="flex flex-col gap-1">
            {recentSessions.map((r, i) => (
              <li
                key={r.id}
                className="row-hover animate-pop flex items-center gap-3 rounded-lg px-2 py-2"
                style={{ ["--d" as string]: `${i * 50}ms` }}
              >
                <span className="chip shrink-0">{r.subjectName ?? "Genel"}</span>
                <span className="flex-1 truncate text-sm" style={{ color: "var(--text-secondary)" }}>
                  {r.note || "—"}
                </span>
                <span className="tabular shrink-0 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {formatDuration(r.minutes)}
                </span>
                <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
                  {formatShortDate(r.ended_at?.slice(0, 10) ?? null)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {goals.length > 0 && (
        <Panel title="Hedeflerim" delay={120}>
          <div className="flex flex-col gap-4">
            {goals.map((g, i) => (
              <ProgressBar
                key={g.id}
                label={g.label}
                current={g.current}
                target={g.target}
                unit={g.unit}
                delay={200 + i * 90}
              />
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Günlük çözülen soru trendi" hint="Son 14 gün" delay={160}>
        <LineChart
          series={[{ name: "Toplam soru", points: trend }]}
          targetValue={dailyGoal?.target}
          targetLabel={dailyGoal ? `Hedef: ${dailyGoal.target}` : undefined}
        />
      </Panel>

      <Panel title="Günlük çalışma süresi" hint="Son 14 gün · saat" delay={180}>
        <LineChart series={[{ name: "Çalışma (saat)", points: studyTrend }]} decimals={1} />
      </Panel>

      <Panel title="Ders bazlı dağılım" hint="Son 30 gün" delay={200}>
        <BarChart data={breakdown} />
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={`${config.primary.label} trendi`} delay={240}>
          <LineChart series={[{ name: config.primary.label, points: primaryNet }]} decimals={1} />
        </Panel>
        <Panel title={`${config.secondary.label} trendi`} delay={280}>
          <LineChart series={[{ name: config.secondary.label, points: secondaryNet }]} decimals={1} />
        </Panel>
      </div>

      <Panel
        title="Genel rutinler"
        hint="Son 7 gün"
        delay={320}
        actions={
          <Link href="/ogrenci/rutinler" className="btn btn-quiet">
            Kaydet →
          </Link>
        }
      >
        {routines.count === 0 ? (
          <EmptyState
            title="Henüz rutin kaydın yok"
            hint="Uyku, ekran süresi, beslenme ve molaları günlük işaretlersen koçun görüşmede bu veriye bakabilir."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <RoutineStat label="Ortalama uyku" value={routines.avgSleep === null ? "—" : `${routines.avgSleep} sa`} />
            <RoutineStat
              label="Ortalama ekran"
              value={routines.avgScreen === null ? "—" : formatDuration(routines.avgScreen)}
            />
            <RoutineStat label="Beslenme" value={`%${routines.nutritionPct}`} />
            <RoutineStat label="Mola / nefes" value={`%${routines.breaksPct}`} />
          </div>
        )}
      </Panel>
    </div>
  );
}

function RoutineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-inset px-3.5 py-3">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="tabular mt-0.5 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}
