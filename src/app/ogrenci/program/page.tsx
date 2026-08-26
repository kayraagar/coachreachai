import { createClient } from "@/lib/supabase/server";
import { getWeekPlan, weekStartOf } from "@/lib/queries";
import { PageHeader, Panel } from "@/components/ui/Reveal";
import { AgendaEditor } from "@/components/plan/AgendaEditor";
import { WeekNav } from "@/components/plan/WeekNav";

export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ hafta?: string }>;
}) {
  const { hafta } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const thisWeekStart = weekStartOf();
  // Geçersiz/eksik parametrede sessizce bu haftaya düşülür.
  const weekStart = hafta ? weekStartOf(hafta) : thisWeekStart;

  const items = await getWeekPlan(user!.id, weekStart);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Haftalık Ajanda"
        subtitle="Haftanın görevlerini gün gün planla, tamamladıkça işaretle — programa uyum oranın buradan hesaplanıyor"
      />

      <Panel title="Hafta" padded delay={40}>
        <WeekNav
          basePath="/ogrenci/program"
          weekStart={weekStart}
          thisWeekStart={thisWeekStart}
        />
      </Panel>

      <Panel title="Görevler" hint="Her gün için satır ekleyip süre yazabilirsin" delay={80}>
        <AgendaEditor weekStart={weekStart} items={items} />
      </Panel>
    </div>
  );
}
