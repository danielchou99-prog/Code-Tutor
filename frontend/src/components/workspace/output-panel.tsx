import type { RunResult, RunStatus } from "@/lib/compiler-api";

type OutputPanelProps = {
  activeTab: "output" | "input";
  isRunning: boolean;
  onClear: () => void;
  onSelectTab: (tab: "output" | "input") => void;
  onStdinChange: (value: string) => void;
  result: RunResult | null;
  stdin: string;
};

const statusPresentation: Record<
  RunStatus,
  { label: string; color: string; icon: string }
> = {
  accepted: {
    label: "Process finished successfully",
    color: "text-emerald-300",
    icon: "✓",
  },
  compile_error: {
    label: "Compilation failed",
    color: "text-amber-300",
    icon: "!",
  },
  runtime_error: {
    label: "Runtime error",
    color: "text-rose-300",
    icon: "!",
  },
  timeout: {
    label: "Time limit exceeded",
    color: "text-amber-300",
    icon: "⌛",
  },
  service_unavailable: {
    label: "Compiler service unavailable",
    color: "text-slate-400",
    icon: "i",
  },
  rate_limited: {
    label: "Too many runs — please wait",
    color: "text-amber-300",
    icon: "⌛",
  },
  server_busy: {
    label: "Compiler queue is busy",
    color: "text-amber-300",
    icon: "…",
  },
};

export function OutputPanel({
  activeTab,
  isRunning,
  onClear,
  onSelectTab,
  onStdinChange,
  result,
  stdin,
}: OutputPanelProps) {
  const presentation = result ? statusPresentation[result.status] : null;

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
            OUTPUT
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
            INPUT
          </button>
          <button className="h-full cursor-default text-slate-700" type="button" disabled>
            PROBLEMS <span className="ml-1 rounded bg-white/5 px-1">0</span>
          </button>
        </div>
        {activeTab === "output" && (
          <button
            className="text-xs text-slate-600 hover:text-slate-400"
            type="button"
            onClick={onClear}
            aria-label="Clear output"
          >
            Clear
          </button>
        )}
      </div>

      {activeTab === "input" ? (
        <div className="h-[calc(100%-2.5rem)] p-3">
          <textarea
            aria-label="Standard input"
            className="h-full w-full resize-none rounded-lg border border-white/8 bg-[#0c111b] p-3 font-mono text-xs leading-5 text-slate-300 outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-300/30"
            onChange={(event) => onStdinChange(event.target.value)}
            placeholder="Enter the input your C++ program should read..."
            spellCheck={false}
            value={stdin}
          />
        </div>
      ) : (
        <div className="flex h-[calc(100%-2.5rem)] flex-col justify-between p-4 font-mono text-xs">
          <div className="min-h-0 flex-1 overflow-auto">
            <p className="mb-2 text-slate-600">$ Run main.cpp with C++20</p>
            {isRunning ? (
              <p className="animate-pulse text-cyan-300">Compiling and running...</p>
            ) : result ? (
              <div className="space-y-2 whitespace-pre-wrap break-words">
                {result.stdout && <pre className="font-mono text-slate-200">{result.stdout}</pre>}
                {result.stderr && <pre className="font-mono text-rose-300">{result.stderr}</pre>}
                {!result.stdout && !result.stderr && (
                  <p className="text-slate-600">Program finished without output.</p>
                )}
                {result.truncated && (
                  <p className="text-amber-300">Output was truncated by the safety limit.</p>
                )}
                {result.retry_after_seconds && (
                  <p className="text-amber-300">
                    Try again in about {result.retry_after_seconds} seconds.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-slate-600">Press Run to compile and execute your program.</p>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/5 pt-3">
            {presentation ? (
              <div className={`flex items-center gap-2 ${presentation.color}`}>
                <span className="grid size-4 place-items-center rounded-full bg-white/5 text-[9px]">
                  {presentation.icon}
                </span>
                {presentation.label}
              </div>
            ) : (
              <span className="text-slate-700">Ready</span>
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
