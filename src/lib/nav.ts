export interface NavItem {
  href: string;
  label: string;
  /** Only shown to (and meant for) users with role 'admin'. */
  adminOnly?: boolean;
}

/**
 * Whether a nav item is the one the current path belongs to. Matches on
 * segment boundaries, not a bare prefix — `/teams/254` (a team breakdown
 * page) must not light up the `/team` tab.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const NAV_ITEMS: NavItem[] = [
  // Role-split: scouts get their own work list, admins the crew-wide picture.
  // Both roles get something, so it isn't adminOnly.
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pit-scout", label: "Pit Scout" },
  { href: "/pit-dashboard", label: "Pit Dash", adminOnly: true },
  { href: "/match-scout", label: "Match Scout" },
  { href: "/drive", label: "Drive Dash", adminOnly: true },
  { href: "/event", label: "Event" },
  { href: "/picklist", label: "Picklist" },
  { href: "/talkie", label: "Talkie" },
  // Scouts see their own assignments inline at the top of the Pit Scout and
  // Match Scout tabs; this page is the everyone-at-once view admins need.
  { href: "/assignments", label: "Assignments", adminOnly: true },
  { href: "/data", label: "Data" },
  { href: "/manual-qa", label: "Manual Q&A" },
  { href: "/team", label: "Team" },
  { href: "/form-settings", label: "Settings", adminOnly: true },
];
