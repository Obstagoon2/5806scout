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
  { href: "/event", label: "Event" },
  { href: "/picklist", label: "Picklist" },
  { href: "/talkie", label: "Talkie" },
  { href: "/assignments", label: "Assignments" },
  { href: "/data", label: "Data" },
  { href: "/manual-qa", label: "Manual Q&A" },
  { href: "/team", label: "Team" },
];
