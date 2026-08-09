"use client";

import { useEffect, useRef, useState } from "react";

import { type TranslationKey, useLanguage } from "@/lib/language-context";

export type PrimarySection = "home" | "files" | "problems" | "quiz" | "about";

const primaryItems: Array<{
  id: PrimarySection;
  labelKey: TranslationKey;
  comingSoon?: boolean;
}> = [
  { id: "home", labelKey: "navHome" },
  { id: "files", labelKey: "navFiles" },
  { id: "problems", labelKey: "navProblems" },
  { id: "quiz", labelKey: "navQuiz", comingSoon: true },
  { id: "about", labelKey: "navAbout" },
];

type SiteHeaderProps = {
  activeSection: PrimarySection;
  onSelect: (section: PrimarySection) => void;
};

function SettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="1.7">
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.9 1.9-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.09h-2.7V20a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.9-1.9.06-.06A1.7 1.7 0 0 0 7.76 15a1.7 1.7 0 0 0-1.56-1.03h-.09v-2.7h.09a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.9-1.9.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56v-.09h2.7v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.9 1.9-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.09v2.7h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="1.7">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.7 19c.7-3.2 3-5 6.3-5s5.6 1.8 6.3 5" />
    </svg>
  );
}

export function SiteHeader({ activeSection, onSelect }: SiteHeaderProps) {
  const { language, setLanguage, t } = useLanguage();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!languageMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setLanguageMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLanguageMenuOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [languageMenuOpen]);

  const chooseLanguage = (nextLanguage: "zh-Hant" | "en") => {
    setLanguage(nextLanguage);
    setLanguageMenuOpen(false);
  };

  return (
    <header className="grid shrink-0 grid-cols-[1fr_auto] items-center border-b border-white/10 bg-[#0d121c] px-4 md:min-h-16 md:grid-cols-[1fr_auto_1fr] md:px-6">
      <div className="flex min-w-max items-center gap-2 py-4 md:py-0">
        <span className="size-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.65)]" />
        <p className="text-sm font-semibold tracking-wide text-white">Code Tutor</p>
      </div>

      <nav
        aria-label={t("mainNavigation")}
        className="order-3 col-span-2 flex h-12 max-w-full items-center justify-start gap-0 overflow-x-auto md:order-none md:col-span-1 md:h-16 md:justify-self-center md:overflow-visible"
      >
        {primaryItems.map((item) => {
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => !item.comingSoon && onSelect(item.id)}
              aria-current={active ? "page" : undefined}
              aria-disabled={item.comingSoon || undefined}
              className={`relative flex h-full shrink-0 items-center gap-1.5 px-2.5 text-xs transition-colors lg:px-3 ${
                active
                  ? "text-cyan-200"
                  : item.comingSoon
                    ? "cursor-default text-slate-600"
                    : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t(item.labelKey)}
              {item.comingSoon && (
                <span className="hidden rounded-full border border-white/8 bg-white/[0.035] px-1.5 py-0.5 text-[8px] text-slate-600 xl:inline">
                  {t("comingSoon")}
                </span>
              )}
              {active && <span className="absolute inset-x-2.5 bottom-0 h-px bg-cyan-300" />}
            </button>
          );
        })}
      </nav>

      <div className="flex items-center justify-self-end gap-1 sm:gap-2">
        <button
          type="button"
          className="hidden items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 xl:flex"
        >
          <SettingsIcon />
          {t("settings")}
        </button>
        <div className="relative flex items-center gap-2" ref={languageMenuRef}>
          <span className="text-[11px] text-slate-500">{t("languageLabel")}</span>
          <button
            type="button"
            onClick={() => setLanguageMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.025] px-2.5 py-2 text-[11px] text-slate-400 transition-colors hover:border-white/15 sm:px-3"
            aria-label={t("languageButton")}
            aria-haspopup="menu"
            aria-expanded={languageMenuOpen}
          >
            <span>{t("languageName")}</span>
            <span
              className={`text-[9px] text-slate-600 transition-transform ${languageMenuOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              ⌄
            </span>
          </button>

          {languageMenuOpen && (
            <div
              role="menu"
              aria-label={language === "zh-Hant" ? "選擇介面語言" : "Choose interface language"}
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-36 overflow-hidden rounded-xl border border-white/10 bg-[#111824] p-1.5 shadow-2xl shadow-black/40"
            >
              <button
                type="button"
                role="menuitemradio"
                aria-checked={language === "zh-Hant"}
                onClick={() => chooseLanguage("zh-Hant")}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  language === "zh-Hant"
                    ? "bg-cyan-300/10 text-cyan-200"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                繁體中文
                {language === "zh-Hant" && <span aria-hidden="true">✓</span>}
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={language === "en"}
                onClick={() => chooseLanguage("en")}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  language === "en"
                    ? "bg-cyan-300/10 text-cyan-200"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                English
                {language === "en" && <span aria-hidden="true">✓</span>}
              </button>
            </div>
          )}
        </div>
        <button
          className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:border-cyan-300/30 hover:text-cyan-200"
          type="button"
          aria-label={t("accountMenu")}
        >
          <UserIcon />
        </button>
      </div>
    </header>
  );
}
