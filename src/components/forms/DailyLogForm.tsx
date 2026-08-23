"use client";

import { useActionState, useState, useMemo } from "react";
import { addDailyLog, type FormResult } from "@/lib/actions/logs";
import type { Subject, Topic } from "@/lib/database.types";
import { FormStatus } from "@/components/forms/FormStatus";

export function DailyLogForm({ subjects, topics }: { subjects: Subject[]; topics: Topic[] }) {
  const [state, formAction, pending] = useActionState<FormResult, FormData>(addDailyLog, undefined);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const filteredTopics = useMemo(
    () => topics.filter((t) => t.subject_id === subjectId),
    [topics, subjectId]
  );

  return (
    <form action={formAction} className="card reveal flex flex-col gap-4 p-5">
      <div>
        <h2 className="section-title">Yeni soru çözüm kaydı</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          Konu seçersen koçun “ağırlıklı yanlış yapılan konular” analizini görebilir.
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

        {filteredTopics.length > 0 && (
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="label">Konu (opsiyonel)</span>
            <select name="topic_id" defaultValue="" className="field">
              <option value="">— Belirtilmedi —</option>
              {filteredTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumberField label="Doğru" name="correct_count" />
        <NumberField label="Yanlış" name="wrong_count" />
        <NumberField label="Boş" name="blank_count" />
        <NumberField label="Süre (dk)" name="duration_minutes" required={false} />
      </div>

      <FormStatus state={state} okText="Kaydedildi." />

      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </button>
    </form>
  );
}

function NumberField({
  label,
  name,
  required = true,
}: {
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <input
        type="number"
        name={name}
        min={0}
        defaultValue={required ? 0 : undefined}
        required={required}
        className="field tabular"
      />
    </label>
  );
}
