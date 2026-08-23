import { signOut } from "@/lib/actions/auth";
import { SideNav, BottomNav, type NavItem } from "./SideNav";
import { ThemeToggle } from "./ThemeToggle";
import { IconLogout } from "./Icons";
import { Logo } from "./Logo";
import { OnlineList } from "@/components/realtime/PresenceProvider";

export function AppShell({
  items,
  userName,
  roleLabel,
  userId,
  aside,
  children,
}: {
  items: NavItem[];
  userName: string;
  roleLabel: string;
  /** Presence listesinde kendini gizlemek için. */
  userId: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative z-[1] flex-1 lg:flex">
      {/* --- masaüstü kenar çubuğu --- */}
      <aside
        className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between overflow-y-auto border-r px-4 py-5 lg:flex"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
      >
        <div className="flex flex-col gap-5">
          <div className="border-b pb-4" style={{ borderColor: "var(--border-hairline)" }}>
            <Logo />
          </div>
          <SideNav items={items} />
          <OnlineList selfId={userId} />
          {aside}
        </div>
        <UserBox userName={userName} roleLabel={roleLabel} />
      </aside>

      {/* --- mobil üst çubuk --- */}
      <header
        className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur-xl lg:hidden"
        style={{
          borderColor: "var(--border-hairline)",
          background: "color-mix(in oklab, var(--surface-1) 82%, transparent)",
        }}
      >
        <Logo size={30} />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost !px-2.5 !py-2" aria-label="Çıkış yap">
              <IconLogout />
            </button>
          </form>
        </div>
      </header>

      <main className="pb-nav mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-10">
        {children}
      </main>

      <BottomNav items={items} />
    </div>
  );
}

function UserBox({ userName, roleLabel }: { userName: string; roleLabel: string }) {
  const initials = userName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div className="mt-5 flex flex-col gap-3">
      <div
        className="flex items-center gap-3 rounded-xl px-3 py-2.5"
        style={{ background: "var(--surface-2)" }}
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {initials || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {userName}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {roleLabel}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <form action={signOut} className="flex-1">
          <button type="submit" className="btn btn-ghost w-full">
            <IconLogout />
            Çıkış
          </button>
        </form>
      </div>
    </div>
  );
}
