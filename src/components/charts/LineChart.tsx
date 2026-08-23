"use client";

import { useId, useMemo, useState } from "react";

export type LinePoint = { x: string; y: number };

const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

export function LineChart({
  series,
  height = 240,
  targetValue,
  targetLabel,
  decimals = 0,
  area = true,
}: {
  series: { name: string; points: LinePoint[] }[];
  height?: number;
  targetValue?: number;
  targetLabel?: string;
  decimals?: number;
  area?: boolean;
}) {
  const yFormat = (v: number) => v.toFixed(decimals);

  const gid = useId().replace(/:/g, "");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 640;
  const padL = 42;
  const padR = 18;
  const padT = 18;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const allPoints = series.flatMap((s) => s.points);

  const geometry = useMemo(() => {
    const maxLen = Math.max(...series.map((s) => s.points.length), 1);
    const rawMax = Math.max(...allPoints.map((p) => p.y), targetValue ?? 0, 1);
    const yMax = Math.ceil(rawMax * 1.15);
    const xAt = (i: number) => padL + (maxLen === 1 ? plotW / 2 : (i / (maxLen - 1)) * plotW);
    const yAt = (v: number) => padT + plotH - (v / yMax) * plotH;
    return { maxLen, yMax, xAt, yAt };
  }, [series, allPoints, targetValue, plotW, plotH, padL, padT]);

  if (allPoints.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 rounded-xl text-sm"
        style={{ height, color: "var(--text-muted)", background: "var(--surface-2)" }}
      >
        <span>Henüz veri yok</span>
        <span className="text-xs">Kayıt girdikçe grafik burada oluşacak.</span>
      </div>
    );
  }

  const { maxLen, yMax, xAt, yAt } = geometry;
  const gridLines = 4;
  const labels = series[0]?.points.map((p) => p.x) ?? [];
  const labelStep = Math.max(1, Math.ceil(labels.length / 6));

  /** Catmull-Rom benzeri yumuşatma — kırık çizgi yerine akıcı eğri. */
  function smoothPath(points: LinePoint[]) {
    if (points.length === 0) return "";
    if (points.length < 3) {
      return points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(p.y)}`).join(" ");
    }
    let d = `M ${xAt(0)} ${yAt(points[0].y)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const x0 = xAt(i);
      const y0 = yAt(points[i].y);
      const x1 = xAt(i + 1);
      const y1 = yAt(points[i + 1].y);
      const cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`;
    }
    return d;
  }

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full select-none"
        style={{ overflow: "visible" }}
        role="img"
      >
        <defs>
          {series.map((_, si) => (
            <linearGradient key={si} id={`${gid}-fill-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={SERIES_COLORS[si % SERIES_COLORS.length]}
                stopOpacity="0.28"
              />
              <stop
                offset="100%"
                stopColor={SERIES_COLORS[si % SERIES_COLORS.length]}
                stopOpacity="0"
              />
            </linearGradient>
          ))}
        </defs>

        {/* yatay ızgara */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const v = (yMax / gridLines) * i;
          const y = yAt(v);
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke="var(--gridline)"
                strokeWidth={1}
              />
              <text x={4} y={y + 4} fontSize={10} fill="var(--text-muted)" className="tabular">
                {yFormat(v)}
              </text>
            </g>
          );
        })}

        {/* hedef çizgisi */}
        {targetValue !== undefined && (
          <g className="animate-fade">
            <line
              x1={padL}
              x2={width - padR}
              y1={yAt(targetValue)}
              y2={yAt(targetValue)}
              stroke="var(--status-good)"
              strokeWidth={1.5}
              strokeDasharray="5 5"
            />
            {targetLabel && (
              <text
                x={width - padR}
                y={yAt(targetValue) - 6}
                fontSize={10}
                textAnchor="end"
                fill="var(--status-good)"
              >
                {targetLabel}
              </text>
            )}
          </g>
        )}

        <line
          x1={padL}
          x2={width - padR}
          y1={padT + plotH}
          y2={padT + plotH}
          stroke="var(--baseline)"
          strokeWidth={1}
        />

        {series.map((s, si) => {
          const color = SERIES_COLORS[si % SERIES_COLORS.length];
          const d = smoothPath(s.points);
          const last = s.points.length - 1;
          const areaD =
            area && s.points.length > 1
              ? `${d} L ${xAt(last)} ${padT + plotH} L ${xAt(0)} ${padT + plotH} Z`
              : null;

          return (
            <g key={s.name}>
              {areaD && (
                <path
                  d={areaD}
                  fill={`url(#${gid}-fill-${si})`}
                  className="animate-fade"
                  style={{ animationDelay: "500ms", animationDuration: "600ms" }}
                />
              )}
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="chart-line"
                style={{ ["--len" as string]: 2400, animationDelay: `${si * 160}ms` }}
              />
              {s.points.map((p, i) => (
                <circle
                  key={i}
                  cx={xAt(i)}
                  cy={yAt(p.y)}
                  r={hoverIdx === i ? 5.5 : 3.2}
                  fill={color}
                  stroke="var(--surface-1)"
                  strokeWidth={1.8}
                  className="animate-pop"
                  style={{
                    ["--d" as string]: `${600 + i * 28}ms`,
                    transition: "r 160ms var(--ease-spring)",
                  }}
                />
              ))}
            </g>
          );
        })}

        {/* fare yakalayıcılar */}
        {labels.map((_, i) => (
          <rect
            key={i}
            x={xAt(i) - plotW / maxLen / 2}
            y={padT}
            width={plotW / maxLen}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          />
        ))}

        {hoverIdx !== null && (
          <line
            x1={xAt(hoverIdx)}
            x2={xAt(hoverIdx)}
            y1={padT}
            y2={padT + plotH}
            stroke="var(--text-muted)"
            strokeWidth={1}
            strokeDasharray="2 3"
            className="animate-fade"
          />
        )}

        {labels.map((lab, i) =>
          i % labelStep === 0 ? (
            <text
              key={i}
              x={xAt(i)}
              y={height - 8}
              fontSize={10}
              textAnchor="middle"
              fill="var(--text-muted)"
            >
              {lab}
            </text>
          ) : null
        )}
      </svg>

      {hoverIdx !== null ? (
        <div
          className="animate-slide-down mt-2 inline-flex flex-col gap-0.5 rounded-xl border px-3 py-2 text-xs shadow-sm"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
        >
          <span style={{ color: "var(--text-muted)" }}>{labels[hoverIdx]}</span>
          {series.map((s, si) => (
            <span key={s.name} className="tabular flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }}
              />
              <span style={{ color: "var(--text-secondary)" }}>{s.name}:</span>
              <span style={{ color: "var(--text-primary)" }}>
                {yFormat(s.points[hoverIdx]?.y ?? 0)}
              </span>
            </span>
          ))}
        </div>
      ) : (
        series.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {series.map((s, si) => (
              <span key={s.name} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }}
                />
                <span style={{ color: "var(--text-secondary)" }}>{s.name}</span>
              </span>
            ))}
          </div>
        )
      )}
    </div>
  );
}
