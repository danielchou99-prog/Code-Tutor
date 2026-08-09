"use client";

import { useState } from "react";

import type { FileProject } from "@/lib/file-items";
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

  return (
    <section className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(420px,1fr)_320px]">
      <HistoryPanel project={project} onBack={onBack} />
      <WorkspaceCenter
        onCodeChange={setCode}
        onDirtyChange={onDirtyChange}
        onExecutionOutputChange={setLastExecutionOutput}
        project={project}
      />
      <AiTutorPanel code={code} errorOutput={lastExecutionOutput} />
    </section>
  );
}
