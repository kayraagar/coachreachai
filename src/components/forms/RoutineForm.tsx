"use client";

import { useActionState } from "react";
import { saveRoutine } from "@/lib/actions/routines";
import type { FormResult } from "@/lib/actions/types";
import type { DailyRoutine } from "@/lib/database.types";
import { MOOD_OPTIONS } from "@/lib/labels";

/** Ajandanın 6. maddesi: uyku, ekran süresi, beslenme, mola. */
export function RoutineForm({ today }: { today?: DailyRoutine | null }) {
  const [state, formAction, pending] = useActionState<FormResult, FormData>(saveRoutine, undefined);

  return (
    <form action={formAction} className="card reveal flex flex-col gap-4 p-5">
      <div>
        <h2 className="section-title">Günlük rutin</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          Uyku, ekran süresi, beslenme ve molalar — koçun haftalık görüşmede baktığı veriler.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="label">Tarih</span>
          <input
            type="date"
            name="log_date"
            required
            defaultValue={today?.log_date ?? new Date().toISOString().slice(0, 10)}
            className="field"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label">Ruh hali</span>
          <select name="mood" defaultValue={today?.mood ?? ""} className="field">
            <option value="">—</option>
            {MOOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label">Uyku (saat)</span>
          <input
            type="number"
            name="sleep_hours"
            min={0}
            max={24}
            step="0.5"
            placeholder="7.5"
            defaultValue={today?.sleep_hours ?? ""}
            className="field tabular"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label">Ekran / telefon (dk)</span>
          <input
            type="number"
            name="screen_minutes"
            min={0}
            placeholder="90"
            defaultValue={today?.screen_minutes ?? ""}
            className="field tabular"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Check name="nutrition_ok" label="Beslenme düzenliydi" defaultChecked={today?.nutrition_ok} />
        <Check name="breaks_ok" label="Mola / nefes egzersizi yaptım" defaultChecked={today?.breaks_ok} />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label">Not (opsiyonel)</span>
        <textarea
          name="note"
          rows={2}
          placeholder="Bugünü etkileyen bir şey var mıydı?"
          defaultValue={today?.note ?? ""}
          className="field"
        />
      </label>

      {state && "error" in state && (
        <p className="animate-slide-down text-sm" style={{ color: "var(--status-critical)" }}>
          {state.error}
        </p>
      )}
      {state && "ok" in state && (
        <p className="animate-slide-down text-sm" style={{ color: "var(--status-good)" }}>
          Kaydedildi.
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {pending ? "Kaydediliyor…" : "Rutini kaydet"}
      </button>
    </form>
  );
}

function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors hover:bg-[var(--surface-2)]"
      style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
    >
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}
