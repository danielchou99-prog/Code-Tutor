"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { runCpp, type RunResult } from "@/lib/compiler-api";
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

export function WorkspaceCenter() {
  const { t } = useLanguage();
  const [stdin, setStdin] = useState(initialInput);
  const [result, setResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"output" | "input">("output");
  const [inputMode, setInputMode] = useState<"batch" | "interactive">("batch");
  const [interactiveOutput, setInteractiveOutput] = useState<InteractiveOutput[]>([]);
  const [interactiveStatus, setInteractiveStatus] = useState<InteractiveStatus>("idle");
  const interactiveConnection = useRef<InteractiveConnection | null>(null);

  useEffect(() => {
    return () => interactiveConnection.current?.stop();
  }, []);

  const handleRun = useCallback(
    async (code: string) => {
      if (inputMode === "interactive") {
        interactiveConnection.current?.stop();
        setActiveTab("input");
        setInteractiveOutput([]);
        setInteractiveStatus("connecting");
        setIsRunning(true);
        interactiveConnection.current = startInteractiveCpp(code, {
          onEvent: (event) => {
            if (event.type === "output") {
              setInteractiveOutput((current) => [...current, event]);
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
        setResult(await runCpp(code, stdin));
      } catch (error) {
        const message =
          error instanceof Error && error.name === "AbortError"
            ? t("requestTimeout")
            : t("cannotReachApi");

        setResult({
          status: "service_unavailable",
          stdout: "",
          stderr: message,
          exit_code: null,
          duration_ms: 0,
          truncated: false,
        });
      } finally {
        setIsRunning(false);
      }
    },
    [inputMode, stdin, t],
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
    <div className="flex min-h-[680px] min-w-0 flex-col border-white/10 lg:border-x">
      <CodeEditorPanel isRunning={isRunning} onRun={handleRun} />
      <OutputPanel
        activeTab={activeTab}
        isRunning={isRunning}
        inputMode={inputMode}
        interactiveOutput={interactiveOutput}
        interactiveStatus={interactiveStatus}
        onClear={() => setResult(null)}
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
