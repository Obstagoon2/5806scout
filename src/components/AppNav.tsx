"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { NAV_ITEMS, type NavItem } from "@/lib/nav";
import Link from "next/link";
import { usePathname } from "next/navigation";

function useVisibleNavItems(): NavItem[] {
  const { profile } = useAuth();
  return NAV_ITEMS.filter((item) => !item.adminOnly || profile?.role === "admin");
}

export function DesktopTabs() {
  const pathname = usePathname();
  const items = useVisibleNavItems();

  return (
    <nav className="hidden border-b border-graphite-200 bg-surface px-6 md:flex">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative border-b-2 px-4 py-3 text-sm font-medium transition ${
              active
                ? "border-maroon-600 text-maroon-700 dark:text-maroon-300"
                : "border-transparent text-graphite-500 hover:border-graphite-200 hover:text-graphite-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const items = useVisibleNavItems();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex overflow-x-auto border-t border-graphite-200 bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] [scrollbar-width:none] md:hidden">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-[64px] flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium leading-tight transition ${
              active ? "text-maroon-700 dark:text-maroon-300" : "text-graphite-500"
            }`}
          >
            <span
              aria-hidden
              className={`h-1 w-5 rounded-full transition-colors ${
                active ? "bg-maroon-600" : "bg-transparent"
              }`}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
