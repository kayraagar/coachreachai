import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/cita: mobil API kendi Bearer kimlik doğrulamasını yapar (çerez yok),
// bu yüzden çerez tabanlı giriş yönlendirmesinden muaftır.
const PUBLIC_PATHS = ["/giris", "/kayit", "/auth", "/offline", "/manifest.webmanifest", "/sw.js", "/api/cita"];

// Geliştirmede mobil uygulamayı bilgisayar tarayıcısında (Expo Web) denemek için
// /api/cita'ya yerel Expo adresinden CORS izni. Kimlik Bearer ile, çerez yok;
// üretimde native uygulama CORS'a ihtiyaç duymaz, liste yalnızca env ile genişler.
const DEV_CORS_ORIGINS =
  process.env.NODE_ENV === "production" ? [] : ["http://localhost:8081", "http://127.0.0.1:8081"];
const CORS_ORIGINS = [
  ...DEV_CORS_ORIGINS,
  ...(process.env.CITA_CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
];

function citaCors(request: NextRequest): NextResponse | null {
  if (!request.nextUrl.pathname.startsWith("/api/cita")) return null;
  const origin = request.headers.get("origin");
  if (!origin || !CORS_ORIGINS.includes(origin)) return null;
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type,idempotency-key,x-cita-provider",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  if (request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers });
  const res = NextResponse.next({ request });
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export async function proxy(request: NextRequest) {
  const cors = citaCors(request);
  if (cors) return cors;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
