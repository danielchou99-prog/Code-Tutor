"use client";

import { useCallback, useEffect, useState } from "react";

import { FileHome } from "@/components/files/file-home";
import { HomePage } from "@/components/home/home-page";
import { ProblemsPage } from "@/components/problems/problems-page";
import { SettingsPage } from "@/components/settings/settings-page";
import { type PrimarySection, SiteHeader } from "@/components/site-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProjectWorkspace } from "@/components/workspace/project-workspace";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { clearProjectDraft, type FileProject } from "@/lib/file-items";
import { LanguageProvider, useLanguage } from "@/lib/language-context";
import { SettingsProvider, useSettings } from "@/lib/settings-context";

type OpenedProject = FileProject & { ownerId: string };
type PendingAction = () => void | Promise<void>;

const openProjectStoragePrefix = "code-tutor:open-project:";

function AppContent() {
  const { language, t } = useLanguage();
  const { settings } = useSettings();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [activeSection, setActiveSection] = useState<PrimarySection>("home");
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
          setActiveSection("files");
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
      <ProjectWorkspace
        key={openProject.id}
        onBack={() => protectUnsavedCode(closeProject)}
        onDirtyChange={setHasUnsavedCode}
        project={openProject}
      />
    );
  } else if (activeSection === "files") {
    content = <FileHome key={user?.id ?? "guest"} onOpenProject={openUserProject} />;
  } else if (activeSection === "problems") {
    content = <ProblemsPage />;
  } else if (activeSection === "home") {
    content = <HomePage onSelect={selectSection} />;
  } else if (activeSection === "settings") {
    content = <SettingsPage />;
  } else {
    content = (
      <section className="grid flex-1 place-items-center px-6 py-20 text-center">
        <div className="max-w-xl">
          <span className="mx-auto block size-2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.6)]" />
          <h1 className="mt-5 text-2xl font-semibold text-white">
            {language === "zh-Hant" ? "測驗功能即將推出" : "Quiz is coming soon"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {language === "zh-Hant" ? "完成題庫與作答紀錄後，會在這裡提供限時與分類測驗。" : "Timed and categorized quizzes will appear here after the problem and submission systems are complete."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <main data-code-tutor-theme={settings.theme} className={`flex min-h-screen w-full min-w-0 max-w-full flex-col overflow-x-hidden text-slate-200 ${settings.theme === "light" ? settings.background === "grid" ? "bg-[#dbe8f3] bg-[linear-gradient(rgba(30,64,96,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(30,64,96,0.055)_1px,transparent_1px)] bg-[size:42px_42px]" : settings.background === "soft" ? "bg-[#dbe8f3] bg-[radial-gradient(circle_at_70%_20%,rgba(14,116,144,0.13),transparent_34%)]" : "bg-[#dbe8f3]" : settings.background === "grid" ? "bg-[#090d14] bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:42px_42px]" : settings.background === "soft" ? "bg-[#090d14] bg-[radial-gradient(circle_at_70%_20%,rgba(34,211,238,0.07),transparent_32%)]" : "bg-[#090d14]"}`}>
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
      <SettingsProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </SettingsProvider>
    </LanguageProvider>
  );
}
