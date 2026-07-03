"use client";

import { NAV_ITEMS } from "@/lib/nav";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function DesktopTabs() {
  const pathname = usePathname();

  return (
    <nav className="hidden border-b border-graphite-200 bg-white px-6 md:flex">
      {NAV_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
              active
                ? "border-maroon-600 text-maroon-700"
                : "border-transparent text-graphite-500 hover:text-graphite-900"
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

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-graphite-200 bg-white md:hidden">
      {NAV_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium leading-tight ${
              active ? "text-maroon-700" : "text-graphite-500"
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${active ? "bg-maroon-600" : "bg-transparent"}`}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
