import { createClient } from "@/lib/supabase/server";
import { getRoutineSummary } from "@/lib/queries";
import { RoutineForm } from "@/components/forms/RoutineForm";
import { PageHeader, Panel, EmptyState } from "@/components/ui/Reveal";
import { MiniMeter } from "@/components/charts/ProgressBar";
import { deleteRoutine } from "@/lib/actions/routines";
import { MOOD_LABEL, formatDuration, formatShortDate } from "@/lib/labels";
import type { DailyRoutine, Mood } from "@/lib/database.types";

export default async function RutinlerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: rows }, summary] = await Promise.all([
    supabase
      .from("daily_routines")
      .select("*")
      .eq("student_id", user!.id)
      .order("log_date", { ascending: false })
      .limit(30),
    getRoutineSummary(user!.id, 7),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const todayRow = (rows ?? []).find((r) => r.log_date === today) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rutinler"
        subtitle="Uyku düzeni, ekran süresi, beslenme ve molalar — performansını taşıyan zemin"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.1fr]">
        <RoutineForm today={todayRow as DailyRoutine | null} />

        <Panel title="Son 7 gün" delay={80}>
          {summary.count === 0 ? (
            <EmptyState title="Henüz kayıt yok" hint="İlk rutin kaydını soldan ekleyebilirsin." />
          ) : (
            <div className="flex flex-col gap-4">
              <SummaryRow
                label="Ortalama uyku"
                value={summary.avgSleep === null ? "—" : `${summary.avgSleep} sa`}
                pct={summary.avgSleep === null ? 0 : Math.min(100, (summary.avgSleep / 8) * 100)}
                tone="var(--series-3)"
              />
              <SummaryRow
                label="Ortalama ekran süresi"
                value={summary.avgScreen === null ? "—" : formatDuration(summary.avgScreen)}
                pct={summary.avgScreen === null ? 0 : Math.min(100, (summary.avgScreen / 180) * 100)}
                tone="var(--series-2)"
              />
              <SummaryRow
                label="Beslenme düzeni"
                value={`%${summary.nutritionPct}`}
                pct={summary.nutritionPct ?? 0}
                tone="var(--status-good)"
              />
              <SummaryRow
                label="Mola / nefes egzersizi"
                value={`%${summary.breaksPct}`}
                pct={summary.breaksPct ?? 0}
                tone="var(--accent)"
              />
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Kayıt geçmişi" delay={140} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-hairline)" }}>
                <Th>Tarih</Th>
                <Th align="right">Uyku</Th>
                <Th align="right">Ekran</Th>
                <Th>Beslenme</Th>
                <Th>Mola</Th>
                <Th>Ruh hali</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.id} className="row-hover" style={{ borderBottom: "1px solid var(--gridline)" }}>
                  <td className="tabular px-4 py-2.5" style={{ color: "var(--text-primary)" }}>
                    {formatShortDate(r.log_date)}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right" style={{ color: "var(--text-secondary)" }}>
                    {r.sleep_hours === null ? "—" : `${r.sleep_hours} sa`}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right" style={{ color: "var(--text-secondary)" }}>
                    {r.screen_minutes === null ? "—" : formatDuration(r.screen_minutes)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Dot on={r.nutrition_ok} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Dot on={r.breaks_ok} />
                  </td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>
                    {r.mood ? MOOD_LABEL[r.mood as Mood] : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <form action={deleteRoutine.bind(null, r.id)}>
                      <button className="btn btn-danger-quiet">Sil</button>
                    </form>
                  </td>
                </tr>
              ))}
              {(rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState title="Henüz rutin kaydı yok" />
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

function SummaryRow({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: string;
  pct: number;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span className="tabular font-medium" style={{ color: "var(--text-primary)" }}>
          {value}
        </span>
      </div>
      <MiniMeter value={pct} tone={tone} />
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ background: on ? "var(--status-good)" : "var(--surface-inset)" }}
      title={on ? "Evet" : "Hayır"}
    />
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
