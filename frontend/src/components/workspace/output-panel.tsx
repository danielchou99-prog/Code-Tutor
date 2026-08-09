import { useEffect, useRef, useState } from "react";

import type { RunResult, RunStatus } from "@/lib/compiler-api";
import type { InteractiveOutput, InteractiveStatus } from "@/lib/interactive-api";
import { type TranslationKey, useLanguage } from "@/lib/language-context";

type OutputPanelProps = {
  activeTab: "output" | "input";
  isRunning: boolean;
  inputMode: "batch" | "interactive";
  interactiveOutput: InteractiveOutput[];
  interactiveStatus: InteractiveStatus;
  onClear: () => void;
  onInputModeChange: (mode: "batch" | "interactive") => void;
  onInteractiveInput: (data: string) => boolean;
  onSelectTab: (tab: "output" | "input") => void;
  onStdinChange: (value: string) => void;
  onStopInteractive: () => void;
  result: RunResult | null;
  stdin: string;
};

const statusPresentation: Record<
  RunStatus,
  { labelKey: TranslationKey; color: string; icon: string }
> = {
  accepted: {
    labelKey: "statusAccepted",
    color: "text-emerald-300",
    icon: "✓",
  },
  compile_error: {
    labelKey: "statusCompileError",
    color: "text-amber-300",
    icon: "!",
  },
  runtime_error: {
    labelKey: "statusRuntimeError",
    color: "text-rose-300",
    icon: "!",
  },
  timeout: {
    labelKey: "statusTimeout",
    color: "text-amber-300",
    icon: "⌛",
  },
  service_unavailable: {
    labelKey: "statusUnavailable",
    color: "text-slate-400",
    icon: "i",
  },
  rate_limited: {
    labelKey: "statusRateLimited",
    color: "text-amber-300",
    icon: "⌛",
  },
  server_busy: {
    labelKey: "statusServerBusy",
    color: "text-amber-300",
    icon: "…",
  },
};

export function OutputPanel({
  activeTab,
  isRunning,
  inputMode,
  interactiveOutput,
  interactiveStatus,
  onClear,
  onInputModeChange,
  onInteractiveInput,
  onSelectTab,
  onStdinChange,
  onStopInteractive,
  result,
  stdin,
}: OutputPanelProps) {
  const { t } = useLanguage();
  const [consoleInput, setConsoleInput] = useState("");
  const consoleViewportRef = useRef<HTMLDivElement>(null);
  const consoleInputRef = useRef<HTMLInputElement>(null);
  const presentation = result ? statusPresentation[result.status] : null;

  useEffect(() => {
    const viewport = consoleViewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [interactiveOutput, interactiveStatus]);

  useEffect(() => {
    if (interactiveStatus === "running") consoleInputRef.current?.focus();
  }, [interactiveStatus]);

  const interactiveStatusLabel = {
    idle: t("consoleWaiting"),
    connecting: t("consoleConnecting"),
    compiling: t("consoleCompiling"),
    running: t("consoleRunning"),
    stopped: t("consoleStopped"),
    accepted: t("statusAccepted"),
    compile_error: t("statusCompileError"),
    runtime_error: t("statusRuntimeError"),
    timeout: t("statusTimeout"),
    error: t("statusUnavailable"),
  }[interactiveStatus];

  return (
    <section className="h-52 shrink-0 border-t border-white/10 bg-[#090e16]">
      <div className="flex h-10 items-center justify-between border-b border-white/8 px-4">
        <div className="flex h-full items-center gap-5 text-[11px] font-medium">
          <button
            className={`h-full ${
              activeTab === "output"
                ? "border-b border-cyan-300 text-cyan-200"
                : "text-slate-600"
            }`}
            onClick={() => onSelectTab("output")}
            type="button"
          >
            {t("output")}
          </button>
          <button
            className={`h-full ${
              activeTab === "input"
                ? "border-b border-cyan-300 text-cyan-200"
                : "text-slate-600"
            }`}
            onClick={() => onSelectTab("input")}
            type="button"
          >
            {t("input")}
          </button>
          <button className="h-full cursor-default text-slate-700" type="button" disabled>
            {t("problems")} <span className="ml-1 rounded bg-white/5 px-1">0</span>
          </button>
        </div>
        {activeTab === "output" && (
          <button
            className="text-xs text-slate-600 hover:text-slate-400"
            type="button"
            onClick={onClear}
            aria-label={t("clearOutput")}
          >
            {t("clear")}
          </button>
        )}
      </div>

      {activeTab === "input" ? (
        <div className="flex h-[calc(100%-2.5rem)] flex-col p-3">
          <div className="mb-2 flex items-center gap-1 rounded-lg bg-white/[0.025] p-1 self-start">
            {(["batch", "interactive"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={inputMode === mode}
                disabled={isRunning}
                onClick={() => onInputModeChange(mode)}
                className={`rounded-md px-2.5 py-1 text-[10px] transition-colors disabled:cursor-not-allowed ${
                  inputMode === mode
                    ? "bg-cyan-300/10 text-cyan-200"
                    : "text-slate-600 hover:text-slate-400"
                }`}
              >
                {mode === "batch" ? "Text" : "Interactive Console"}
              </button>
            ))}
          </div>

          {inputMode === "batch" ? (
            <textarea
              aria-label={t("standardInput")}
              className="min-h-0 flex-1 resize-none rounded-lg border border-white/8 bg-[#0c111b] p-3 font-mono text-xs leading-5 text-slate-300 outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-300/30"
              onChange={(event) => onStdinChange(event.target.value)}
              placeholder={t("inputPlaceholder")}
              spellCheck={false}
              value={stdin}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/8 bg-[#070a10]">
              <div className="flex items-center justify-between border-b border-white/8 px-3 py-1.5 text-[9px] text-slate-500">
                <div className="flex items-center gap-2">
                  <span
                    className={`size-1.5 rounded-full ${
                      interactiveStatus === "running"
                        ? "animate-pulse bg-emerald-400"
                        : interactiveStatus === "error" || interactiveStatus === "compile_error"
                          ? "bg-rose-400"
                          : "bg-slate-600"
                    }`}
                    aria-hidden="true"
                  />
                  <span role="status">{interactiveStatusLabel}</span>
                </div>
                {isRunning && (
                  <button
                    type="button"
                    onClick={onStopInteractive}
                    className="text-rose-300 transition-colors hover:text-rose-200"
                  >
                    {t("stopProgram")}
                  </button>
                )}
              </div>
              <div
                ref={consoleViewportRef}
                className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-5"
                onClick={() => consoleInputRef.current?.focus()}
              >
                {interactiveOutput.length === 0 ? (
                  <span className="whitespace-pre-wrap text-slate-700">$ interactive session{"\n"}</span>
                ) : (
                  interactiveOutput.map((entry, index) => (
                    <span
                      key={`${index}-${entry.stream}`}
                      className={
                        entry.stream === "stderr"
                          ? "whitespace-pre-wrap text-rose-300"
                          : entry.stream === "stdin"
                            ? "whitespace-pre-wrap text-cyan-300"
                            : "whitespace-pre-wrap text-slate-200"
                      }
                    >
                      {entry.stream === "stdin" ? `> ${entry.data}` : entry.data}
                    </span>
                  ))
                )}
                <form
                  className="inline-flex max-w-full items-center gap-1 align-baseline"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!consoleInput || !onInteractiveInput(consoleInput)) return;
                    setConsoleInput("");
                  }}
                >
                  <span className="text-cyan-300" aria-hidden="true">›</span>
                  <input
                    ref={consoleInputRef}
                    value={consoleInput}
                    onChange={(event) => setConsoleInput(event.target.value)}
                    disabled={interactiveStatus !== "running"}
                    aria-label={t("consoleInputPlaceholder")}
                    autoComplete="off"
                    className="w-64 max-w-full bg-transparent font-mono text-[11px] text-slate-200 caret-cyan-300 outline-none disabled:cursor-not-allowed"
                  />
                  <button type="submit" className="sr-only">{t("sendInput")}</button>
                </form>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-[calc(100%-2.5rem)] flex-col justify-between p-4 font-mono text-xs">
          <div className="min-h-0 flex-1 overflow-auto">
            <p className="mb-2 text-slate-600">$ Build project with C++20</p>
            {isRunning ? (
              <p className="animate-pulse text-cyan-300">{t("compiling")}</p>
            ) : result ? (
              <div className="space-y-2 whitespace-pre-wrap break-words">
                {result.stdout && <pre className="font-mono text-slate-200">{result.stdout}</pre>}
                {result.stderr && <pre className="font-mono text-rose-300">{result.stderr}</pre>}
                {!result.stdout && !result.stderr && (
                  <p className="text-slate-600">{t("noOutput")}</p>
                )}
                {result.truncated && (
                  <p className="text-amber-300">{t("outputTruncated")}</p>
                )}
                {result.retry_after_seconds && (
                  <p className="text-amber-300">
                    {t("retryAfter").replace("{seconds}", String(result.retry_after_seconds))}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-slate-600">{t("pressRun")}</p>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/5 pt-3">
            {presentation ? (
              <div className={`flex items-center gap-2 ${presentation.color}`}>
                <span className="grid size-4 place-items-center rounded-full bg-white/5 text-[9px]">
                  {presentation.icon}
                </span>
                {t(presentation.labelKey)}
              </div>
            ) : (
              <span className="text-slate-700">{t("ready")}</span>
            )}
            <span className="text-slate-600">
              {result && result.duration_ms > 0 ? `${result.duration_ms} ms` : "—"}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
