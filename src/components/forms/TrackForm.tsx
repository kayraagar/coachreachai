"use client";

import { useActionState } from "react";
import { setStudentTrack } from "@/lib/actions/profile";
import type { FormResult } from "@/lib/actions/types";
import { FormStatus } from "@/components/forms/FormStatus";
import { TRACKS, TRACK_CONFIG, type Track } from "@/lib/track";

/**
 * Koçun, öğrencinin hazırlandığı sınavı düzeltmesi için küçük denetim.
 * Kol değişince ders kataloğu, deneme türleri ve net etiketleri de değişir.
 */
export function TrackForm({ studentId, track }: { studentId: string; track: Track }) {
  const [state, formAction, pending] = useActionState<FormResult, FormData>(
    setStudentTrack,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="student_id" value={studentId} />

      <div className="flex flex-wrap items-center gap-2">
        {TRACKS.map((t) => {
          const active = t === track;
          return (
            <button
              key={t}
              type="submit"
              name="track"
              value={t}
              disabled={pending || active}
              aria-pressed={active}
              className="btn"
              style={{
                background: active ? "var(--accent)" : "transparent",
                color: active ? "var(--accent-contrast)" : "var(--text-secondary)",
                border: `1px solid ${active ? "var(--accent)" : "var(--border-hairline)"}`,
                cursor: active ? "default" : undefined,
              }}
            >
              {TRACK_CONFIG[t].label}
            </button>
          );
        })}
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Şu an <strong>{TRACK_CONFIG[track].longLabel}</strong>. Değiştirirsen ders
        kataloğu, deneme türleri ve net başlıkları yeni sınava göre kurulur;
        girilmiş kayıtlar silinmez.
      </p>

      <FormStatus state={state} okText="Sınav güncellendi." />
    </form>
  );
}
