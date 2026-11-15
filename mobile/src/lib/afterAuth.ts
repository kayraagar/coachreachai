import { importDraft, loadDraft, type ImportResult } from "./draft";

/**
 * Giriş/kayıt sonrası: cihazdaki taslak varsa hesaba aktar.
 * Ağ hatasında taslak cihazda kalır ve aynı requestId ile tekrar denenir.
 */
export async function importPendingDraft(): Promise<{ result: ImportResult | null; message: string | null }> {
  const draft = await loadDraft();
  if (!draft) return { result: null, message: null };
  const result = await importDraft(draft);
  if (result.status === "plan_exists")
    return { result, message: "Hesabında zaten bir program var; mevcut programın korundu. Değişiklikleri Koç sekmesinden önerebilirsin." };
  return { result, message: null };
}
