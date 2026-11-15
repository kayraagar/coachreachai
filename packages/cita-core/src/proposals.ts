/**
 * Program değişikliği önerileri (proposal).
 *
 * Model/sohbet ajandaya ASLA doğrudan yazmaz. Önerileri bu şemadaki
 * işlemler (ops) olarak üretir; öğrenci önce/sonra kartını görür.
 * Uygulama sunucuda tek bir transaction içinde yapılır
 * (bkz. migration 008 → cita_apply_plan_ops): her işlemin `before` değeri
 * mevcut satırla birebir eşleşmezse öneri "stale" olur, hiçbir şey yazılmaz.
 */
import { isIsoDate } from "./time.ts";

export type PlanRow = { id: string; date: string; title: string; minutes: number | null };

export type PlanOp =
  | { op: "add"; after: { date: string; title: string; minutes: number | null } }
  | { op: "update"; id: string; before: Omit<PlanRow, "id">; after: Omit<PlanRow, "id"> }
  | { op: "remove"; id: string; before: Omit<PlanRow, "id"> };

export const MAX_OPS = 30;

export function validateOps(ops: unknown): { ok: true; ops: PlanOp[] } | { ok: false; error: string } {
  if (!Array.isArray(ops) || ops.length === 0) return { ok: false, error: "Öneride değişiklik yok." };
  if (ops.length > MAX_OPS) return { ok: false, error: `En fazla ${MAX_OPS} değişiklik.` };
  const ids = new Set<string>();
  for (const raw of ops) {
    const o = raw as Record<string, unknown>;
    const fields = (x: unknown): boolean => {
      const r = x as Record<string, unknown> | null;
      return (
        !!r &&
        isIsoDate(r.date) &&
        typeof r.title === "string" &&
        r.title.trim().length > 0 &&
        r.title.length <= 300 &&
        (r.minutes === null || (Number.isInteger(r.minutes) && (r.minutes as number) >= 0 && (r.minutes as number) <= 720))
      );
    };
    if (o.op === "add") {
      if (!fields(o.after)) return { ok: false, error: "Eklenen görev geçersiz." };
    } else if (o.op === "update" || o.op === "remove") {
      if (typeof o.id !== "string" || !o.id) return { ok: false, error: "Görev kimliği eksik." };
      if (ids.has(o.id)) return { ok: false, error: "Aynı görev iki kez değiştirilemez." };
      ids.add(o.id);
      if (!fields(o.before)) return { ok: false, error: "Önceki hâl eksik." };
      if (o.op === "update" && !fields(o.after)) return { ok: false, error: "Yeni hâl geçersiz." };
    } else return { ok: false, error: "Bilinmeyen işlem." };
  }
  return { ok: true, ops: ops as PlanOp[] };
}

/** Önce/sonra kartı satırları. */
export function describeOps(ops: PlanOp[]) {
  return ops.map((o) => {
    if (o.op === "add") return { kind: "Eklenecek", before: null, after: o.after };
    if (o.op === "remove") return { kind: "Kaldırılacak", before: o.before, after: null };
    return { kind: "Değişecek", before: o.before, after: o.after };
  });
}

/** Mevcut satırlara uygulanabilir mi? (Sunucudaki kuralın istemci kopyası.) */
export function checkFresh(rows: PlanRow[], ops: PlanOp[]): { fresh: boolean; conflicts: string[] } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const conflicts: string[] = [];
  for (const o of ops) {
    if (o.op === "add") continue;
    const cur = byId.get(o.id);
    if (!cur) conflicts.push(`${o.before.title}: görev artık yok`);
    else if (cur.date !== o.before.date || cur.title !== o.before.title || (cur.minutes ?? null) !== (o.before.minutes ?? null))
      conflicts.push(`${o.before.title}: görev bu arada değişti`);
  }
  return { fresh: conflicts.length === 0, conflicts };
}

export type ProposalStatus = "pending_student" | "pending_coach" | "applied" | "declined" | "stale" | "cancelled";

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  pending_student: "Onayını bekliyor",
  pending_coach: "Koç onayında",
  applied: "Uygulandı",
  declined: "Reddedildi",
  stale: "Program değiştiği için geçersiz",
  cancelled: "İptal edildi",
};
