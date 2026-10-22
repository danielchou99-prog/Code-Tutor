import { languageLabel, type FileProject, type ProgrammingLanguage, type ProjectFile } from "@/lib/file-items";
import { requestSignIn } from "@/lib/guest-workspace";
import { useLanguage } from "@/lib/language-context";

export function HistoryPanel({
  activeFileId,
  files,
  project,
  onBack,
  onOpenFile,
  onSwitchLanguage,
}: {
  activeFileId: string | null;
  files: ProjectFile[];
  project: FileProject;
  onBack: () => void;
  onOpenFile: (fileId: string) => void;
  /** Guest workspaces only: restart the workspace in another language. */
  onSwitchLanguage?: (language: ProgrammingLanguage) => void;
}) {
  const { t } = useLanguage();

  return (
    <aside className="hidden border-r border-white/6 bg-[#0b1018] p-4 lg:block lg:h-full lg:overflow-y-auto">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-[11px] text-slate-500 hover:text-cyan-200">
        <span aria-hidden="true">←</span>{t(project.guest ? "signInToManageFiles" : "backToFiles")}
      </button>

      <div className="mt-6">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">{t("currentProject")}</p>
        <div className="mt-3 rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] p-3">
          <span className="grid min-w-8 place-items-center rounded-lg bg-cyan-300/[0.07] px-1 py-2 font-mono text-[9px] font-bold text-cyan-200">{languageLabel(project.language)}</span>
          <p className="mt-3 break-words text-xs font-medium leading-5 text-slate-300">{project.name}</p>
        </div>
      </div>

      {project.guest ? (
        <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <p className="text-[10px] leading-5 text-slate-500">{t("guestWorkspaceHint")}</p>
          <button type="button" onClick={requestSignIn} className="mt-3 h-8 w-full rounded-lg bg-cyan-400 text-[11px] font-bold text-slate-950 hover:bg-cyan-300">
            {t("signInToSave")}
          </button>
          {onSwitchLanguage ? (
            <div className="mt-3 flex items-center gap-1.5" role="group" aria-label={t("languageLabel")}>
              {(["cpp", "python"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={project.language === value}
                  onClick={() => project.language !== value && onSwitchLanguage(value)}
                  className={`h-7 flex-1 rounded-lg border text-[10px] ${project.language === value ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-white/8 text-slate-500 hover:text-slate-300"}`}
                >
                  {languageLabel(value)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

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
                <span className={active ? "text-cyan-300" : "text-slate-700"}>{file.name.toLocaleLowerCase().endsWith(".py") ? "PY" : "C++"}</span>
                <span className="min-w-0 truncate">{file.name}</span>
              </button>
            );
          }) : (
            <p className="px-1 text-[10px] leading-5 text-slate-700">
              {t("thisProjectHasNoFiles")}
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
