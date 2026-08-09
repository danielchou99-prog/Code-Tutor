import { type TranslationKey, useLanguage } from "@/lib/language-context";

const actions: Array<{ titleKey: TranslationKey; detailKey: TranslationKey; icon: string }> = [
  { titleKey: "analyzeCode", detailKey: "analyzeCodeDetail", icon: "⌁" },
  { titleKey: "explainError", detailKey: "explainErrorDetail", icon: "!" },
  { titleKey: "giveHint", detailKey: "giveHintDetail", icon: "✦" },
];

export function AiTutorPanel() {
  const { t } = useLanguage();

  return (
    <aside className="flex min-h-[520px] flex-col bg-[#0b1018]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/8 px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-violet-300">✦</span>
          <h2 className="text-xs font-semibold text-slate-200">{t("aiTutor")}</h2>
        </div>
        <span className="rounded-full border border-violet-400/15 bg-violet-400/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-300">
          {t("coachMode")}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="rounded-2xl rounded-tl-md border border-white/8 bg-white/[0.035] p-4">
          <p className="text-xs leading-5 text-slate-300">
            {t("tutorGreeting")}
          </p>
        </div>

        <p className="mb-2 mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          {t("quickActions")}
        </p>
        <div className="space-y-2">
          {actions.map((action) => (
            <button
              key={action.titleKey}
              type="button"
              className="group flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-3 text-left transition-colors hover:border-cyan-400/20 hover:bg-cyan-400/[0.04]"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-800 text-xs font-semibold text-cyan-300 group-hover:bg-cyan-400/10">
                {action.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-slate-300">
                    {t(action.titleKey)}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-slate-600">
                    {t(action.detailKey)}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.025] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
              {t("context")}
            </p>
            <span className="size-1.5 rounded-full bg-cyan-300" />
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">
            {t("contextDetail")}
          </p>
        </div>
      </div>

      <div className="border-t border-white/8 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-white/[0.035] p-2 pl-3">
          <span className="flex-1 py-1 text-[11px] text-slate-600">
            {t("askCode")}
          </span>
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-400 text-sm font-bold text-slate-950"
            aria-label={t("sendMessage")}
          >
            ↑
          </button>
        </div>
      </div>
    </aside>
  );
}
