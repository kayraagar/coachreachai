"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUp, type AuthResult } from "@/lib/actions/auth";
import { AuthShell, AuthField } from "@/components/ui/AuthShell";

export default function KayitPage() {
  const [state, formAction, pending] = useActionState<AuthResult, FormData>(signUp, undefined);
  const [role, setRole] = useState<"student" | "coach">("student");

  return (
    <AuthShell
      subtitle="Yeni hesap oluştur"
      footer={
        <>
          Zaten hesabın var mı?{" "}
          <Link href="/giris" className="link-underline font-medium" style={{ color: "var(--accent)" }}>
            Giriş yap
          </Link>
        </>
      }
    >
      <form action={formAction} className="flex flex-col gap-4">
        <div
          className="flex gap-1 rounded-xl border p-1 text-sm"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-2)" }}
        >
          {(
            [
              { value: "student", label: "Öğrenciyim" },
              { value: "coach", label: "Koçum" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRole(opt.value)}
              className="flex-1 rounded-lg py-1.5 font-medium transition-all duration-200"
              style={{
                background: role === opt.value ? "var(--accent)" : "transparent",
                color: role === opt.value ? "var(--accent-contrast)" : "var(--text-secondary)",
                boxShadow: role === opt.value ? "var(--shadow-sm)" : "none",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="role" value={role} />

        <AuthField label="Ad Soyad" name="full_name" type="text" autoComplete="name" />
        <AuthField label="E-posta" name="email" type="email" autoComplete="email" />
        <AuthField
          label="Şifre (en az 6 karakter)"
          name="password"
          type="password"
          autoComplete="new-password"
        />

        {role === "student" && (
          <div className="animate-slide-down flex flex-col gap-1.5">
            <AuthField
              label="Koç kodu"
              name="coach_code"
              type="text"
              autoComplete="off"
              placeholder="ÖRN. K7M2QP"
            />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Koçunun panelinde gördüğü 6 haneli kod. Dilersen koçunun e-posta
              adresini de yazabilirsin.
            </p>
          </div>
        )}

        {state?.error && (
          <p
            className="animate-slide-down rounded-xl px-3.5 py-2.5 text-sm"
            style={{ background: "var(--status-critical-soft)", color: "var(--status-critical)" }}
          >
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn btn-primary mt-1 w-full">
          {pending ? "Kaydediliyor…" : "Kayıt ol"}
        </button>
      </form>
    </AuthShell>
  );
}
