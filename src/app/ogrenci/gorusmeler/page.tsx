import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Reveal, EmptyState } from "@/components/ui/Reveal";
import { IconArrowRight } from "@/components/ui/Icons";
import { formatDate, formatDuration } from "@/lib/labels";

export default async function OgrenciGorusmelerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: sessions } = await supabase
    .from("weekly_sessions")
    .select("id, week_no, meeting_date, duration_minutes, main_focus, total_questions, adherence_pct")
    .eq("student_id", user!.id)
    .eq("status", "shared")
    .order("meeting_date", { ascending: false });

  const rows = sessions ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Görüşmeler"
        subtitle="Koçunla yaptığın haftalık görüşmelerin ajandası ve kararları"
      />

      {rows.length === 0 ? (
        <Reveal className="card">
          <EmptyState
            title="Henüz paylaşılmış bir görüşme yok"
            hint="Koçun haftalık görüşme ajandasını doldurup paylaştığında burada görünecek."
          />
        </Reveal>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((s, i) => (
            <Reveal key={s.id} delay={i * 60}>
              <Link
                href={`/ogrenci/gorusmeler/${s.id}`}
                className="card card-hover group flex h-full flex-col gap-3 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="chip chip-accent">{s.week_no}. hafta</span>
                    <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                      {formatDate(s.meeting_date)} · {formatDuration(s.duration_minutes)}
                    </p>
                  </div>
                  <IconArrowRight className="mt-1 transition-transform duration-200 group-hover:translate-x-1" />
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {s.main_focus || "Ana odak belirtilmedi"}
                </p>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <span className="chip">{s.total_questions ?? "—"} soru</span>
                  <span className="chip">
                    {s.adherence_pct === null ? "uyum —" : `%${s.adherence_pct} uyum`}
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
