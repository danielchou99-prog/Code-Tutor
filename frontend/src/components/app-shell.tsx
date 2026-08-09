"use client";

import { useState } from "react";

import { FileHome } from "@/components/files/file-home";
import { ProblemsPage } from "@/components/problems/problems-page";
import { type PrimarySection, SiteHeader } from "@/components/site-header";
import { AiTutorPanel } from "@/components/workspace/ai-tutor-panel";
import { HistoryPanel } from "@/components/workspace/history-panel";
import { WorkspaceCenter } from "@/components/workspace/workspace-center";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import type { FileProject } from "@/lib/file-items";
import { LanguageProvider, useLanguage } from "@/lib/language-context";

function AppContent() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<PrimarySection>("files");
  const [openProject, setOpenProject] = useState<FileProject | null>(null);

  const selectSection = (section: PrimarySection) => {
    setActiveSection(section);
    if (section === "files") setOpenProject(null);
  };

  let content;
  if (activeSection === "files" && openProject) {
    content = (
      <section className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(420px,1fr)_320px]">
        <HistoryPanel />
        <WorkspaceCenter key={openProject.id} project={openProject} />
        <AiTutorPanel />
      </section>
    );
  } else if (activeSection === "files") {
    content = (
      <section className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
        <HistoryPanel />
        <FileHome key={user?.id ?? "guest"} onOpenProject={setOpenProject} />
      </section>
    );
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
      <SiteHeader activeSection={activeSection} onSelect={selectSection} />
      {content}
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
