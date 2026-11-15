import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Reveal";
import { ActionForm } from "@/components/cita/ActionForm";
import { assignCoach } from "@/lib/actions/cita-admin";

const TIER: Record<string, string> = { free: "Ücretsiz", plus: "Çita+", bire_bir: "Bire Bir" };

type Row = {
  student_id: string; full_name: string; email: string; track: string; tier: string;
  coach_id: string | null; coach_name: string | null; request_status: string | null; requested_at: string | null;
};

export default async function AdminAssignPage() {
  const supabase = await createClient();
  const [{ data: students }, { data: coaches }] = await Promise.all([
    supabase.rpc("cita_admin_students"),
    supabase.from("profiles").select("id, full_name, email").eq("role", "coach").order("full_name"),
  ]);
  const rows = (students ?? []) as Row[];
  const waiting = rows.filter((r) => r.request_status === "waiting");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Koç atama" subtitle={`${waiting.length} Bire Bir öğrencisi koç bekliyor · ${rows.length} öğrenci`} />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--text-muted)" }}>
              <th className="py-2">Öğrenci</th><th>Sınav</th><th>Paket</th><th>Durum</th><th>Koç</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student_id} className="border-t" style={{ borderColor: "var(--border-hairline)" }}>
                <td className="py-2">
                  <div className="font-medium">{r.full_name || "—"}</div>
                  <div style={{ color: "var(--text-muted)" }}>{r.email}</div>
                </td>
                <td>{r.track}</td>
                <td>
                  <span className={r.tier === "bire_bir" ? "chip chip-accent" : "chip"}>{TIER[r.tier] ?? r.tier}</span>
                </td>
                <td>
                  {r.request_status === "waiting" ? (
                    <span className="chip chip-warn">Koç bekliyor{r.requested_at ? ` · ${r.requested_at.slice(0, 10)}` : ""}</span>
                  ) : r.coach_id ? (
                    <span className="chip chip-good">Atandı</span>
                  ) : (
                    <span className="chip">—</span>
                  )}
                </td>
                <td>
                  <ActionForm action={assignCoach} okText="Kaydedildi" className="flex items-center gap-2">
                    <input type="hidden" name="student_id" value={r.student_id} />
                    <select name="coach_id" defaultValue={r.coach_id ?? ""} className="field">
                      <option value="">Koç yok</option>
                      {(coaches ?? []).map((c) => (
                        <option key={c.id} value={c.id}>{c.full_name || c.email}</option>
                      ))}
                    </select>
                    <button className="btn btn-primary" type="submit">Ata</button>
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Atanan koç, öğrenciyi mevcut koç panelinde (Öğrencilerim) görür ve öğrencinin program önerilerini «Onaylar» kuyruğundan yönetir.
      </p>
    </div>
  );
}
