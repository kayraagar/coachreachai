"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthResult } from "@/lib/actions/auth";
import { AuthShell, AuthField } from "@/components/ui/AuthShell";

export default function GirisPage() {
  const [state, formAction, pending] = useActionState<AuthResult, FormData>(signIn, undefined);

  return (
    <AuthShell
      title="YKS Koçluk"
      subtitle="Hesabına giriş yap"
      footer={
        <>
          Hesabın yok mu?{" "}
          <Link href="/kayit" className="link-underline font-medium" style={{ color: "var(--accent)" }}>
            Kayıt ol
          </Link>
        </>
      }
    >
      <form action={formAction} className="flex flex-col gap-4">
        <AuthField label="E-posta" name="email" type="email" autoComplete="email" />
        <AuthField label="Şifre" name="password" type="password" autoComplete="current-password" />

        {state?.error && (
          <p
            className="animate-slide-down rounded-xl px-3.5 py-2.5 text-sm"
            style={{ background: "var(--status-critical-soft)", color: "var(--status-critical)" }}
          >
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn btn-primary mt-1 w-full">
          {pending ? "Giriş yapılıyor…" : "Giriş yap"}
        </button>
      </form>
    </AuthShell>
  );
}
