import type { FileProject, ProjectFile } from "@/lib/file-items";
import { useLanguage } from "@/lib/language-context";

export function HistoryPanel({
  activeFileId,
  files,
  project,
  onBack,
  onOpenFile,
}: {
  activeFileId: string | null;
  files: ProjectFile[];
  project: FileProject;
  onBack: () => void;
  onOpenFile: (fileId: string) => void;
}) {
  const { language, t } = useLanguage();

  return (
    <aside className="hidden border-r border-white/6 bg-[#0b1018] p-4 lg:block lg:h-full lg:overflow-y-auto">
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
        <div className="mt-3 space-y-1">
          {files.length ? files.map((file) => {
            const active = file.id === activeFileId;
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => onOpenFile(file.id)}
                aria-current={active ? "page" : undefined}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left font-mono text-[11px] transition-colors ${
                  active
                    ? "bg-cyan-300/[0.07] text-cyan-200"
                    : "bg-white/[0.025] text-slate-500 hover:bg-white/[0.045] hover:text-slate-300"
                }`}
              >
                <span className={active ? "text-cyan-300" : "text-slate-700"}>C++</span>
                <span className="min-w-0 truncate">{file.name}</span>
              </button>
            );
          }) : (
            <p className="px-1 text-[10px] leading-5 text-slate-700">
              {language === "zh-Hant" ? "這個 Project 尚無檔案" : "This project has no files"}
            </p>
          )}
        </div>
      </div>

      <div className="mt-7 border-t border-white/6 pt-5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">{t("recentRuns")}</p>
        <p className="mt-3 text-[10px] leading-5 text-slate-700">{t("noRecentRuns")}</p>
      </div>
    </aside>
  );
}
