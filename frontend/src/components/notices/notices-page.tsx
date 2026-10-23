"use client";

import { type TranslationKey, useLanguage } from "@/lib/language-context";

const sections: Array<{ id: string; title: TranslationKey; items: TranslationKey[] }> = [
  { id: "data", title: "noticeDataTitle", items: ["noticeData1", "noticeData2", "noticeData3"] },
  { id: "run", title: "noticeRunTitle", items: ["noticeRun1", "noticeRun2", "noticeRun3", "noticeRun4"] },
  { id: "ai", title: "noticeAiTitle", items: ["noticeAi1", "noticeAi2", "noticeAi3"] },
  { id: "source", title: "noticeSourceTitle", items: ["noticeSource1", "noticeSource2", "noticeSource3", "noticeSource4"] },
];

export function NoticesPage() {
  const { t } = useLanguage();
  return (
    <section className="min-w-0 flex-1 px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-white">{t("noticesTitle")}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{t("noticesIntro")}</p>
        <div className="mt-8 space-y-5">
          {sections.map((section) => (
            <section key={section.id} aria-labelledby={`notice-${section.id}`} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 sm:p-6">
              <h2 id={`notice-${section.id}`} className="text-sm font-semibold text-cyan-200">{t(section.title)}</h2>
              <ul className="mt-4 space-y-3 text-xs leading-6 text-slate-400">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-cyan-300/60" />
                    <span className="min-w-0 break-words">{t(item)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
