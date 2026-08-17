export interface NavItem {
  href: string;
  label: string;
  /** Only shown to (and meant for) users with role 'admin'. */
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/pit-scout", label: "Pit Scout" },
  { href: "/pit-dashboard", label: "Pit Dash", adminOnly: true },
  { href: "/match-scout", label: "Match Scout" },
  { href: "/drive", label: "Drive", adminOnly: true },
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
