import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

/**
 * Mobil uygulama yalnızca herkese açık (anon) anahtarı taşır; tüm erişim
 * Supabase RLS ile sınırlıdır. Servis anahtarı ve AI/ödeme sırları yalnızca
 * Next.js sunucusundadır (EXPO_PUBLIC_API_URL).
 */
/**
 * Bilgisayarda Expo Web ile test ederken (localhost:8081) API aynı makinede
 * 3000 portundadır; Mac'in Wi-Fi adresi değişse de bozulmasın diye web'de
 * sayfanın açıldığı adres kullanılır. Telefonda .env'deki adres geçerlidir.
 */
function resolveApiUrl(): string {
  const fromEnv = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return `http://${host}:3000`;
  }
  return fromEnv;
}

export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  apiUrl: resolveApiUrl(),
};

export const configMissing = !config.supabaseUrl || !config.supabaseAnonKey || !config.apiUrl;

export const supabase: SupabaseClient = createClient(
  config.supabaseUrl || "http://invalid.localhost",
  config.supabaseAnonKey || "missing",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
