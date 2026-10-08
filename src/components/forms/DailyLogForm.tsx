"use client";

import { useActionState, useState } from "react";
import { addDailyLog, type FormResult } from "@/lib/actions/logs";
import type { Subject } from "@/lib/database.types";
import { FormStatus } from "@/components/forms/FormStatus";

export function DailyLogForm({ subjects }: { subjects: Subject[] }) {
  const [state, formAction, pending] = useActionState<FormResult, FormData>(addDailyLog, undefined);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");

  return (
    <form action={formAction} className="card reveal flex flex-col gap-4 p-5">
      <div>
        <h2 className="section-title">Yeni soru çözüm kaydı</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          Konuyu yazarsan koçun “ağırlıklı yanlış yapılan konular” analizini görebilir.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="label">Tarih</span>
          <input
            type="date"
            name="log_date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
            className="field"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="label">Ders</span>
          <select
            name="subject_id"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            required
            className="field"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="label">Konu (opsiyonel)</span>
          <input
            type="text"
            name="topic_text"
            maxLength={120}
            placeholder="Örn. Üslü İfadeler, Paragraf"
            autoComplete="off"
            className="field"
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <NumberField label="Doğru" name="correct_count" />
        <NumberField label="Yanlış" name="wrong_count" />
        <NumberField label="Boş" name="blank_count" />
      </div>

      <FormStatus state={state} okText="Kaydedildi." />

      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </button>
    </form>
  );
}

function NumberField({ label, name }: { label: string; name: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <input
        type="number"
        name={name}
        min={0}
        defaultValue={0}
        required
        className="field tabular"
      />
    </label>
  );
}
