"use client";

import { useActionState } from "react";
import { addPlanItem } from "@/lib/actions/plan";
import type { FormResult } from "@/lib/actions/types";
import type { Subject } from "@/lib/database.types";
import { FormStatus } from "@/components/forms/FormStatus";

export function PlanForm({ subjects }: { subjects: Subject[] }) {
  const [state, formAction, pending] = useActionState<FormResult, FormData>(addPlanItem, undefined);

  return (
    <form action={formAction} className="card reveal flex flex-col gap-4 p-5">
      <div>
        <h2 className="section-title">Yeni program öğesi</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          Planladığın işleri buraya yaz; tamamladıkça programa uyum oranın hesaplanır.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label">Başlık</span>
        <input name="title" required placeholder="Örn. Fonksiyonlar konu tekrarı + 40 soru" className="field" />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="label">Tarih</span>
          <input
            type="date"
            name="plan_date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="field"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label">Ders (opsiyonel)</span>
          <select name="subject_id" defaultValue="" className="field">
            <option value="">— Belirtilmedi —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label">Planlanan süre (dk)</span>
          <input type="number" name="planned_minutes" min={0} className="field tabular" />
        </label>
      </div>

      <FormStatus state={state} okText="Programa eklendi." />

      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {pending ? "Ekleniyor…" : "Programa ekle"}
      </button>
    </form>
  );
}
