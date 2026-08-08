"use client";

import { useCallback, useState } from "react";

import { runCpp, type RunResult } from "@/lib/compiler-api";
import { CodeEditorPanel } from "./code-editor-panel";
import { OutputPanel } from "./output-panel";

const initialInput = `5
1 2 3 4 5
`;

export function WorkspaceCenter() {
  const [stdin, setStdin] = useState(initialInput);
  const [result, setResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"output" | "input">("output");

  const handleRun = useCallback(
    async (code: string) => {
      setActiveTab("output");
      setIsRunning(true);

      try {
        setResult(await runCpp(code, stdin));
      } catch (error) {
        const message =
          error instanceof Error && error.name === "AbortError"
            ? "Compiler request timed out."
            : "Cannot reach the compiler API. Start the FastAPI backend on port 8000.";

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
    [stdin],
  );

  return (
    <div className="flex min-h-[680px] min-w-0 flex-col border-white/10 lg:border-x">
      <CodeEditorPanel isRunning={isRunning} onRun={handleRun} />
      <OutputPanel
        activeTab={activeTab}
        isRunning={isRunning}
        onClear={() => setResult(null)}
        onSelectTab={setActiveTab}
        onStdinChange={setStdin}
        result={result}
        stdin={stdin}
      />
    </div>
  );
}
