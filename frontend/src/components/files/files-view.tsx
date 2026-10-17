"use client";

import { useCallback, useEffect, useState } from "react";

import { FileHome } from "@/components/files/file-home";
import { useSiteFrame } from "@/components/site-frame";
import { ProjectWorkspace } from "@/components/workspace/project-workspace";
import { useAuth } from "@/lib/auth-context";
import { clearProjectDraft, type FileProject } from "@/lib/file-items";

type OpenedProject = FileProject & { ownerId: string };

const openProjectStoragePrefix = "code-tutor:open-project:";

export function FilesView() {
  const { user } = useAuth();
  const { protectUnsavedCode, setUnsavedChanges } = useSiteFrame();
  const userId = user?.id ?? null;
  const [openProject, setOpenProject] = useState<OpenedProject | null>(null);
  const openProjectId = openProject?.id ?? null;

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

  if (openProject && user && openProject.ownerId === user.id) {
    return (
      <ProjectWorkspace
        key={openProject.id}
        onBack={handleBack}
        onDirtyChange={handleDirtyChange}
        project={openProject}
      />
    );
  }
  return <FileHome key={user?.id ?? "guest"} onOpenProject={openUserProject} />;
}
