"use client";

import { useActionState, useState, useMemo } from "react";
import { addExam } from "@/lib/actions/exams";
import type { FormResult } from "@/lib/actions/types";
import type { Subject } from "@/lib/database.types";
import { FormStatus } from "@/components/forms/FormStatus";
import { subjectsForExamType, trackConfig, type Track } from "@/lib/track";

export function ExamForm({ subjects, track }: { subjects: Subject[]; track: Track }) {
  const config = trackConfig(track);
  const [state, formAction, pending] = useActionState<FormResult, FormData>(addExam, undefined);
  const [examType, setExamType] = useState(config.defaultExamType);

  const relevantSubjects = useMemo(
    () => subjectsForExamType(subjects, config, examType),
    [subjects, config, examType]
  );

  return (
    <form action={formAction} className="card reveal flex flex-col gap-4 p-5">
      <h2 className="section-title">Yeni deneme sonucu</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="label">Sınav adı</span>
          <input name="name" required placeholder={config.examNamePlaceholder} className="field" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label">Tarih</span>
          <input
            type="date"
            name="exam_date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="field"
          />
        </label>
      </div>

      {/* tür seçimi — segment kontrol */}
      <div className="flex flex-col gap-1.5">
        <span className="label">Tür</span>
        <div
          className="flex gap-1 rounded-xl border p-1"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-2)" }}
        >
          {config.examTypes.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setExamType(t.value)}
              aria-pressed={examType === t.value}
              className="flex-1 rounded-lg py-1.5 text-sm font-medium transition-all duration-200"
              style={{
                background: examType === t.value ? "var(--accent)" : "transparent",
                color: examType === t.value ? "var(--accent-contrast)" : "var(--text-secondary)",
                boxShadow: examType === t.value ? "var(--shadow-sm)" : "none",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="exam_type" value={examType} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="label">Ders bazlı doğru / yanlış / boş</span>
          <span className="text-[0.7rem]" style={{ color: "var(--text-muted)" }}>
            {config.penaltyHint}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-2 px-1 text-[0.7rem]" style={{ color: "var(--text-muted)" }}>
            <span>Ders</span>
            <span className="text-center">Doğru</span>
            <span className="text-center">Yanlış</span>
            <span className="text-center">Boş</span>
          </div>
          {relevantSubjects.map((s, i) => (
            <div
              key={s.id}
              className="animate-pop grid grid-cols-[1.6fr_1fr_1fr_1fr] items-center gap-2 text-sm"
              style={{ ["--d" as string]: `${i * 30}ms` }}
            >
              <input type="hidden" name="subject_id" value={s.id} />
              <span style={{ color: "var(--text-secondary)" }}>{s.name}</span>
              <input type="number" name="correct" min={0} defaultValue={0} aria-label={`${s.name} doğru`} className="field tabular !px-2 !py-1.5 text-center" />
              <input type="number" name="wrong" min={0} defaultValue={0} aria-label={`${s.name} yanlış`} className="field tabular !px-2 !py-1.5 text-center" />
              <input type="number" name="blank" min={0} defaultValue={0} aria-label={`${s.name} boş`} className="field tabular !px-2 !py-1.5 text-center" />
            </div>
          ))}
        </div>
      </div>

      <FormStatus state={state} okText="Kaydedildi." />

      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </button>
    </form>
  );
}
