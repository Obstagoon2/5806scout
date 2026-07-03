export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/pit-scout", label: "Pit Scout" },
  { href: "/match-scout", label: "Match Scout" },
  { href: "/event", label: "Event" },
  { href: "/picklist", label: "Picklist" },
  { href: "/talkie", label: "Talkie" },
  { href: "/data", label: "Data" },
  { href: "/manual-qa", label: "Manual Q&A" },
  { href: "/team", label: "Team" },
];
