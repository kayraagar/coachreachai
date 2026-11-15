import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/ui/AppShell";
import type { NavItem } from "@/components/ui/SideNav";
import { PresenceProvider } from "@/components/realtime/PresenceProvider";
import { RealtimeRefresh } from "@/components/realtime/RealtimeRefresh";
import { InviteCodeCard } from "@/components/ui/InviteCodeCard";

const ITEMS: NavItem[] = [
  { href: "/koc", label: "Öğrencilerim", icon: "users", exact: true },
  { href: "/koc/onaylar", label: "Onaylar", icon: "target" },
];
const ADMIN_ITEM: NavItem = { href: "/admin", label: "Ekip", icon: "home" };

/**
 * Koç filtresiz abone olur; RLS sayesinde yalnızca kendi öğrencilerinin
 * satır değişiklikleri kendisine ulaşır.
 */
const LIVE_TABLES = [
  "plan_proposals",
  "daily_logs",
  "study_sessions",
  "study_plan_items",
  "exams",
  "exam_results",
  "notes",
  "session_actions",
  "daily_routines",
];

export default async function KocLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/giris");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email, invite_code, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "coach") redirect("/ogrenci");

  const name = profile?.full_name || "Koç";

  return (
    <PresenceProvider roomId={user.id} userId={user.id} name={name} role="coach">
      <RealtimeRefresh channel={`rt:coach:${user.id}`} tables={LIVE_TABLES} />
      <AppShell
        items={profile?.is_admin ? [...ITEMS, ADMIN_ITEM] : ITEMS}
        userName={name}
        roleLabel="Koç"
        userId={user.id}
        aside={
          <InviteCodeCard code={profile?.invite_code ?? null} email={profile?.email ?? ""} />
        }
      >
        {children}
      </AppShell>
    </PresenceProvider>
  );
}
