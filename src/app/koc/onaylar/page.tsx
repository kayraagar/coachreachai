import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui/Reveal";
import { ActionForm } from "@/components/cita/ActionForm";
import { coachDecide } from "@/lib/actions/cita-admin";
import type { PlanOp } from "@cita/core";

type Proposal = {
  id: string; student_id: string; summary: string; ops: PlanOp[]; status: string; source: string;
  student_decided_at: string | null; created_at: string; applied_ops: PlanOp[] | null; coach_note: string; conflict: string | null;
};

function Cell({ v }: { v: { date: string; title: string; minutes: number | null } | null | undefined }) {
  if (!v) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  return <span>{v.date} · {v.title}{v.minutes ? ` · ${v.minutes} dk` : ""}</span>;
}

/**
 * Bire Bir öğrencilerinin onayladığı program önerileri. Koç onaylar,
 * "sonra" alanlarını düzenleyip uygular ya da reddeder. Uygulama sunucuda
 * atomiktir; öğrencinin programı bu arada değiştiyse hiçbir şey yazılmaz.
 */
export default async function KocOnaylarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: pending }, { data: recent }, { data: students }] = await Promise.all([
    supabase.from("plan_proposals").select("*").eq("coach_id", user!.id).eq("status", "pending_coach").order("student_decided_at"),
    supabase.from("plan_proposals").select("*").eq("coach_id", user!.id).neq("status", "pending_coach").order("decided_at", { ascending: false }).limit(10),
    supabase.from("profiles").select("id, full_name").eq("coach_id", user!.id),
  ]);
  const name = new Map((students ?? []).map((s) => [s.id, s.full_name || "Öğrenci"]));
  const list = (pending ?? []) as Proposal[];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Program onayları" subtitle={`${list.length} öneri onayını bekliyor · onaylanana kadar öğrencinin mevcut programı geçerli`} />
      {list.length === 0 ? (
        <div className="card"><EmptyState title="Bekleyen öneri yok" hint="Bire Bir öğrencilerin Çita önerilerini onayladığında burada görünür." /></div>
      ) : null}
      {list.map((p) => (
        <div key={p.id} className="card flex flex-col gap-3">
          <div>
            <div className="font-medium">{name.get(p.student_id)} · {p.summary}</div>
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              Kaynak: {p.source === "review" ? "kişisel tekrar" : "Çita sohbeti"} · öğrenci onayı {p.student_decided_at?.slice(0, 16).replace("T", " ")}
            </div>
          </div>
          <ActionForm action={coachDecide} okText="Uygulandı" className="flex flex-col gap-3">
            <input type="hidden" name="proposal_id" value={p.id} />
            <input type="hidden" name="ops_json" value={JSON.stringify(p.ops)} />
            <table className="w-full text-sm">
              <thead><tr className="text-left" style={{ color: "var(--text-muted)" }}><th>İşlem</th><th>Önce</th><th>Sonra (düzenlenebilir)</th><th>Çıkar</th></tr></thead>
              <tbody>
                {p.ops.map((o, i) => (
                  <tr key={i} className="border-t align-top" style={{ borderColor: "var(--border-hairline)" }}>
                    <td className="py-2">{o.op === "add" ? "Ekle" : o.op === "remove" ? "Kaldır" : "Değiştir"}</td>
                    <td><Cell v={o.op === "add" ? null : o.before} /></td>
                    <td>
                      {o.op === "remove" ? <span style={{ color: "var(--text-muted)" }}>—</span> : (
                        <div className="flex flex-wrap gap-1">
                          <input name={`date_${i}`} type="date" defaultValue={o.after.date} className="field" />
                          <input name={`title_${i}`} defaultValue={o.after.title} className="field" />
                          <input name={`minutes_${i}`} type="number" min={0} max={720} defaultValue={o.after.minutes ?? ""} className="field w-24" />
                        </div>
                      )}
                    </td>
                    <td><input type="checkbox" name={`drop_${i}`} aria-label="Bu değişikliği çıkar" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <input name="note" placeholder="Öğrenciye not (isteğe bağlı)" className="field" maxLength={500} />
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" name="decision" value="approve" type="submit">Olduğu gibi onayla</button>
              <button className="btn btn-ghost" name="decision" value="edit" type="submit">Düzenlemeyle uygula</button>
              <button className="btn btn-danger-quiet" name="decision" value="decline" type="submit">Reddet</button>
            </div>
          </ActionForm>
        </div>
      ))}
      {(recent ?? []).length ? (
        <div className="card">
          <h2 className="section-title">Son kararlar</h2>
          {((recent ?? []) as Proposal[]).map((p) => (
            <div key={p.id} className="text-sm py-1">
              {name.get(p.student_id)} · {p.summary} · <span className="chip">{p.status}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
