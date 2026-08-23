"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { isNavItemActive, NAV_ITEMS, type NavItem } from "@/lib/nav";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function useVisibleNavItems(): NavItem[] {
  const { profile } = useAuth();
  return NAV_ITEMS.filter((item) => !item.adminOnly || profile?.role === "admin");
}

export function DesktopTabs() {
  const pathname = usePathname();
  const items = useVisibleNavItems();

  // An admin sees fifteen tabs. At the old text-sm/px-4 the row was ~1370px
  // wide and simply overflowed the page below a maximized laptop, taking the
  // horizontal scrollbar with it. Smaller type and tighter padding bring it
  // near 1100px — one line on any normal laptop — and no-scrollbar overflow
  // keeps it ONE line at every width below that instead of breaking the
  // layout. Labels stay whole words: "Pit Dash" and "Pit Scout" are already
  // close enough without abbreviating them into each other.
  return (
    <nav className="no-scrollbar hidden overflow-x-auto border-b border-graphite-200 bg-surface px-4 md:flex">
      {items.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs transition ${
              active
                ? // maroon-200 rather than -300 in dark: at -300 the active
                  // tab was actually DIMMER than its inactive neighbours, so
                  // the row read as "nothing selected".
                  "border-maroon-600 font-semibold text-maroon-700 dark:text-maroon-200"
                : "border-transparent font-medium text-graphite-500 hover:border-graphite-300 hover:text-graphite-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Phone navigation: a hamburger in the header that opens a drawer listing every
 * section. Replaces the bottom tab strip, which could only fit a few labels on a
 * phone and hid the rest behind a horizontal scroll with no affordance.
 */
export function MobileMenu() {
  const pathname = usePathname();
  const items = useVisibleNavItems();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The drawer covers the page it just navigated to, so any route change closes
  // it — including a back/forward gesture, which never runs a link's onClick.
  // Adjusted during render rather than in an effect so the drawer never paints
  // over the new page for a frame.
  const [pathAtOpen, setPathAtOpen] = useState(pathname);
  if (pathAtOpen !== pathname) {
    setPathAtOpen(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const trigger = buttonRef.current;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      // Keep Tab inside the drawer while it's modal over the page.
      const focusable =
        panelRef.current?.querySelectorAll<HTMLElement>("a[href], button");
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  // A tablet rotating into the desktop layout hides the drawer via CSS; close it
  // so the scroll lock never outlives the visible menu.
  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (desktop.matches) setOpen(false);
    };
    onChange();
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, [open]);

  // Home isn't a tab on desktop (the header crest goes there), but the drawer is
  // the only navigation surface on a phone, so it has to list it.
  const links: NavItem[] = [{ href: "/home", label: "Home" }, ...items];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        className="rounded-md border border-maroon-300/40 p-2 text-white transition hover:border-maroon-300/70 hover:bg-maroon-800 active:bg-maroon-900 md:hidden"
      >
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full bg-graphite-900/60"
          />
          <div
            id="mobile-nav-drawer"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Sections"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-graphite-200 bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] outline-none"
          >
            <div className="flex items-center justify-between border-b border-graphite-200 px-4 py-3">
              <span className="section-title">Sections</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="btn-ghost"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 20 20"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-2">
              {links.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`block rounded-md px-3 py-3 text-sm font-medium transition ${
                      active
                        ? "bg-maroon-50 text-maroon-700 dark:text-maroon-300"
                        : "text-graphite-700 hover:bg-graphite-50 hover:text-graphite-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
