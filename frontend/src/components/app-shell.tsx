"use client";

import { useCallback, useEffect, useState } from "react";

import { FileHome } from "@/components/files/file-home";
import { ProblemsPage } from "@/components/problems/problems-page";
import { type PrimarySection, SiteHeader } from "@/components/site-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AiTutorPanel } from "@/components/workspace/ai-tutor-panel";
import { HistoryPanel } from "@/components/workspace/history-panel";
import { WorkspaceCenter } from "@/components/workspace/workspace-center";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { clearProjectDraft, type FileProject } from "@/lib/file-items";
import { LanguageProvider, useLanguage } from "@/lib/language-context";

type OpenedProject = FileProject & { ownerId: string };
type PendingAction = () => void | Promise<void>;

const openProjectStoragePrefix = "code-tutor:open-project:";

function AppContent() {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [activeSection, setActiveSection] = useState<PrimarySection>("files");
  const [openProject, setOpenProject] = useState<OpenedProject | null>(null);
  const [hasUnsavedCode, setHasUnsavedCode] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      if (!userId) {
        setOpenProject(null);
        setHasUnsavedCode(false);
        return;
      }

      const storedProject = window.localStorage.getItem(`${openProjectStoragePrefix}${userId}`);
      if (!storedProject) return;
      try {
        const project = JSON.parse(storedProject) as FileProject;
        if (typeof project.id === "string" && typeof project.name === "string") {
          setOpenProject({ ...project, ownerId: userId });
        }
      } catch {
        window.localStorage.removeItem(`${openProjectStoragePrefix}${userId}`);
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [userId]);

  const closeProject = useCallback(() => {
    if (user) window.localStorage.removeItem(`${openProjectStoragePrefix}${user.id}`);
    setOpenProject(null);
    setHasUnsavedCode(false);
  }, [user]);

  const protectUnsavedCode = useCallback((action: PendingAction) => {
    if (hasUnsavedCode) {
      setPendingAction(() => action);
      return;
    }
    void action();
  }, [hasUnsavedCode]);

  const openUserProject = (project: FileProject) => {
    if (!user) return;
    setOpenProject({ ...project, ownerId: user.id });
    window.localStorage.setItem(`${openProjectStoragePrefix}${user.id}`, JSON.stringify(project));
  };

  const selectSection = (section: PrimarySection) => {
    protectUnsavedCode(() => {
      setActiveSection(section);
      if (openProject) closeProject();
    });
  };

  let content;
  if (activeSection === "files" && openProject && user && openProject.ownerId === user.id) {
    content = (
      <section className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(420px,1fr)_320px]">
        <HistoryPanel project={openProject} onBack={() => protectUnsavedCode(closeProject)} />
        <WorkspaceCenter
          key={openProject.id}
          onDirtyChange={setHasUnsavedCode}
          project={openProject}
        />
        <AiTutorPanel />
      </section>
    );
  } else if (activeSection === "files") {
    content = <FileHome key={user?.id ?? "guest"} onOpenProject={openUserProject} />;
  } else if (activeSection === "problems") {
    content = <ProblemsPage />;
  } else {
    const isAbout = activeSection === "about";
    content = (
      <section className="grid flex-1 place-items-center px-6 py-20 text-center">
        <div className="max-w-xl">
          <span className="mx-auto block size-2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.6)]" />
          <h1 className="mt-5 text-2xl font-semibold text-white">
            {t(isAbout ? "aboutTitle" : "homeTitle")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {t(isAbout ? "aboutDetail" : "homeDetail")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#090d14] text-slate-200">
      <SiteHeader
        activeSection={activeSection}
        onBeforeSignOut={(signOut) => protectUnsavedCode(signOut)}
        onSelect={selectSection}
      />
      {content}
      <ConfirmDialog
        open={pendingAction !== null}
        title={language === "zh-Hant" ? "尚有未儲存的修改" : "Unsaved changes"}
        description={language === "zh-Hant" ? "若現在離開，目前尚未儲存的 main.cpp 修改將會遺失。" : "Your unsaved changes to main.cpp will be lost if you leave now."}
        confirmLabel={language === "zh-Hant" ? "不儲存並離開" : "Leave without saving"}
        cancelLabel={t("cancel")}
        closeLabel={t("closeDialog")}
        tone="danger"
        onClose={() => setPendingAction(null)}
        onConfirm={() => {
          const action = pendingAction;
          if (openProject) clearProjectDraft(openProject.id);
          setPendingAction(null);
          setHasUnsavedCode(false);
          if (action) void action();
        }}
      />
    </main>
  );
}

export function AppShell() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LanguageProvider>
  );
}
