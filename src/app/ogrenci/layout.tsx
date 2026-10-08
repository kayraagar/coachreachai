import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/ui/AppShell";
import type { NavItem } from "@/components/ui/SideNav";
import { PresenceProvider } from "@/components/realtime/PresenceProvider";
import { RealtimeRefresh } from "@/components/realtime/RealtimeRefresh";

const ITEMS: NavItem[] = [
  { href: "/ogrenci", label: "Panelim", icon: "home", exact: true },
  { href: "/ogrenci/gorusmeler", label: "Görüşme", icon: "chat" },
  { href: "/ogrenci/soru-girisi", label: "Soru", icon: "plus" },
  { href: "/ogrenci/denemeler", label: "Deneme", icon: "chart" },
  { href: "/ogrenci/program", label: "Ajanda", icon: "calendar" },
  { href: "/ogrenci/rutinler", label: "Rutin", icon: "heart" },
  { href: "/ogrenci/notlar", label: "Notlar", icon: "note" },
];

/** Öğrenci tarafında canlı takip edilen tablolar. */
const LIVE_TABLES = [
  "daily_logs",
  // Denemeler de toplam çözülen soruya sayıldığı için panel bunları da dinler.
  // (exam_results'ta student_id kolonu yok; buradaki abonelik student_id ile
  // filtrelendiğinden yalnızca exams dinlenebilir — sonuç satırları hemen
  // ardından yazıldığı için tazeleme yine doğru anda tetiklenir.)
  "exams",
  "study_plan_items",
  "study_sessions",
  "session_actions",
  "weekly_sessions",
  "goals",
  "notes",
  "daily_routines",
];

export default async function OgrenciLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/giris");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, coach_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "coach") redirect("/koc");

  const name = profile?.full_name || "Öğrenci";

  return (
    <PresenceProvider roomId={profile?.coach_id ?? null} userId={user.id} name={name} role="student">
      <RealtimeRefresh channel={`rt:student:${user.id}`} tables={LIVE_TABLES} studentId={user.id} />
      <AppShell items={ITEMS} userName={name} roleLabel="Öğrenci" userId={user.id}>
        {children}
      </AppShell>
    </PresenceProvider>
  );
}
