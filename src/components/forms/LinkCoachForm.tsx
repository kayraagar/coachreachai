"use client";

import { useActionState } from "react";
import { linkCoach, type AuthResult } from "@/lib/actions/auth";

/** Koçu atanmamış öğrenci için bağlanma formu. */
export function LinkCoachForm() {
  const [state, formAction, pending] = useActionState<AuthResult, FormData>(linkCoach, undefined);

  return (
    <form action={formAction} className="card card-glow reveal flex flex-col gap-3 p-5">
      <div>
        <h2 className="section-title">Koçuna bağlan</h2>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Hesabın henüz bir koça bağlı değil. Koçunun paylaştığı 6 haneli kodu (veya
          e-posta adresini) gir; ilerlemeni görebilmesi için bu bağlantı gerekli.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="label">Koç kodu</span>
          <input
            name="coach_code"
            required
            autoComplete="off"
            placeholder="ÖRN. K7M2QP"
            className="field"
          />
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Bağlanıyor…" : "Bağlan"}
        </button>
      </div>

      {state?.error && (
        <p
          className="animate-slide-down rounded-xl px-3.5 py-2.5 text-sm"
          style={{ background: "var(--status-critical-soft)", color: "var(--status-critical)" }}
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
