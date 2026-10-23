import type { PrimarySection } from "@/components/site-header";

export const sectionPaths = {
  home: "/home",
  files: "/files",
  problems: "/problems",
  quiz: "/quiz",
  notices: "/notices",
  settings: "/settings",
} as const satisfies Record<PrimarySection, string>;

export function sectionFromPathname(pathname: string): PrimarySection {
  const entries = Object.entries(sectionPaths) as Array<[PrimarySection, string]>;
  const match = entries.find(([, path]) => pathname === path || pathname.startsWith(`${path}/`));
  return match ? match[0] : "home";
}
