import type { RunResult, RunStatus } from "@/lib/compiler-api";
import { type TranslationKey, useLanguage } from "@/lib/language-context";

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
  onClear,
  onSelectTab,
  onStdinChange,
  result,
  stdin,
}: OutputPanelProps) {
  const { t } = useLanguage();
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
        <div className="h-[calc(100%-2.5rem)] p-3">
          <textarea
            aria-label={t("standardInput")}
            className="h-full w-full resize-none rounded-lg border border-white/8 bg-[#0c111b] p-3 font-mono text-xs leading-5 text-slate-300 outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-300/30"
            onChange={(event) => onStdinChange(event.target.value)}
            placeholder={t("inputPlaceholder")}
            spellCheck={false}
            value={stdin}
          />
        </div>
      ) : (
        <div className="flex h-[calc(100%-2.5rem)] flex-col justify-between p-4 font-mono text-xs">
          <div className="min-h-0 flex-1 overflow-auto">
            <p className="mb-2 text-slate-600">$ Run main.cpp with C++20</p>
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
