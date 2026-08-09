"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { runCpp, type RunResult } from "@/lib/compiler-api";
import type { FileProject, ProjectFile } from "@/lib/file-items";
import {
  type InteractiveConnection,
  type InteractiveOutput,
  type InteractiveStatus,
  startInteractiveCpp,
} from "@/lib/interactive-api";
import { useLanguage } from "@/lib/language-context";
import { CodeEditorPanel } from "./code-editor-panel";
import { OutputPanel } from "./output-panel";

const initialInput = `5
1 2 3 4 5
`;

export function WorkspaceCenter({
  project,
  onCodeChange,
  onDirtyChange,
  onExecutionOutputChange,
  onFileRequestHandled,
  onProjectFilesChange,
  requestedFileId,
}: {
  project: FileProject;
  onCodeChange: (code: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onExecutionOutputChange: (output: string) => void;
  onFileRequestHandled: () => void;
  onProjectFilesChange: (files: ProjectFile[], activeFileId: string | null) => void;
  requestedFileId: string | null;
}) {
  const { t } = useLanguage();
  const [stdin, setStdin] = useState(initialInput);
  const [result, setResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"output" | "input">("output");
  const [inputMode, setInputMode] = useState<"batch" | "interactive">("batch");
  const [interactiveOutput, setInteractiveOutput] = useState<InteractiveOutput[]>([]);
  const [interactiveStatus, setInteractiveStatus] = useState<InteractiveStatus>("idle");
  const interactiveConnection = useRef<InteractiveConnection | null>(null);
  const interactiveTranscript = useRef("");

  useEffect(() => {
    return () => interactiveConnection.current?.stop();
  }, []);

  const handleRun = useCallback(
    async (code: string) => {
      if (inputMode === "interactive") {
        interactiveConnection.current?.stop();
        setActiveTab("input");
        setInteractiveOutput([]);
        interactiveTranscript.current = "";
        onExecutionOutputChange("");
        setInteractiveStatus("connecting");
        setIsRunning(true);
        interactiveConnection.current = startInteractiveCpp(code, {
          onEvent: (event) => {
            if (event.type === "output") {
              setInteractiveOutput((current) => [...current, event]);
              interactiveTranscript.current += event.data;
              onExecutionOutputChange(interactiveTranscript.current);
            } else if (event.type === "status") {
              setInteractiveStatus(event.status);
              if (["accepted", "compile_error", "runtime_error", "timeout", "stopped"].includes(event.status)) {
                setIsRunning(false);
              }
            } else {
              setInteractiveOutput((current) => [
                ...current,
                { stream: "stderr", data: `${event.message}\n` },
              ]);
              setInteractiveStatus("error");
              setIsRunning(false);
            }
          },
          onClose: () => {
            interactiveConnection.current = null;
            setIsRunning(false);
          },
        });
        return;
      }

      setActiveTab("output");
      setIsRunning(true);

      try {
        const nextResult = await runCpp(code, stdin);
        setResult(nextResult);
        onExecutionOutputChange([nextResult.stderr, nextResult.stdout].filter(Boolean).join("\n"));
      } catch (error) {
        const message =
          error instanceof Error && error.name === "AbortError"
            ? t("requestTimeout")
            : t("cannotReachApi");

        const failedResult: RunResult = {
          status: "service_unavailable",
          stdout: "",
          stderr: message,
          exit_code: null,
          duration_ms: 0,
          truncated: false,
        };
        setResult(failedResult);
        onExecutionOutputChange(failedResult.stderr);
      } finally {
        setIsRunning(false);
      }
    },
    [inputMode, onExecutionOutputChange, stdin, t],
  );

  const sendInteractiveInput = (data: string) => {
    const line = data.endsWith("\n") ? data : `${data}\n`;
    if (!interactiveConnection.current?.send(line)) return false;
    setInteractiveOutput((current) => [...current, { stream: "stdin", data: line }]);
    return true;
  };

  const stopInteractive = () => {
    interactiveConnection.current?.stop();
    interactiveConnection.current = null;
    setInteractiveStatus("stopped");
    setIsRunning(false);
  };

  return (
    <div className="flex min-h-[680px] min-w-0 flex-col border-white/10 lg:h-full lg:min-h-0 lg:overflow-hidden lg:border-x">
      <CodeEditorPanel
        isRunning={isRunning}
        onCodeChange={onCodeChange}
        onDirtyChange={onDirtyChange}
        onFileRequestHandled={onFileRequestHandled}
        onProjectFilesChange={onProjectFilesChange}
        onRun={handleRun}
        project={project}
        requestedFileId={requestedFileId}
      />
      <OutputPanel
        activeTab={activeTab}
        isRunning={isRunning}
        inputMode={inputMode}
        interactiveOutput={interactiveOutput}
        interactiveStatus={interactiveStatus}
        onClear={() => {
          setResult(null);
          setInteractiveOutput([]);
          interactiveTranscript.current = "";
          onExecutionOutputChange("");
        }}
        onInputModeChange={(mode) => {
          if (isRunning) return;
          setInputMode(mode);
          setActiveTab("input");
        }}
        onInteractiveInput={sendInteractiveInput}
        onSelectTab={setActiveTab}
        onStdinChange={setStdin}
        onStopInteractive={stopInteractive}
        result={result}
        stdin={stdin}
      />
    </div>
  );
}
