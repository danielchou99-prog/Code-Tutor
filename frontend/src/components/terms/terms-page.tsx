"use client";

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

export function TermsPage() {
  const { t } = useLanguage();
  return (
    <section className="min-w-0 flex-1 px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-white">{t("termsTitle")}</h1>
        <p className="mt-2 font-mono text-[11px] text-slate-600">{t("termsVersionLine", { version: termsVersion })}</p>
        <p className="mt-4 text-sm leading-6 text-slate-500">{t("termsIntro")}</p>
        <div className="mt-8 space-y-5">
          {articles.map((article, articleIndex) => (
            <section key={article.id} aria-labelledby={`terms-${article.id}`} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 sm:p-6">
              <h2 id={`terms-${article.id}`} className="text-sm font-semibold text-cyan-200">{articleIndex + 1}. {t(article.title)}</h2>
              <ol className="mt-4 space-y-3 text-xs leading-6 text-slate-400">
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
    </section>
  );
}
