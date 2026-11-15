import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Reveal";
import { ActionForm } from "@/components/cita/ActionForm";
import { deleteResource, saveResource } from "@/lib/actions/cita-admin";

type Resource = {
  id: string; exam: string; exam_part: string | null; subject: string; topic: string | null; level: string; type: string;
  title: string; url: string | null; source_name: string; notes: string; approved: boolean; last_checked: string;
};

function ResourceFields({ r }: { r?: Resource }) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {r ? <input type="hidden" name="id" value={r.id} /> : null}
      <select name="exam" defaultValue={r?.exam ?? "YKS"} className="field"><option>YKS</option><option>LGS</option></select>
      <select name="exam_part" defaultValue={r?.exam_part ?? ""} className="field">
        <option value="">Tüm oturumlar</option><option>TYT</option><option>AYT</option><option>YDT</option><option>LGS</option>
      </select>
      <input name="subject" defaultValue={r?.subject ?? ""} placeholder="Ders (örn. Matematik)" className="field" required />
      <input name="topic" defaultValue={r?.topic ?? ""} placeholder="Konu (isteğe bağlı)" className="field" />
      <select name="level" defaultValue={r?.level ?? "orta"} className="field">
        {["başlangıç", "orta", "ileri", "tümü"].map((l) => <option key={l}>{l}</option>)}
      </select>
      <select name="type" defaultValue={r?.type ?? "kitap"} className="field">
        {["kitap", "soru bankası", "video", "deneme", "site", "uygulama", "diğer"].map((t) => <option key={t}>{t}</option>)}
      </select>
      <input name="title" defaultValue={r?.title ?? ""} placeholder="Başlık" className="field sm:col-span-2" required />
      <input name="url" defaultValue={r?.url ?? ""} placeholder="https://…" className="field sm:col-span-2" />
      <input name="source_name" defaultValue={r?.source_name ?? ""} placeholder="Kaynak / yayıncı" className="field" />
      <input name="last_checked" type="date" defaultValue={r?.last_checked ?? new Date().toISOString().slice(0, 10)} className="field" />
      <input name="notes" defaultValue={r?.notes ?? ""} placeholder="Not" className="field sm:col-span-3" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="approved" defaultChecked={r?.approved ?? true} /> Onaylı</label>
    </div>
  );
}

export default async function AdminResourcesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("resources").select("*").order("exam").order("subject").order("title");
  const rows = (data ?? []) as Resource[];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Kaynak kataloğu" subtitle="Çita önce bu onaylı listeden önerir; uygun kaynak yoksa web aramasına geçer ve bunu belirtir." />
      <div className="card">
        <h2 className="section-title">Yeni kaynak</h2>
        <ActionForm action={saveResource} okText="Eklendi" className="flex flex-col gap-3">
          <ResourceFields />
          <button className="btn btn-primary self-start" type="submit">Ekle</button>
        </ActionForm>
      </div>
      {rows.map((r) => (
        <details key={r.id} className="card">
          <summary className="cursor-pointer">
            <span className="font-medium">{r.title}</span>{" "}
            <span style={{ color: "var(--text-muted)" }}>· {r.exam} · {r.subject}{r.topic ? ` · ${r.topic}` : ""} · {r.type} · son kontrol {r.last_checked}</span>{" "}
            {!r.approved ? <span className="chip chip-warn">onaysız</span> : null}
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <ActionForm action={saveResource} okText="Kaydedildi" className="flex flex-col gap-3">
              <ResourceFields r={r} />
              <button className="btn btn-primary self-start" type="submit">Kaydet</button>
            </ActionForm>
            <form action={deleteResource.bind(null, r.id)}>
              <button className="btn btn-danger-quiet" type="submit">Sil</button>
            </form>
          </div>
        </details>
      ))}
    </div>
  );
}
