import { createClient } from "@/lib/supabase/server";
import { rel } from "@/lib/rel";
import { DailyLogForm } from "@/components/forms/DailyLogForm";
import { deleteDailyLog } from "@/lib/actions/logs";
import { PageHeader, Panel, EmptyState } from "@/components/ui/Reveal";
import { formatShortDate } from "@/lib/labels";

export default async function SoruGirisiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: subjects }, { data: topics }, { data: logs }] = await Promise.all([
    supabase.from("subjects").select("*").order("sort_order"),
    supabase.from("topics").select("*").order("sort_order"),
    supabase
      .from("daily_logs")
      .select("id, log_date, correct_count, wrong_count, blank_count, duration_minutes, subjects(name), topics(name)")
      .eq("student_id", user!.id)
      .order("log_date", { ascending: false })
      .limit(30),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Soru Girişi" subtitle="Çözdüğün soruları ders ve konu bazında kaydet" />

      <DailyLogForm subjects={subjects ?? []} topics={topics ?? []} />

      <Panel title="Son kayıtlar" delay={80} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-hairline)" }}>
                <Th>Tarih</Th>
                <Th>Ders</Th>
                <Th>Konu</Th>
                <Th align="right">D</Th>
                <Th align="right">Y</Th>
                <Th align="right">B</Th>
                <Th align="right">Süre</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((l, i) => (
                <tr
                  key={l.id}
                  className="row-hover animate-fade"
                  style={{ borderBottom: "1px solid var(--gridline)", animationDelay: `${i * 25}ms` }}
                >
                  <td className="tabular px-4 py-2.5" style={{ color: "var(--text-primary)" }}>
                    {formatShortDate(l.log_date)}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>
                    {rel(l.subjects)?.name}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>
                    {rel(l.topics)?.name ?? "—"}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right" style={{ color: "var(--status-good)" }}>
                    {l.correct_count}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right" style={{ color: "var(--status-critical)" }}>
                    {l.wrong_count}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right" style={{ color: "var(--text-muted)" }}>
                    {l.blank_count}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right" style={{ color: "var(--text-muted)" }}>
                    {l.duration_minutes ? `${l.duration_minutes} dk` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <form action={deleteDailyLog.bind(null, l.id)}>
                      <button className="btn btn-danger-quiet">Sil</button>
                    </form>
                  </td>
                </tr>
              ))}
              {(logs ?? []).length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title="Henüz kayıt yok" hint="Yukarıdaki formdan ilk kaydını ekle." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`px-4 py-2.5 text-xs font-medium ${align === "right" ? "text-right" : "text-left"}`}
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </th>
  );
}
