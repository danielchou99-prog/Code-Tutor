"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type AppSettings = {
  accent: "cyan" | "violet" | "emerald";
  background: "plain" | "grid" | "soft";
  editorFont: "JetBrains Mono" | "Fira Code" | "Cascadia Code" | "Consolas";
  editorFontSize: number;
  tabSize: 2 | 4 | 8;
  wordWrap: boolean;
  consoleHeight: number;
  sidebarWidth: number;
  aiPanelWidth: number;
  panelPlacement: "right" | "bottom";
  saveBeforeRun: boolean;
  autoCompile: boolean;
  clearConsoleOnRun: boolean;
  runShortcutEnabled: boolean;
  saveShortcutEnabled: boolean;
  notifySuccess: boolean;
  notifyError: boolean;
  notifySystem: boolean;
};

const storageKey = "code-tutor:settings";

export const defaultAppSettings: AppSettings = {
  accent: "cyan",
  background: "plain",
  editorFont: "Cascadia Code",
  editorFontSize: 14,
  tabSize: 4,
  wordWrap: false,
  consoleHeight: 208,
  sidebarWidth: 220,
  aiPanelWidth: 320,
  panelPlacement: "right",
  saveBeforeRun: false,
  autoCompile: false,
  clearConsoleOnRun: true,
  runShortcutEnabled: true,
  saveShortcutEnabled: true,
  notifySuccess: true,
  notifyError: true,
  notifySystem: true,
};

type SettingsContextValue = {
  settings: AppSettings;
  updateSettings: (values: Partial<AppSettings>) => void;
  resetSettings: () => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function normalizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object") return defaultAppSettings;
  const input = value as Partial<AppSettings>;
  const allowedFonts = ["JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas"] as const;
  return {
    ...defaultAppSettings,
    ...input,
    accent: ["cyan", "violet", "emerald"].includes(String(input.accent)) ? input.accent! : defaultAppSettings.accent,
    background: ["plain", "grid", "soft"].includes(String(input.background)) ? input.background! : defaultAppSettings.background,
    editorFont: allowedFonts.includes(input.editorFont as (typeof allowedFonts)[number]) ? input.editorFont! : defaultAppSettings.editorFont,
    editorFontSize: Math.min(20, Math.max(12, Number(input.editorFontSize) || defaultAppSettings.editorFontSize)),
    tabSize: [2, 4, 8].includes(Number(input.tabSize)) ? input.tabSize! : defaultAppSettings.tabSize,
    consoleHeight: Math.min(360, Math.max(160, Number(input.consoleHeight) || defaultAppSettings.consoleHeight)),
    sidebarWidth: Math.min(280, Math.max(180, Number(input.sidebarWidth) || defaultAppSettings.sidebarWidth)),
    aiPanelWidth: Math.min(420, Math.max(280, Number(input.aiPanelWidth) || defaultAppSettings.aiPanelWidth)),
    panelPlacement: input.panelPlacement === "bottom" ? "bottom" : "right",
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) setSettings(normalizeSettings(JSON.parse(saved)));
      } catch {
        // Invalid or blocked local storage falls back to safe defaults.
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    const colors = { cyan: "#67e8f9", violet: "#c4b5fd", emerald: "#6ee7b7" } as const;
    document.documentElement.style.setProperty("--code-tutor-accent", colors[settings.accent]);
    document.documentElement.dataset.codeTutorBackground = settings.background;
  }, [settings.accent, settings.background]);

  const value = useMemo<SettingsContextValue>(() => ({
    settings,
    updateSettings(values) {
      setSettings((current) => {
        const next = normalizeSettings({ ...current, ...values });
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Settings still apply to the current tab when storage is unavailable.
        }
        return next;
      });
    },
    resetSettings() {
      setSettings(defaultAppSettings);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(defaultAppSettings));
      } catch {
        // Reset still applies to the current tab.
      }
    },
  }), [settings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside SettingsProvider.");
  return context;
}
