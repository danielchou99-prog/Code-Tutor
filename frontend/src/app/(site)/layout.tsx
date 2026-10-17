import type { ReactNode } from "react";

import { AppProviders } from "@/components/app-providers";
import { SiteFrame } from "@/components/site-frame";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <SiteFrame>{children}</SiteFrame>
    </AppProviders>
  );
}
