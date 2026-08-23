import type { CSSProperties } from "react";

export function ProgressBar({
  label,
  current,
  target,
  unit = "",
  delay = 0,
}: {
  label: string;
  current: number;
  target: number;
  unit?: string;
  delay?: number;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const tone =
    pct >= 100 ? "var(--status-good)" : pct >= 60 ? "var(--accent)" : "var(--status-warning)";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span className="tabular whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
          {current}
          {unit} / {target}
          {unit} <span style={{ color: "var(--text-muted)" }}>({pct}%)</span>
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full"
        style={{ background: "var(--surface-inset)" }}
      >
        <div
          className="bar-fill h-full rounded-full"
          style={
            {
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${tone}, color-mix(in oklab, ${tone} 65%, white))`,
              "--d": `${delay}ms`,
            } as CSSProperties
          }
        />
      </div>
    </div>
  );
}

/** Küçük yatay ölçüm çubuğu — rutin/uyum yüzdeleri için. */
export function MiniMeter({
  value,
  max = 100,
  tone = "var(--accent)",
  delay = 0,
}: {
  value: number;
  max?: number;
  tone?: string;
  delay?: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-inset)" }}>
      <div
        className="bar-fill h-full rounded-full"
        style={{ width: `${pct}%`, background: tone, "--d": `${delay}ms` } as CSSProperties}
      />
    </div>
  );
}
