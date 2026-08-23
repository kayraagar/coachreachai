"use client";

import { useState } from "react";
import { IconCheck } from "./Icons";

/** Koçun öğrencilerine vereceği davet kodu — tek tıkla kopyalanır. */
export function InviteCodeCard({ code, email }: { code: string | null; email: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* pano izni yoksa sessizce geç — kod ekranda zaten görünür */
    }
  }

  return (
    <div className="rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Koç kodun
      </p>

      {code ? (
        <button
          type="button"
          onClick={copy}
          title="Kopyalamak için tıkla"
          className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-[var(--surface-inset)]"
          style={{ border: "1px solid var(--border-hairline)" }}
        >
          <span
            className="tabular text-base font-semibold tracking-[0.18em]"
            style={{ color: "var(--accent)" }}
          >
            {code}
          </span>
          <span className="text-[0.65rem]" style={{ color: copied ? "var(--status-good)" : "var(--text-muted)" }}>
            {copied ? (
              <span className="flex items-center gap-1">
                <IconCheck className="h-3 w-3" /> Kopyalandı
              </span>
            ) : (
              "Kopyala"
            )}
          </span>
        </button>
      ) : (
        <p className="mt-1 text-xs" style={{ color: "var(--status-warning)" }}>
          Kod henüz oluşmadı — 002 numaralı migration çalıştırılmalı.
        </p>
      )}

      <p className="mt-2 text-[0.7rem] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Öğrencilerin kayıt olurken bu kodu girmeli. Alternatif olarak{" "}
        <span className="break-all" style={{ color: "var(--text-secondary)" }}>
          {email}
        </span>{" "}
        adresin de kabul edilir.
      </p>
    </div>
  );
}
