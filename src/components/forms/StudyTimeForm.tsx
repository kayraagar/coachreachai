"use client";

import { useActionState } from "react";
import { addStudyTime } from "@/lib/actions/study-time";
import type { FormResult } from "@/lib/actions/types";
import type { Subject } from "@/lib/database.types";
import { FormStatus } from "@/components/forms/FormStatus";

export function StudyTimeForm({ subjects }: { subjects: Subject[] }) {
  const [state, formAction, pending] = useActionState<FormResult, FormData>(addStudyTime, undefined);

  return (
    <form action={formAction} className="card reveal flex flex-col gap-4 p-5">
      <div>
        <h2 className="section-title">Çalışma süresi ekle</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          Soru girmeden de ne kadar çalıştığını kaydedebilirsin. Panelindeki çalışma süresi grafiği buradan beslenir.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <span className="label">Tarih</span>
          <input
            type="date"
            name="entry_date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
            className="field"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label">Saat</span>
          <input type="number" name="hours" min={0} max={24} step={1} defaultValue={0} className="field tabular" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label">Dakika</span>
          <input type="number" name="minutes" min={0} max={59} step={1} defaultValue={0} className="field tabular" />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <span className="label">Ders (opsiyonel)</span>
          <select name="subject_id" defaultValue="" className="field">
            <option value="">— Genel —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label">Not (opsiyonel)</span>
        <input type="text" name="note" maxLength={200} placeholder="Örn. Konu tekrarı, video ders" className="field" />
      </label>

      <FormStatus state={state} okText="Kaydedildi." />

      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {pending ? "Kaydediliyor…" : "Süreyi kaydet"}
      </button>
    </form>
  );
}
