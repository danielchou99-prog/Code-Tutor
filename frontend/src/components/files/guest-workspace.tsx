"use client";

import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProjectWorkspace } from "@/components/workspace/project-workspace";
import { type FileProject, languageLabel, type ProgrammingLanguage } from "@/lib/file-items";
import { loadGuestProject, requestSignIn, resetGuestWorkspace } from "@/lib/guest-workspace";
import { useLanguage } from "@/lib/language-context";
import { useSettings } from "@/lib/settings-context";

const ignoreDirtyChange = () => undefined;

/** The editor for visitors who are not signed in. Signing in is only needed to save. */
export function GuestWorkspace() {
  const { t } = useLanguage();
  const { settings } = useSettings();
  const [project, setProject] = useState<FileProject | null>(null);
  const [switchTarget, setSwitchTarget] = useState<ProgrammingLanguage | null>(null);
  const defaultLanguage = settings.defaultProgrammingLanguage;
  const projectName = t("guestProjectName");

  useEffect(() => {
    const timer = window.setTimeout(() => setProject(loadGuestProject(defaultLanguage, projectName)), 0);
    return () => window.clearTimeout(timer);
  }, [defaultLanguage, projectName]);

  if (!project) {
    return (
      <section className="grid min-w-0 flex-1 place-items-center bg-[#090d14] px-6 py-20 text-center">
        <p className="text-xs text-slate-600">{t("guestWorkspaceLoading")}</p>
      </section>
    );
  }

  const confirmSwitch = () => {
    if (!switchTarget) return;
    resetGuestWorkspace(switchTarget);
    setProject(loadGuestProject(switchTarget, projectName));
    setSwitchTarget(null);
  };

  return (
    <>
      <ProjectWorkspace
        key={`${project.id}:${project.language}`}
        onBack={requestSignIn}
        onDirtyChange={ignoreDirtyChange}
        onSwitchLanguage={setSwitchTarget}
        project={project}
      />
      <ConfirmDialog
        open={switchTarget !== null}
        title={t("switchGuestLanguageTitle")}
        description={t("switchGuestLanguageConfirm", { language: switchTarget ? languageLabel(switchTarget) : "" })}
        confirmLabel={t("switchGuestLanguageAction")}
        cancelLabel={t("cancel")}
        closeLabel={t("closeDialog")}
        tone="danger"
        onClose={() => setSwitchTarget(null)}
        onConfirm={confirmSwitch}
      />
    </>
  );
}
