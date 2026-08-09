"use client";

import { useState } from "react";

import type { FileProject, ProjectFile } from "@/lib/file-items";
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
  const [code, setCode] = useState("");
  const [lastExecutionOutput, setLastExecutionOutput] = useState("");
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [requestedFileId, setRequestedFileId] = useState<string | null>(null);

  return (
    <section className="grid min-h-0 flex-1 grid-cols-1 lg:h-[calc(100dvh-4rem)] lg:flex-none lg:grid-cols-[220px_minmax(420px,1fr)_320px] lg:overflow-hidden">
      <HistoryPanel
        activeFileId={activeFileId}
        files={projectFiles}
        onBack={onBack}
        onOpenFile={setRequestedFileId}
        project={project}
      />
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
      <AiTutorPanel code={code} errorOutput={lastExecutionOutput} />
    </section>
  );
}
