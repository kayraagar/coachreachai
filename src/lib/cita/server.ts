/**
 * Mobil API (/api/cita/*) için sunucu yardımcıları.
 *
 * - `requireUser`: Authorization: Bearer <supabase access token> doğrular ve
 *   bu kullanıcı adına (RLS'e tabi) bir Supabase istemcisi döner.
 * - `serviceClient`: yalnızca sunucuda, RLS'i aşan işlemler için (mağaza
 *   olayları, depolama). Anahtar asla istemciye gitmez.
 */
import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
  console.error("[cita-api]", e);
  return json({ error: "Beklenmeyen bir hata oluştu.", code: "internal" }, 500);
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new HttpError(503, "not_configured", `${name} tanımlı değil`);
  return v;
}

export type Authed = { user: User; db: SupabaseClient; token: string };

export async function requireUser(req: Request): Promise<Authed> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "auth_required", "Oturum gerekli.");
  const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "auth_invalid", "Oturum geçersiz ya da süresi dolmuş.");
  return { user: data.user, db, token };
}

let service: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient {
  if (!service) {
    service = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return service;
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "bad_json", "Geçersiz istek gövdesi.");
  }
}

export function idempotencyKey(req: Request): string {
  const k = req.headers.get("idempotency-key") ?? "";
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(k)) throw new HttpError(400, "idempotency_key", "Idempotency-Key başlığı gerekli (8–100 karakter).");
  return k;
}

export type StudentProfile = { id: string; role: string; track: "YKS" | "LGS"; coach_id: string | null; full_name: string };

export async function requireStudent(req: Request): Promise<Authed & { profile: StudentProfile }> {
  const a = await requireUser(req);
  const { data } = await a.db.from("profiles").select("id, role, track, coach_id, full_name").eq("id", a.user.id).maybeSingle();
  if (!data || data.role !== "student") throw new HttpError(403, "student_only", "Bu işlem yalnızca öğrenci hesapları içindir.");
  return { ...a, profile: data as StudentProfile };
}
