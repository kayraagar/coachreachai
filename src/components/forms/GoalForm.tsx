"use client";

import { useActionState, useState } from "react";
import { addGoal } from "@/lib/actions/goals";
import type { FormResult } from "@/lib/actions/types";
import type { Subject } from "@/lib/database.types";
import { FormStatus } from "@/components/forms/FormStatus";

const GOAL_TYPES = [
  { value: "daily_questions", label: "Günlük soru sayısı" },
  { value: "weekly_questions", label: "Haftalık soru sayısı" },
  { value: "exam_net", label: "Deneme toplam net" },
  { value: "subject_net", label: "Ders bazlı deneme net" },
];

export function GoalForm({ studentId, subjects }: { studentId: string; subjects: Subject[] }) {
  const [state, formAction, pending] = useActionState<FormResult, FormData>(addGoal, undefined);
  const [goalType, setGoalType] = useState("daily_questions");

  return (
    <form action={formAction} className="card flex h-full flex-col gap-4 p-5">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="period" value="daily" />
      <div>
        <h2 className="section-title">Yeni hedef ata</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          Ajandanın 4. maddesindeki hedef net aralığını takip edilebilir hale getirir.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="label">Hedef türü</span>
          <select
            name="goal_type"
            value={goalType}
            onChange={(e) => setGoalType(e.target.value)}
            className="field"
          >
            {GOAL_TYPES.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="label">Hedef değer</span>
          <input type="number" name="target_value" min={1} step="0.5" required className="field tabular" />
        </label>

        {goalType === "subject_net" && (
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="label">Ders</span>
            <select name="subject_id" required className="field">
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <FormStatus state={state} okText="Hedef atandı." />

      <button type="submit" disabled={pending} className="btn btn-primary mt-auto self-start">
        {pending ? "Kaydediliyor…" : "Hedefi ata"}
      </button>
    </form>
  );
}
