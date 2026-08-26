import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getWeeklyBreakdown, getOpenActions, getOpenStudySessions } from "@/lib/queries";
import { PageHeader, Reveal, EmptyState } from "@/components/ui/Reveal";
import { WeekStrip } from "@/components/charts/WeekStrip";
import { IconArrowRight } from "@/components/ui/Icons";
import { PresenceDot } from "@/components/realtime/PresenceProvider";
import { ElapsedShort } from "@/components/realtime/Elapsed";
import { daysSince, formatDuration, formatShortDate } from "@/lib/labels";
import { asTrack, trackConfig } from "@/lib/track";

export default async function KocOgrencilerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: students } = await supabase
    .from("profiles")
    .select("id, full_name, email, target_exam_date, track")
    .eq("coach_id", user!.id)
    .order("full_name");

  const liveSessions = await getOpenStudySessions((students ?? []).map((s) => s.id));

  const rows = await Promise.all(
    (students ?? []).map(async (s) => {
      const [week, openActions, lastSession] = await Promise.all([
        getWeeklyBreakdown(s.id, 0),
        getOpenActions(s.id, 20),
        supabase
          .from("weekly_sessions")
          .select("id, week_no, meeting_date, status")
          .eq("student_id", s.id)
          .order("meeting_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const last = lastSession.data;
      return {
        ...s,
        week,
        openActions: openActions.length,
        lastSession: last,
        stale: daysSince(last?.meeting_date) > 9,
        live: liveSessions.get(s.id) ?? null,
      };
    })
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Öğrencilerim"
        subtitle={`${rows.length} öğrenci · bu haftanın çalışma tablosu`}
      />

      {rows.length === 0 ? (
        <Reveal className="card">
          <EmptyState
            title="Henüz öğrencin yok"
            hint="Öğrencilerin kayıt olurken kenar çubuğundaki koç kodunu (e-posta adresini) girmeli."
          />
        </Reveal>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {rows.map((s, i) => {
            return (
              <Reveal key={s.id} delay={i * 70}>
                <article className="card card-hover flex h-full flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold"
                        style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                      >
                        {(s.full_name || s.email)
                          .split(" ")
                          .slice(0, 2)
                          .map((w: string) => w[0]?.toUpperCase())
                          .join("")}
                      </span>
                      <div>
                        <p className="flex items-center gap-2 font-medium" style={{ color: "var(--text-primary)" }}>
                          {s.full_name || s.email}
                          <PresenceDot userId={s.id} />
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {s.email}
                        </p>
                      </div>
                    </div>
                    <Link href={`/koc/${s.id}`} className="btn btn-ghost !px-3 !py-1.5 !text-xs">
                      Detay <IconArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  {s.live && (
                    <div
                      className="animate-slide-down flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
                      style={{ background: "var(--status-good-soft)", color: "var(--status-good)" }}
                    >
                      <span
                        className="live-dot h-2 w-2 rounded-full"
                        style={{ background: "var(--status-good)" }}
                      />
                      <span className="font-medium">
                        Şu an çalışıyor{s.live.subjectName ? ` · ${s.live.subjectName}` : ""}
                      </span>
                      <span className="ml-auto tabular text-xs">
                        <ElapsedShort since={s.live.started_at} />
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <span className="chip chip-accent">{trackConfig(asTrack(s.track)).label}</span>
                    <span className={s.week.totalQuestions === 0 ? "chip chip-bad" : "chip"}>
                      {s.week.totalQuestions} soru / hafta
                    </span>
                    <span className="chip">{formatDuration(s.week.totalMinutes)}</span>
                    <span
                      className={
                        s.week.adherencePct === null
                          ? "chip"
                          : s.week.adherencePct >= 70
                          ? "chip chip-good"
                          : "chip chip-warn"
                      }
                    >
                      {s.week.adherencePct === null ? "plan yok" : `%${s.week.adherencePct} uyum`}
                    </span>
                    {s.openActions > 0 && (
                      <span className="chip chip-accent">{s.openActions} açık aksiyon</span>
                    )}
                  </div>

                  <WeekStrip days={s.week.days} delay={i * 70 + 120} />

                  <div
                    className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs"
                    style={{ borderColor: "var(--border-hairline)" }}
                  >
                    <span style={{ color: s.stale ? "var(--status-warning)" : "var(--text-muted)" }}>
                      {s.lastSession
                        ? `Son görüşme: ${s.lastSession.week_no}. hafta · ${formatShortDate(
                            s.lastSession.meeting_date
                          )}${s.lastSession.status === "draft" ? " (taslak)" : ""}`
                        : "Henüz görüşme kaydı yok"}
                    </span>
                    <Link
                      href={`/koc/${s.id}/gorusmeler/yeni`}
                      className="btn btn-primary !px-3 !py-1.5 !text-xs"
                    >
                      Haftalık görüşme
                    </Link>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
