"use client";

import { useEffect, useRef, useState } from "react";

/** Sayısal değerler için kısa bir sayaç animasyonu. */
function useCountUp(target: number | null, duration = 700) {
  // Başlangıç değeri hedefin kendisi: sunucu çıktısıyla aynı, animasyon
  // yalnızca ilk kareden itibaren (asenkron) devreye girer.
  const [value, setValue] = useState(target ?? 0);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (target === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);

  return value;
}

export function StatTile({
  label,
  value,
  suffix,
  tone = "neutral",
  hint,
  delay = 0,
  decimals = 0,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  tone?: "neutral" | "good" | "warning" | "critical" | "accent";
  hint?: string;
  delay?: number;
  decimals?: number;
}) {
  const numeric = typeof value === "number" ? value : null;
  const animated = useCountUp(numeric);

  const toneColor =
    tone === "good"
      ? "var(--status-good)"
      : tone === "warning"
      ? "var(--status-warning)"
      : tone === "critical"
      ? "var(--status-critical)"
      : tone === "accent"
      ? "var(--accent)"
      : "var(--text-primary)";

  return (
    <div
      className="card card-hover reveal flex min-w-[150px] flex-1 flex-col gap-1 p-4"
      style={{ ["--d" as string]: `${delay}ms` }}
    >
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span
        className="tabular text-[1.75rem] font-semibold leading-tight tracking-tight"
        style={{ color: toneColor }}
      >
        {numeric !== null ? animated.toFixed(decimals) : value}
        {suffix && (
          <span className="ml-1 text-sm font-normal" style={{ color: "var(--text-secondary)" }}>
            {suffix}
          </span>
        )}
      </span>
      {hint && (
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {hint}
        </span>
      )}
    </div>
  );
}
