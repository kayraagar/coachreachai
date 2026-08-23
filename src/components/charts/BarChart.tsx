"use client";

import { useState } from "react";

export type BarDatum = { label: string; correct: number; wrong: number; blank: number };

const COLOR_CORRECT = "var(--status-good)";
const COLOR_WRONG = "var(--status-critical)";
const COLOR_BLANK = "var(--text-muted)";

export function BarChart({ data, height = 280 }: { data: BarDatum[]; height?: number }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 rounded-xl text-sm"
        style={{ height, color: "var(--text-muted)", background: "var(--surface-2)" }}
      >
        <span>Henüz veri yok</span>
        <span className="text-xs">Soru girişi yaptıkça ders dağılımı burada görünecek.</span>
      </div>
    );
  }

  const width = 640;
  const padL = 10;
  const padR = 10;
  const padT = 14;
  const padB = 48;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const totals = data.map((d) => d.correct + d.wrong + d.blank);
  const max = Math.max(...totals, 1);
  const groupW = plotW / data.length;
  const barW = Math.min(44, groupW * 0.58);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full select-none" role="img">
        <line
          x1={padL}
          x2={width - padR}
          y1={padT + plotH}
          y2={padT + plotH}
          stroke="var(--baseline)"
          strokeWidth={1}
        />
        {data.map((d, i) => {
          const cx = padL + groupW * i + groupW / 2;
          const total = d.correct + d.wrong + d.blank;
          const segments = [
            { h: (d.correct / max) * plotH, color: COLOR_CORRECT },
            { h: (d.wrong / max) * plotH, color: COLOR_WRONG },
            { h: (d.blank / max) * plotH, color: COLOR_BLANK },
          ];
          const totalH = segments.reduce((s, seg) => s + seg.h, 0);
          let yCursor = padT + plotH;
          const dim = hoverIdx !== null && hoverIdx !== i;

          return (
            <g key={d.label} style={{ opacity: dim ? 0.35 : 1, transition: "opacity 200ms" }}>
              <g
                className="chart-bar"
                style={{ ["--d" as string]: `${i * 60}ms`, transformOrigin: `${cx}px ${padT + plotH}px` }}
              >
                {segments.map((seg, si) => {
                  if (seg.h <= 0) return null;
                  yCursor -= seg.h;
                  const isTop = si === segments.findLastIndex((x) => x.h > 0);
                  return (
                    <rect
                      key={si}
                      x={cx - barW / 2}
                      y={yCursor + (si > 0 ? 1.5 : 0)}
                      width={barW}
                      height={Math.max(0, seg.h - (si > 0 ? 1.5 : 0))}
                      rx={isTop ? 6 : 3}
                      fill={seg.color}
                    />
                  );
                })}
              </g>

              <rect
                x={cx - groupW / 2}
                y={padT}
                width={groupW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              />

              <text
                x={cx}
                y={height - padB + 18}
                fontSize={10}
                textAnchor={data.length > 6 ? "end" : "middle"}
                fill="var(--text-muted)"
                transform={
                  data.length > 6 ? `rotate(-32 ${cx} ${height - padB + 18})` : undefined
                }
              >
                {d.label}
              </text>

              {hoverIdx === i && (
                <text
                  x={cx}
                  y={padT + plotH - Math.max(totalH, 6) - 8}
                  fontSize={11}
                  fontWeight={600}
                  textAnchor="middle"
                  fill="var(--text-primary)"
                  className="tabular animate-fade"
                >
                  {total}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <Legend color={COLOR_CORRECT} label="Doğru" />
        <Legend color={COLOR_WRONG} label="Yanlış" />
        <Legend color={COLOR_BLANK} label="Boş" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
    </span>
  );
}
