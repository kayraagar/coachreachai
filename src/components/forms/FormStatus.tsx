import type { FormResult } from "@/lib/actions/types";

/** Form sonuç mesajı — hata ve başarı için ortak görünüm. */
export function FormStatus({ state, okText }: { state: FormResult; okText?: string }) {
  if (!state) return null;

  if ("error" in state) {
    return (
      <p
        className="animate-slide-down rounded-xl px-3.5 py-2.5 text-sm"
        style={{ background: "var(--status-critical-soft)", color: "var(--status-critical)" }}
      >
        {state.error}
      </p>
    );
  }

  if (!okText) return null;

  return (
    <p
      className="animate-slide-down rounded-xl px-3.5 py-2.5 text-sm"
      style={{ background: "var(--status-good-soft)", color: "var(--status-good)" }}
    >
      {okText}
    </p>
  );
}
