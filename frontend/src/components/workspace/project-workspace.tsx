"use client";

import { type CSSProperties, useState } from "react";

import type { FileProject, ProjectFile } from "@/lib/file-items";
import { useSettings } from "@/lib/settings-context";
import { AiTutorPanel } from "./ai-tutor-panel";
import { HistoryPanel } from "./history-panel";
import { WorkspaceCenter } from "./workspace-center";

export function ProjectWorkspace({
  project,
  onBack,
  onDirtyChange,
}: {
  project: FileProject;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { settings } = useSettings();
  const [code, setCode] = useState("");
  const [lastExecutionOutput, setLastExecutionOutput] = useState("");
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [requestedFileId, setRequestedFileId] = useState<string | null>(null);

  return (
    <section
      className={`grid min-h-0 flex-1 grid-cols-1 lg:h-[calc(100dvh-4rem)] lg:flex-none lg:overflow-hidden ${settings.panelPlacement === "bottom" ? "lg:grid-cols-[var(--sidebar-width)_minmax(420px,1fr)] lg:grid-rows-[minmax(0,1fr)_280px]" : "lg:grid-cols-[var(--sidebar-width)_minmax(420px,1fr)_var(--ai-width)]"}`}
      style={{
        "--sidebar-width": `${settings.sidebarWidth}px`,
        "--ai-width": `${settings.aiPanelWidth}px`,
      } as CSSProperties}
    >
      <div className={settings.panelPlacement === "bottom" ? "lg:row-span-2 lg:min-h-0" : "lg:min-h-0"}>
        <HistoryPanel
          activeFileId={activeFileId}
          files={projectFiles}
          onBack={onBack}
          onOpenFile={setRequestedFileId}
          project={project}
        />
      </div>
      <WorkspaceCenter
        onCodeChange={setCode}
        onDirtyChange={onDirtyChange}
        onExecutionOutputChange={setLastExecutionOutput}
        onFileRequestHandled={() => setRequestedFileId(null)}
        onProjectFilesChange={(files, nextActiveFileId) => {
          setProjectFiles(files);
          setActiveFileId(nextActiveFileId);
        }}
        project={project}
        requestedFileId={requestedFileId}
      />
      <div className={settings.panelPlacement === "bottom" ? "lg:col-start-2 lg:row-start-2 lg:min-h-0" : "lg:min-h-0"}>
        <AiTutorPanel code={code} errorOutput={lastExecutionOutput} programmingLanguage={project.language} />
      </div>
    </section>
  );
}
