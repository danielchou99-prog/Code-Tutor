"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { runCpp, type CppSourceFile, type RunResult } from "@/lib/compiler-api";
import type { FileProject, ProjectFile } from "@/lib/file-items";
import {
  type InteractiveConnection,
  type InteractiveOutput,
  type InteractiveStatus,
  startInteractiveCpp,
} from "@/lib/interactive-api";
import { useLanguage } from "@/lib/language-context";
import { useSettings } from "@/lib/settings-context";
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
  const { settings } = useSettings();
  const [stdin, setStdin] = useState(initialInput);
  const [result, setResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"output" | "input">("output");
  const [inputMode, setInputMode] = useState<"batch" | "interactive">("batch");
  const [interactiveOutput, setInteractiveOutput] = useState<InteractiveOutput[]>([]);
  const [interactiveStatus, setInteractiveStatus] = useState<InteractiveStatus>("idle");
  const [notification, setNotification] = useState<string | null>(null);
  const interactiveConnection = useRef<InteractiveConnection | null>(null);
  const interactiveTranscript = useRef("");

  useEffect(() => {
    return () => interactiveConnection.current?.stop();
  }, []);

  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => setNotification(null), 3_500);
    return () => window.clearTimeout(timer);
  }, [notification]);

  const handleRun = useCallback(
    async (files: CppSourceFile[]) => {
      if (settings.clearConsoleOnRun) {
        setResult(null);
        setInteractiveOutput([]);
        interactiveTranscript.current = "";
        onExecutionOutputChange("");
      }
      if (inputMode === "interactive") {
        interactiveConnection.current?.stop();
        setActiveTab("input");
        setInteractiveOutput([]);
        interactiveTranscript.current = "";
        onExecutionOutputChange("");
        setInteractiveStatus("connecting");
        setIsRunning(true);
        interactiveConnection.current = startInteractiveCpp(files, {
          onEvent: (event) => {
            if (event.type === "output") {
              setInteractiveOutput((current) => [...current, event]);
              interactiveTranscript.current += event.data;
              onExecutionOutputChange(interactiveTranscript.current);
            } else if (event.type === "status") {
              setInteractiveStatus(event.status);
              if (["accepted", "compile_error", "runtime_error", "timeout", "stopped"].includes(event.status)) {
                setIsRunning(false);
                if (event.status === "accepted" && settings.notifySuccess) setNotification(t("statusAccepted"));
                else if (["compile_error", "runtime_error", "timeout"].includes(event.status) && settings.notifyError) setNotification(t(event.status === "compile_error" ? "statusCompileError" : event.status === "runtime_error" ? "statusRuntimeError" : "statusTimeout"));
              }
            } else {
              setInteractiveOutput((current) => [
                ...current,
                { stream: "stderr", data: `${event.message}\n` },
              ]);
              setInteractiveStatus("error");
              setIsRunning(false);
              if (settings.notifySystem) setNotification(event.message);
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
        const nextResult = await runCpp(files, stdin);
        setResult(nextResult);
        onExecutionOutputChange([nextResult.stderr, nextResult.stdout].filter(Boolean).join("\n"));
        if (nextResult.status === "accepted" && settings.notifySuccess) {
          setNotification(t("statusAccepted"));
        } else if (nextResult.status !== "accepted" && settings.notifyError) {
          const statusMessage =
            nextResult.status === "runtime_error"
              ? t("statusRuntimeError")
              : nextResult.status === "timeout"
                ? t("statusTimeout")
                : nextResult.status === "rate_limited"
                  ? t("statusRateLimited")
                  : nextResult.status === "server_busy"
                    ? t("statusServerBusy")
                    : nextResult.status === "service_unavailable"
                      ? t("statusUnavailable")
                      : t("statusCompileError");
          setNotification(statusMessage);
        }
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
        if (settings.notifySystem) setNotification(failedResult.stderr);
      } finally {
        setIsRunning(false);
      }
    },
    [inputMode, onExecutionOutputChange, settings, stdin, t],
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
    <div className="relative flex min-h-[680px] min-w-0 flex-col border-white/10 lg:h-full lg:min-h-0 lg:overflow-hidden lg:border-x">
      {notification ? <div role="status" className="absolute right-4 top-14 z-50 max-w-sm rounded-xl border border-cyan-300/15 bg-[#111824]/95 px-4 py-3 text-[11px] leading-5 text-slate-200 shadow-xl shadow-black/40">{notification}</div> : null}
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
