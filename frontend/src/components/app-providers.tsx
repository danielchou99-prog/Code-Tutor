"use client";

import type { ReactNode } from "react";

import { TermsProvider } from "@/components/terms/terms-dialog";
import { AuthProvider } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/language-context";
import { SettingsProvider } from "@/lib/settings-context";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <SettingsProvider>
        <AuthProvider>
          <TermsProvider>{children}</TermsProvider>
        </AuthProvider>
      </SettingsProvider>
    </LanguageProvider>
  );
}
