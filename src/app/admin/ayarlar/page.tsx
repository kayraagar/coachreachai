import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Reveal";
import { ActionForm } from "@/components/cita/ActionForm";
import { savePhotoLimits } from "@/lib/actions/cita-admin";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("cita_settings").select("value").eq("key", "photo_limits").maybeSingle();
  const limits = (data?.value ?? { free: 3, plus: 15, bire_bir: 15 }) as Record<string, number>;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Ayarlar" subtitle="Günlük soru fotoğrafı hakları (Europe/Istanbul gününe göre sunucuda uygulanır)." />
      <div className="card">
        <ActionForm action={savePhotoLimits} okText="Kaydedildi" className="flex flex-wrap items-end gap-4">
          {[["free", "Ücretsiz"], ["plus", "Çita+"], ["bire_bir", "Bire Bir"]].map(([k, label]) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="label">{label}</span>
              <input name={k} type="number" min={0} max={100} defaultValue={limits[k]} className="field w-28" />
            </label>
          ))}
          <button className="btn btn-primary" type="submit">Kaydet</button>
        </ActionForm>
      </div>
    </div>
  );
}
