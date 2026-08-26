"use client";

import { useMemo, useState } from "react";
import type { AgendaItem } from "@/lib/queries";
import { DAY_LABELS, DAY_LABELS_LONG, weekDays, type AgendaPayloadRow } from "@/lib/agenda";
import { IconCheck, IconPlus } from "@/components/ui/Icons";

type Row = {
  key: string;
  id: string | null;
  title: string;
  minutes: string;
  completed: boolean;
};

let seq = 0;
const nextKey = () => `new-${seq++}`;

/**
 * Haftalık ajanda — 7 gün sütunu, her günün altında serbest görev satırları.
 *
 * Bileşen kendi <form>'unu AÇMAZ: koçun görüşme formunun içine gömüldüğünde
 * iç içe form oluşurdu (HTML'de geçersiz). Bunun yerine tüm hafta tek bir
 * gizli JSON alanına serileştirilir; onu saran form neyse o gönderir.
 */
export function WeeklyAgenda({
  weekStart,
  items,
  name = "plan_json",
  canToggle = true,
  readOnly = false,
  onDirtyChange,
}: {
  weekStart: string;
  items: AgendaItem[];
  /** Gizli JSON alanının adı — saran formun action'ı bu adı okur. */
  name?: string;
  /** "Yapıldı" kutucukları gösterilsin mi (öğrenci tarafı). */
  canToggle?: boolean;
  readOnly?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const [byDay, setByDay] = useState<Record<string, Row[]>>(() => {
    const map: Record<string, Row[]> = {};
    days.forEach((d) => (map[d] = []));
    items.forEach((it) => {
      if (!map[it.plan_date]) map[it.plan_date] = [];
      map[it.plan_date].push({
        key: it.id,
        id: it.id,
        title: it.title,
        minutes: it.planned_minutes === null ? "" : String(it.planned_minutes),
        completed: it.completed,
      });
    });
    return map;
  });

  const markDirty = () => onDirtyChange?.(true);

  const update = (day: string, key: string, patch: Partial<Row>) => {
    setByDay((cur) => ({
      ...cur,
      [day]: (cur[day] ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)),
    }));
    markDirty();
  };

  const addRow = (day: string) => {
    setByDay((cur) => ({
      ...cur,
      [day]: [
        ...(cur[day] ?? []),
        { key: nextKey(), id: null, title: "", minutes: "", completed: false },
      ],
    }));
    markDirty();
  };

  const removeRow = (day: string, key: string) => {
    setByDay((cur) => ({ ...cur, [day]: (cur[day] ?? []).filter((r) => r.key !== key) }));
    markDirty();
  };

  // Saran formun göndereceği yük: boş başlıklı satırlar atılır.
  const payload: AgendaPayloadRow[] = days.flatMap((day) =>
    (byDay[day] ?? [])
      .filter((r) => r.title.trim() !== "")
      .map((r, i) => ({
        id: r.id,
        date: day,
        title: r.title,
        minutes: r.minutes.trim() === "" ? null : Number(r.minutes),
        completed: r.completed,
        sort: i,
      }))
  );

  const totalTasks = payload.length;
  const totalMinutes = payload.reduce((s, r) => s + (r.minutes ?? 0), 0);
  const doneCount = payload.filter((r) => r.completed).length;

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={JSON.stringify(payload)} />
      <input type="hidden" name="week_start" value={weekStart} />

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="chip">{totalTasks} görev</span>
        {totalMinutes > 0 && <span className="chip">{formatMinutes(totalMinutes)} planlandı</span>}
        {canToggle && totalTasks > 0 && (
          <span className={doneCount === totalTasks ? "chip chip-good" : "chip"}>
            {doneCount}/{totalTasks} tamamlandı
          </span>
        )}
      </div>

      {/* Mobilde tek sütun, geniş ekranda 7 gün yan yana */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((day, i) => {
          const rows = byDay[day] ?? [];
          const today = day === todayKey();
          return (
            <section
              key={day}
              className="flex flex-col gap-1.5 rounded-xl border p-2"
              style={{
                borderColor: today ? "var(--accent)" : "var(--border-hairline)",
                background: today ? "var(--accent-soft)" : "var(--surface-2)",
              }}
            >
              <header className="flex items-baseline justify-between gap-1 px-0.5">
                <span
                  className="text-xs font-semibold"
                  style={{ color: today ? "var(--accent)" : "var(--text-primary)" }}
                  title={DAY_LABELS_LONG[i]}
                >
                  {DAY_LABELS[i]}
                </span>
                <span className="tabular text-[0.65rem]" style={{ color: "var(--text-muted)" }}>
                  {day.slice(8, 10)}.{day.slice(5, 7)}
                </span>
              </header>

              {rows.map((r) => (
                <div key={r.key} className="flex flex-col gap-1">
                  <div className="flex items-start gap-1">
                    {canToggle && (
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => update(day, r.key, { completed: !r.completed })}
                        aria-label={
                          r.completed
                            ? "Tamamlanmadı olarak işaretle"
                            : "Tamamlandı olarak işaretle"
                        }
                        aria-pressed={r.completed}
                        className="mt-1.5 grid h-4 w-4 shrink-0 place-items-center rounded transition-all duration-200"
                        style={{
                          border: `1px solid ${
                            r.completed ? "var(--status-good)" : "var(--border-strong)"
                          }`,
                          background: r.completed ? "var(--status-good)" : "transparent",
                          color: "var(--accent-contrast)",
                        }}
                      >
                        {r.completed && <IconCheck className="h-2.5 w-2.5" />}
                      </button>
                    )}
                    <textarea
                      rows={2}
                      readOnly={readOnly}
                      value={r.title}
                      onChange={(e) => update(day, r.key, { title: e.target.value })}
                      placeholder="Görev"
                      className="field !min-h-0 flex-1 resize-y !px-2 !py-1 text-xs"
                      style={{
                        textDecoration: r.completed ? "line-through" : "none",
                        opacity: r.completed ? 0.65 : 1,
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1 pl-5">
                    <input
                      type="number"
                      min={0}
                      step={5}
                      readOnly={readOnly}
                      value={r.minutes}
                      onChange={(e) => update(day, r.key, { minutes: e.target.value })}
                      placeholder="dk"
                      aria-label="Planlanan süre (dakika)"
                      className="field tabular !w-14 !px-1.5 !py-0.5 text-center text-[0.7rem]"
                    />
                    <span className="text-[0.65rem]" style={{ color: "var(--text-muted)" }}>
                      dk
                    </span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => removeRow(day, r.key)}
                        aria-label="Satırı sil"
                        className="ml-auto rounded px-1 text-[0.7rem]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {!readOnly && (
                <button
                  type="button"
                  onClick={() => addRow(day)}
                  className="flex items-center justify-center gap-1 rounded-lg border border-dashed py-1 text-[0.7rem]"
                  style={{ borderColor: "var(--border-hairline)", color: "var(--text-muted)" }}
                >
                  <IconPlus className="h-3 w-3" /> ekle
                </button>
              )}

              {readOnly && rows.length === 0 && (
                <p className="px-0.5 py-1 text-[0.7rem]" style={{ color: "var(--text-muted)" }}>
                  —
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function formatMinutes(m: number) {
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} sa` : `${h} sa ${r} dk`;
}
