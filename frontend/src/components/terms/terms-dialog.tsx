"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { type TranslationKey, useLanguage } from "@/lib/language-context";
import { termsVersion } from "@/lib/terms";

const articles: Array<{ id: string; title: TranslationKey; items: TranslationKey[] }> = [
  { id: "account", title: "termsAccountTitle", items: ["termsAccount1", "termsAccount2"] },
  { id: "data", title: "termsDataTitle", items: ["termsData1", "termsData2", "termsData3"] },
  { id: "run", title: "termsRunTitle", items: ["termsRun1", "termsRun2", "termsRun3", "termsRun4", "termsRun5"] },
  { id: "ai", title: "termsAiTitle", items: ["termsAi1", "termsAi2", "termsAi3"] },
  { id: "content", title: "termsContentTitle", items: ["termsContent1", "termsContent2", "termsContent3", "termsContent4"] },
  { id: "service", title: "termsServiceTitle", items: ["termsService1", "termsService2"] },
  { id: "contact", title: "termsContactTitle", items: ["termsContact1", "termsContact2"] },
];

type TermsContextValue = { openTerms: () => void };

const TermsContext = createContext<TermsContextValue | null>(null);

export function useTerms(): TermsContextValue {
  const context = useContext(TermsContext);
  if (!context) throw new Error("useTerms must be used inside TermsProvider.");
  return context;
}

/** Holds the Terms of Use dialog so any page can open it from a link, without a header entry. */
export function TermsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openTerms = useCallback(() => setOpen(true), []);
  const closeTerms = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openTerms }), [openTerms]);

  return (
    <TermsContext.Provider value={value}>
      {children}
      {open ? <TermsDialog onClose={closeTerms} /> : null}
    </TermsContext.Provider>
  );
}

function TermsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    // Capture phase, so Escape closes only this dialog and not the account panel behind it.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose]);

  return (
    <>
      <button type="button" aria-label={t("closeDialog")} onClick={onClose} className="fixed inset-0 z-[90] cursor-default bg-black/70" />
      <div className="pointer-events-none fixed inset-0 z-[91] grid place-items-center px-3 py-4 sm:px-4">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-dialog-title"
          className="pointer-events-auto flex max-h-[min(44rem,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111824] shadow-2xl shadow-black/60"
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6">
            <div>
              <h2 id="terms-dialog-title" className="text-base font-semibold text-white">{t("termsTitle")}</h2>
              <p className="mt-1 font-mono text-[11px] text-slate-600">{t("termsVersionLine", { version: termsVersion })}</p>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} className="shrink-0 rounded-md px-1.5 text-lg leading-none text-slate-500 hover:text-slate-200" aria-label={t("closeDialog")}>×</button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <p className="text-xs leading-6 text-slate-500">{t("termsIntro")}</p>
            <div className="mt-5 space-y-6">
              {articles.map((article, articleIndex) => (
                <section key={article.id} aria-labelledby={`terms-${article.id}`}>
                  <h3 id={`terms-${article.id}`} className="text-xs font-semibold text-cyan-200">{articleIndex + 1}. {t(article.title)}</h3>
                  <ol className="mt-3 space-y-2.5 text-xs leading-6 text-slate-400">
                    {article.items.map((item, itemIndex) => (
                      <li key={item} className="flex gap-3">
                        <span aria-hidden="true" className="shrink-0 font-mono text-slate-600">{articleIndex + 1}.{itemIndex + 1}</span>
                        <span className="min-w-0 break-words">{t(item)}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </div>
          <footer className="flex shrink-0 justify-end border-t border-white/8 px-5 py-3 sm:px-6">
            <button type="button" onClick={onClose} className="h-9 rounded-lg border border-white/10 px-5 text-xs text-slate-300 hover:border-cyan-300/30 hover:text-cyan-200">{t("closeDialog")}</button>
          </footer>
        </section>
      </div>
    </>
  );
}
