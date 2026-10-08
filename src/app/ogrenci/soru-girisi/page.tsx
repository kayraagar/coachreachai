import { createClient } from "@/lib/supabase/server";
import { rel } from "@/lib/rel";
import { DailyLogForm } from "@/components/forms/DailyLogForm";
import { StudyTimeForm } from "@/components/forms/StudyTimeForm";
import { deleteStudyTime } from "@/lib/actions/study-time";
import { deleteDailyLog } from "@/lib/actions/logs";
import { PageHeader, Panel, EmptyState } from "@/components/ui/Reveal";
import { formatDuration, formatShortDate } from "@/lib/labels";
import { getRecentStudyTime, getStudentTrack, getSubjects } from "@/lib/queries";

export default async function SoruGirisiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const track = await getStudentTrack(user!.id);

  const [subjects, studyTime, { data: logs }] = await Promise.all([
    getSubjects(track),
    getRecentStudyTime(user!.id, 10),
    supabase
      .from("daily_logs")
      .select("id, log_date, correct_count, wrong_count, blank_count, duration_minutes, topic_text, subjects(name), topics(name)")
      .eq("student_id", user!.id)
      .order("log_date", { ascending: false })
      .limit(30),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Soru Girişi" subtitle="Çözdüğün soruları ders ve konu bazında kaydet" />

      <StudyTimeForm subjects={subjects} />

      {studyTime.length > 0 && (
        <Panel title="Son çalışma süreleri" delay={40}>
          <ul className="flex flex-col gap-1">
            {studyTime.map((r) => (
              <li key={r.id} className="row-hover flex items-center gap-3 rounded-lg px-2 py-2">
                <span className="tabular shrink-0 text-sm" style={{ color: "var(--text-muted)" }}>
                  {formatShortDate(r.date)}
                </span>
                <span className="chip shrink-0">{r.subjectName ?? "Genel"}</span>
                <span className="flex-1 truncate text-sm" style={{ color: "var(--text-secondary)" }}>
                  {r.note || "—"}
                </span>
                <span className="tabular shrink-0 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {formatDuration(r.minutes)}
                </span>
                <form action={deleteStudyTime.bind(null, r.id)}>
                  <button className="btn btn-danger-quiet">Sil</button>
                </form>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <DailyLogForm subjects={subjects} />

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
                    {l.topic_text ?? rel(l.topics)?.name ?? "—"}
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
                    {l.duration_minutes ? formatDuration(l.duration_minutes) : "—"}
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
