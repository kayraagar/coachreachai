import type { CSSProperties } from "react";
import type { DayCell } from "@/lib/queries";

/** Ajanda 1. madde — "Gün Gün Çalışma Takibi" şeridi. */
export function WeekStrip({ days, delay = 0 }: { days: DayCell[]; delay?: number }) {
  const max = Math.max(...days.map((d) => d.questions), 1);

  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {days.map((d, i) => {
        const ratio = d.questions / max;
        const intensity = d.questions === 0 ? 0 : 0.18 + ratio * 0.82;
        const planDone = d.planned > 0 && d.completed === d.planned;

        return (
          <div
            key={d.date}
            className="animate-pop flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-transform hover:-translate-y-0.5"
            style={
              {
                borderColor: planDone ? "var(--status-good)" : "var(--border-hairline)",
                background: "var(--surface-2)",
                "--d": `${delay + i * 45}ms`,
              } as CSSProperties
            }
            title={`${d.date} · ${d.questions} soru · ${d.minutes} dk${
              d.planned > 0 ? ` · plan ${d.completed}/${d.planned}` : ""
            }`}
          >
            <span className="text-[0.65rem] font-medium" style={{ color: "var(--text-muted)" }}>
              {d.label}
            </span>
            <span
              className="grid h-9 w-full place-items-center rounded-lg text-sm font-semibold tabular transition-colors"
              style={{
                background:
                  d.questions === 0
                    ? "var(--surface-inset)"
                    : `color-mix(in oklab, var(--accent) ${Math.round(intensity * 100)}%, var(--surface-inset))`,
                color:
                  intensity > 0.55
                    ? "var(--accent-contrast)"
                    : d.questions === 0
                    ? "var(--text-muted)"
                    : "var(--text-primary)",
              }}
            >
              {d.questions}
            </span>
            <span className="text-[0.65rem] tabular" style={{ color: "var(--text-muted)" }}>
              {d.minutes > 0 ? `${Math.round(d.minutes / 60 * 10) / 10} sa` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
