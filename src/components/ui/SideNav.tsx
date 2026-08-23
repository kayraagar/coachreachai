"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS, type NavIconName } from "./Icons";

export type NavItem = { href: string; label: string; icon: NavIconName; exact?: boolean };

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

/** Masaüstü kenar çubuğu gezinmesi. */
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Ana gezinme" className="flex flex-col gap-1">
      {items.map((item, i) => {
        const Icon = NAV_ICONS[item.icon];
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="group relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200"
            style={{
              color: active ? "var(--accent)" : "var(--text-secondary)",
              background: active ? "var(--accent-soft)" : "transparent",
              animation: "rise 420ms var(--ease-out) both",
              animationDelay: `${i * 40}ms`,
            }}
          >
            <span
              aria-hidden
              className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full transition-all duration-300"
              style={{
                background: "var(--accent)",
                opacity: active ? 1 : 0,
                transform: `translateY(-50%) scaleY(${active ? 1 : 0.2})`,
              }}
            />
            <Icon className="transition-transform duration-200 group-hover:scale-110" />
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobil alt sekme çubuğu — uygulama hissi veren ana gezinme. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Ana gezinme"
      className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t px-1 pt-1 backdrop-blur-xl lg:hidden"
      style={{
        borderColor: "var(--border-hairline)",
        background: "color-mix(in oklab, var(--surface-1) 88%, transparent)",
      }}
    >
      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="relative flex min-w-[3.75rem] flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors duration-200"
            style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
          >
            <span
              aria-hidden
              className="absolute inset-x-2 top-0 h-[2.5px] rounded-full transition-all duration-300"
              style={{
                background: "var(--accent)",
                opacity: active ? 1 : 0,
                transform: `scaleX(${active ? 1 : 0.3})`,
              }}
            />
            <Icon className="h-[1.15rem] w-[1.15rem]" />
            <span className="text-[0.62rem] font-medium leading-tight">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
