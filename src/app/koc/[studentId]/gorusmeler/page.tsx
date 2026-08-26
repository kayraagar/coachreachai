import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWeeklySessions } from "@/lib/queries";
import { PageHeader, Reveal, EmptyState } from "@/components/ui/Reveal";
import { IconArrowRight } from "@/components/ui/Icons";
import { formatDate, formatDuration } from "@/lib/labels";
import { asTrack, trackConfig } from "@/lib/track";

export default async function KocGorusmelerPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("profiles")
    .select("id, full_name, email, track")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) notFound();

  const config = trackConfig(asTrack(student.track));
  const sessions = await getWeeklySessions(studentId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Haftalık görüşmeler"
        subtitle={`${config.label} · ${student.full_name || student.email}`}
        actions={
          <>
            <Link href={`/koc/${studentId}`} className="btn btn-ghost">
              ← Öğrenci paneli
            </Link>
            <Link href={`/koc/${studentId}/gorusmeler/yeni`} className="btn btn-primary">
              Yeni görüşme
            </Link>
          </>
        }
      />

      {sessions.length === 0 ? (
        <Reveal className="card">
          <EmptyState
            title="Henüz görüşme kaydı yok"
            hint="“Yeni görüşme” ile haftalık ajandayı doldurmaya başla; sayısal alanlar otomatik dolar."
          />
        </Reveal>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sessions.map((s, i) => (
            <Reveal key={s.id} delay={i * 60}>
              <Link
                href={`/koc/${studentId}/gorusmeler/${s.id}`}
                className="card card-hover group flex h-full flex-col gap-3 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip chip-accent">{s.week_no}. hafta</span>
                    <span className={s.status === "shared" ? "chip chip-good" : "chip chip-warn"}>
                      {s.status === "shared" ? "Paylaşıldı" : "Taslak"}
                    </span>
                  </div>
                  <IconArrowRight className="mt-1 transition-transform duration-200 group-hover:translate-x-1" />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {formatDate(s.meeting_date)} · {formatDuration(s.duration_minutes)}
                </p>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {s.main_focus || "Ana odak belirtilmedi"}
                </p>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <span className="chip">{s.total_questions ?? "—"} soru</span>
                  <span className="chip">
                    {s.adherence_pct === null ? "uyum —" : `%${s.adherence_pct} uyum`}
                  </span>
                  {s[config.primary.key] !== null && (
                    <span className="chip">
                      {config.primary.label} {s[config.primary.key]}
                    </span>
                  )}
                  {s[config.secondary.key] !== null && (
                    <span className="chip">
                      {config.secondary.label} {s[config.secondary.key]}
                    </span>
                  )}
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
