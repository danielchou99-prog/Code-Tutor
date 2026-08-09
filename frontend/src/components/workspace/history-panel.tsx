import type { FileProject } from "@/lib/file-items";
import { useLanguage } from "@/lib/language-context";

export function HistoryPanel({ project, onBack }: { project: FileProject; onBack: () => void }) {
  const { t } = useLanguage();

  return (
    <aside className="hidden border-r border-white/6 bg-[#0b1018] p-4 lg:block">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-[11px] text-slate-500 hover:text-cyan-200">
        <span aria-hidden="true">←</span>{t("backToFiles")}
      </button>

      <div className="mt-6">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">{t("currentProject")}</p>
        <div className="mt-3 rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] p-3">
          <span className="grid size-8 place-items-center rounded-lg bg-cyan-300/[0.07] font-mono text-[9px] font-bold text-cyan-200">C++</span>
          <p className="mt-3 break-words text-xs font-medium leading-5 text-slate-300">{project.name}</p>
        </div>
      </div>

      <div className="mt-7 border-t border-white/6 pt-5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">{t("projectFiles")}</p>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/[0.025] px-3 py-2.5 font-mono text-[11px] text-slate-400">
          <span className="text-cyan-300/60">C++</span>
          <span>main.cpp</span>
        </div>
      </div>

      <div className="mt-7 border-t border-white/6 pt-5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">{t("recentRuns")}</p>
        <p className="mt-3 text-[10px] leading-5 text-slate-700">{t("noRecentRuns")}</p>
      </div>
    </aside>
  );
}
