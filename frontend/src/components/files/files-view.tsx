"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FileHome } from "@/components/files/file-home";
import { GuestWorkspace } from "@/components/files/guest-workspace";
import { useSiteFrame } from "@/components/site-frame";
import { ProjectWorkspace } from "@/components/workspace/project-workspace";
import { useAuth } from "@/lib/auth-context";
import { clearProjectDraft, type FileProject } from "@/lib/file-items";
import { hasPendingGuestSave, importGuestWorkspace } from "@/lib/guest-workspace";
import { useLanguage } from "@/lib/language-context";

type OpenedProject = FileProject & { ownerId: string };

const openProjectStoragePrefix = "code-tutor:open-project:";

export function FilesView() {
  const { loading, user } = useAuth();
  const { t } = useLanguage();
  const { protectUnsavedCode, setUnsavedChanges } = useSiteFrame();
  const userId = user?.id ?? null;
  const [openProject, setOpenProject] = useState<OpenedProject | null>(null);
  const openProjectId = openProject?.id ?? null;
  const [importNotice, setImportNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const importedForUser = useRef<string | null>(null);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      if (!userId) {
        setOpenProject(null);
        setUnsavedChanges(false);
        return;
      }

      const storedProject = window.localStorage.getItem(`${openProjectStoragePrefix}${userId}`);
      if (!storedProject) return;
      try {
        const project = JSON.parse(storedProject) as FileProject;
        if (typeof project.id === "string" && typeof project.name === "string") {
          setOpenProject({ ...project, language: project.language === "python" ? "python" : "cpp", ownerId: userId });
        }
      } catch {
        window.localStorage.removeItem(`${openProjectStoragePrefix}${userId}`);
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [setUnsavedChanges, userId]);

  // A guest pressed Save and then signed in: turn their local workspace into a real project.
  useEffect(() => {
    if (!userId) {
      importedForUser.current = null;
      return;
    }
    if (importedForUser.current === userId || !hasPendingGuestSave()) return;
    importedForUser.current = userId;
    void importGuestWorkspace(userId, t("guestProjectName")).then(({ project, error }) => {
      if (error) {
        setImportNotice({ text: t("guestImportFailed"), failed: true });
      } else if (project) {
        setOpenProject({ ...project, ownerId: userId });
        window.localStorage.setItem(`${openProjectStoragePrefix}${userId}`, JSON.stringify(project));
        setImportNotice({ text: t("guestImportDone", { name: project.name }), failed: false });
      }
    });
  }, [t, userId]);

  useEffect(() => {
    if (!importNotice) return;
    const timer = window.setTimeout(() => setImportNotice(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [importNotice]);

  // Leaving this page must never leave a stale "unsaved" flag behind.
  useEffect(() => () => setUnsavedChanges(false), [setUnsavedChanges]);

  const closeProject = useCallback(() => {
    if (user) window.localStorage.removeItem(`${openProjectStoragePrefix}${user.id}`);
    setOpenProject(null);
    setUnsavedChanges(false);
  }, [setUnsavedChanges, user]);

  // Stable identities matter: the editor re-runs its load effects when these change.
  const handleDirtyChange = useCallback((dirty: boolean) => {
    setUnsavedChanges(dirty, () => {
      if (openProjectId) clearProjectDraft(openProjectId);
    });
  }, [openProjectId, setUnsavedChanges]);
  const handleBack = useCallback(() => protectUnsavedCode(closeProject), [closeProject, protectUnsavedCode]);

  const openUserProject = (project: FileProject) => {
    if (!user) return;
    setOpenProject({ ...project, ownerId: user.id });
    window.localStorage.setItem(`${openProjectStoragePrefix}${user.id}`, JSON.stringify(project));
  };

  const notice = importNotice ? (
    <div
      role="status"
      className={`fixed right-4 top-16 z-50 max-w-sm rounded-xl border bg-[#111824]/95 px-4 py-3 text-[11px] leading-5 shadow-xl shadow-black/40 ${importNotice.failed ? "border-rose-300/20 text-rose-200" : "border-cyan-300/15 text-slate-200"}`}
    >
      {importNotice.text}
    </div>
  ) : null;

  if (openProject && user && openProject.ownerId === user.id) {
    return (
      <>
        {notice}
        <ProjectWorkspace
          key={openProject.id}
          onBack={handleBack}
          onDirtyChange={handleDirtyChange}
          project={openProject}
        />
      </>
    );
  }
  if (!user) {
    // Wait for the session check so a signed-in user never sees the guest editor flash by.
    return loading ? (
      <section className="grid min-w-0 flex-1 place-items-center bg-[#090d14] px-6 py-20 text-center">
        <p className="text-xs text-slate-600">{t("guestWorkspaceLoading")}</p>
      </section>
    ) : <GuestWorkspace />;
  }
  return (
    <>
      {notice}
      <FileHome key={user.id} onOpenProject={openUserProject} />
    </>
  );
}
