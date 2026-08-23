import { createClient } from "@/lib/supabase/server";
import { rel } from "@/lib/rel";
import { PlanForm } from "@/components/forms/PlanForm";
import { toggleCompleted, deletePlanItem } from "@/lib/actions/plan";
import { PageHeader, Panel, EmptyState } from "@/components/ui/Reveal";
import { IconCheck } from "@/components/ui/Icons";
import { formatShortDate } from "@/lib/labels";

export default async function ProgramPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: subjects }, { data: items }] = await Promise.all([
    supabase.from("subjects").select("*").order("sort_order"),
    supabase
      .from("study_plan_items")
      .select("id, plan_date, title, completed, planned_minutes, subjects(name)")
      .eq("student_id", user!.id)
      .order("plan_date", { ascending: false })
      .limit(50),
  ]);

  const rows = items ?? [];
  const done = rows.filter((r) => r.completed).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Çalışma Programı"
        subtitle={
          rows.length > 0
            ? `${done}/${rows.length} görev tamamlandı — programa uyum oranın buradan hesaplanıyor`
            : "Planladığın işleri ekle, tamamladıkça işaretle"
        }
      />

      <PlanForm subjects={subjects ?? []} />

      <Panel title="Görevler" delay={80} padded={false}>
        <ul>
          {rows.map((it, i) => (
            <li
              key={it.id}
              className="row-hover animate-fade flex items-center justify-between gap-3 px-4 py-3"
              style={{ borderBottom: "1px solid var(--gridline)", animationDelay: `${i * 25}ms` }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <form action={toggleCompleted.bind(null, it.id, !it.completed)}>
                  <button
                    type="submit"
                    aria-label={it.completed ? "Tamamlanmadı olarak işaretle" : "Tamamlandı olarak işaretle"}
                    aria-pressed={it.completed}
                    className="grid h-5 w-5 place-items-center rounded-md border transition-all duration-200 hover:scale-110"
                    style={{
                      borderColor: it.completed ? "var(--status-good)" : "var(--border-strong)",
                      background: it.completed ? "var(--status-good)" : "transparent",
                      color: "var(--accent-contrast)",
                    }}
                  >
                    {it.completed && <IconCheck className="h-3 w-3 animate-pop" />}
                  </button>
                </form>
                <div className="flex min-w-0 flex-col">
                  <span
                    className="truncate text-sm transition-colors"
                    style={{
                      color: it.completed ? "var(--text-muted)" : "var(--text-primary)",
                      textDecoration: it.completed ? "line-through" : "none",
                    }}
                  >
                    {it.title}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatShortDate(it.plan_date)}
                    {rel(it.subjects)?.name ? ` · ${rel(it.subjects)!.name}` : ""}
                    {it.planned_minutes ? ` · ${it.planned_minutes} dk` : ""}
                  </span>
                </div>
              </div>
              <form action={deletePlanItem.bind(null, it.id)}>
                <button className="btn btn-danger-quiet">Sil</button>
              </form>
            </li>
          ))}
          {rows.length === 0 && (
            <li>
              <EmptyState title="Henüz program öğesi yok" hint="Yukarıdaki formdan ilk görevini ekle." />
            </li>
          )}
        </ul>
      </Panel>
    </div>
  );
}
