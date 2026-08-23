"use client";

import { useActionState } from "react";
import { addNote } from "@/lib/actions/notes";
import type { FormResult } from "@/lib/actions/types";
import { MOOD_OPTIONS } from "@/lib/labels";
import { FormStatus } from "@/components/forms/FormStatus";

export function NoteForm({ studentId }: { studentId?: string }) {
  const [state, formAction, pending] = useActionState<FormResult, FormData>(addNote, undefined);

  return (
    <form action={formAction} className="card flex h-full flex-col gap-4 p-5">
      {studentId && <input type="hidden" name="student_id" value={studentId} />}
      <h2 className="section-title">Yeni not</h2>

      <label className="flex flex-col gap-1.5">
        <span className="label">Not</span>
        <textarea
          name="content"
          required
          rows={3}
          placeholder="Bugün nasıl geçti, neye takıldın, motivasyon durumun…"
          className="field"
        />
      </label>

      <label className="flex w-fit flex-col gap-1.5">
        <span className="label">Ruh hali (opsiyonel)</span>
        <select name="mood" defaultValue="" className="field">
          <option value="">—</option>
          {MOOD_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <FormStatus state={state} okText="Not eklendi." />

      <button type="submit" disabled={pending} className="btn btn-primary mt-auto self-start">
        {pending ? "Ekleniyor…" : "Notu ekle"}
      </button>
    </form>
  );
}
