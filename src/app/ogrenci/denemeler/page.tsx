import { createClient } from "@/lib/supabase/server";
import { ExamForm } from "@/components/forms/ExamForm";
import { deleteExam } from "@/lib/actions/exams";
import { PageHeader, Panel, EmptyState } from "@/components/ui/Reveal";
import { formatShortDate } from "@/lib/labels";
import { getStudentTrack, getSubjects } from "@/lib/queries";
import { trackConfig } from "@/lib/track";

export default async function DenemelerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const track = await getStudentTrack(user!.id);
  const config = trackConfig(track);

  const [subjects, { data: exams }] = await Promise.all([
    getSubjects(track),
    supabase
      .from("exams")
      .select("id, name, exam_date, exam_type, exam_results(net)")
      .eq("student_id", user!.id)
      .order("exam_date", { ascending: false }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Denemeler"
        subtitle={`${config.label} deneme netlerin — görüşmenin 2. maddesindeki performans analizinin kaynağı`}
      />

      <ExamForm subjects={subjects} track={track} />

      <Panel title="Deneme geçmişi" delay={80} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-hairline)" }}>
                <Th>Tarih</Th>
                <Th>Sınav</Th>
                <Th>Tür</Th>
                <Th align="right">Toplam net</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {(exams ?? []).map((e, i) => {
                const totalNet = (e.exam_results ?? []).reduce(
                  (s: number, r: { net: number }) => s + Number(r.net),
                  0
                );
                return (
                  <tr
                    key={e.id}
                    className="row-hover animate-fade"
                    style={{ borderBottom: "1px solid var(--gridline)", animationDelay: `${i * 25}ms` }}
                  >
                    <td className="tabular px-4 py-2.5" style={{ color: "var(--text-primary)" }}>
                      {formatShortDate(e.exam_date)}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>
                      {e.name}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="chip">{e.exam_type}</span>
                    </td>
                    <td className="tabular px-4 py-2.5 text-right font-medium" style={{ color: "var(--accent)" }}>
                      {totalNet.toFixed(1)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <form action={deleteExam.bind(null, e.id)}>
                        <button className="btn btn-danger-quiet">Sil</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {(exams ?? []).length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState title="Henüz deneme kaydı yok" />
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
