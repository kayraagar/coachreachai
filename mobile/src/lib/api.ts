/**
 * Çita sunucu API'si (Next.js /api/cita/*). Kullanıcının Supabase erişim
 * belirteci Bearer olarak gider; sunucu kimliği doğrular ve paket/kota
 * kararlarını kendisi verir. Ağ hatalarında aynı idempotency anahtarıyla
 * tekrar denenir, böylece çift kayıt / çift hak düşümü olmaz.
 */
import { config, supabase } from "./supabase";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string; retries?: number; auth?: boolean } = {}
): Promise<T> {
  const retries = init.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (init.auth !== false) {
        const t = await token();
        if (t) headers.Authorization = `Bearer ${t}`;
      }
      if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
      const res = await fetch(`${config.apiUrl}${path}`, {
        method: init.method ?? (init.body ? "POST" : "GET"),
        headers,
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const err = new ApiError(res.status, String(json.code ?? "error"), String(json.error ?? "Sunucu hatası"));
        // 4xx kalıcıdır; yalnızca 5xx ve ağ hatası tekrar denenir.
        if (res.status < 500) throw err;
        lastErr = err;
      } else return json as T;
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) throw e;
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }
  if (lastErr instanceof ApiError) throw lastErr;
  throw new ApiError(0, "network", "Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.");
}

/** Çok parçalı yükleme (soru fotoğrafı). */
export async function apiUpload<T>(path: string, form: FormData, idempotencyKey: string): Promise<T> {
  const t = await token();
  const res = await fetch(`${config.apiUrl}${path}`, {
    method: "POST",
    headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), "Idempotency-Key": idempotencyKey },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(json.code ?? "error"), String(json.error ?? "Yükleme başarısız"));
  return json as T;
}
