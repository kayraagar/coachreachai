import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Mobil uygulama yalnızca herkese açık (anon) anahtarı taşır; tüm erişim
 * Supabase RLS ile sınırlıdır. Servis anahtarı ve AI/ödeme sırları yalnızca
 * Next.js sunucusundadır (EXPO_PUBLIC_API_URL).
 */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, ""),
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
