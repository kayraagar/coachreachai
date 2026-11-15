import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/ui/AppShell";
import type { NavItem } from "@/components/ui/SideNav";

const ITEMS: NavItem[] = [
  { href: "/admin", label: "Koç atama", icon: "users", exact: true },
  { href: "/admin/kaynaklar", label: "Kaynaklar", icon: "note" },
  { href: "/admin/ayarlar", label: "Ayarlar", icon: "target" },
  { href: "/koc", label: "Koç paneli", icon: "home" },
];

/** Çita ekip yönetimi. Yetki: profiles.is_admin (yalnızca SQL/servis rolüyle verilir). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/giris");
  const { data: profile } = await supabase.from("profiles").select("full_name, is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) redirect("/");
  return (
    <AppShell items={ITEMS} userName={profile.full_name || "Ekip"} roleLabel="Çita ekibi" userId={user.id}>
      {children}
    </AppShell>
  );
}
