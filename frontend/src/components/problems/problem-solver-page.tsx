"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { JudgeResultPanel } from "@/components/problems/judge-result-panel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AiTutorPanel } from "@/components/workspace/ai-tutor-panel";
import { OutputPanel } from "@/components/workspace/output-panel";
import { useAuth } from "@/lib/auth-context";
import { runCode, type RunResult, type SourceFile } from "@/lib/compiler-api";
import type { ProgrammingLanguage } from "@/lib/file-items";
import { JudgeApiError, type JudgeResult, submitProblem } from "@/lib/judge-api";
import {
  type InteractiveConnection,
  type InteractiveOutput,
  type InteractiveStatus,
  startInteractiveCode,
} from "@/lib/interactive-api";
import { type TranslationKey, useLanguage } from "@/lib/language-context";
import { findMatchingSample, outputsMatch } from "@/lib/output-compare";
import { loadPageState, pageStateKey, savePageState } from "@/lib/page-state";
import { sectionPaths } from "@/lib/routes";
import { scoringGroupLabel } from "@/lib/scoring-group-label";
import {
  clearLocalProblemCodeDraft,
  loadLocalProblemCodeDraft,
  loadSavedProblemCode,
  ProblemCodeDraftError,
  saveLocalProblemCodeDraft,
  saveProblemCode,
} from "@/lib/problem-code-drafts";

import { getProblemTagLabel, type Problem } from "./problem-data";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-[#0c111b] font-mono text-xs text-slate-500">
      Loading editor…
    </div>
  ),
});

type ResizeTarget = "problem" | "result" | null;

type ProblemWorkspaceState = {
  activeConsoleTab: "output" | "input";
  aiOpen: boolean;
  inputMode: "batch" | "interactive";
  judgeResult: JudgeResult | null;
  problemWidth: number;
  programmingLanguage: ProgrammingLanguage;
  resultWidth: number;
  runResult: RunResult | null;
  stdin: string;
};

function isRunResult(value: unknown): value is RunResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<RunResult>;
  return typeof result.status === "string"
    && typeof result.stdout === "string"
    && typeof result.stderr === "string"
    && (typeof result.exit_code === "number" || result.exit_code === null)
    && typeof result.duration_ms === "number"
    && typeof result.truncated === "boolean";
}

function isJudgeResult(value: unknown): value is JudgeResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<JudgeResult>;
  return (typeof result.submission_id === "string" || result.submission_id === null)
    && typeof result.problem_id === "string"
    && typeof result.status === "string"
    && typeof result.score === "number"
    && typeof result.passed_cases === "number"
    && typeof result.total_cases === "number"
    && typeof result.duration_ms === "number"
    && Array.isArray(result.groups)
    && typeof result.message === "string";
}

function isProblemWorkspaceState(value: unknown): value is ProblemWorkspaceState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<ProblemWorkspaceState>;
  return ["output", "input"].includes(state.activeConsoleTab ?? "")
    && typeof state.aiOpen === "boolean"
    && ["batch", "interactive"].includes(state.inputMode ?? "")
    && (state.judgeResult === null || isJudgeResult(state.judgeResult))
    && typeof state.problemWidth === "number"
    && state.problemWidth >= 25
    && state.problemWidth <= 45
    && ["cpp", "python"].includes(state.programmingLanguage ?? "")
    && typeof state.resultWidth === "number"
    && state.resultWidth >= 18
    && state.resultWidth <= 32
    && (state.runResult === null || isRunResult(state.runResult))
    && typeof state.stdin === "string";
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function ProblemSolverPage({ problem, onBack, onSubmitted }: { problem: Problem; onBack: () => void; onSubmitted?: (result: JudgeResult) => void }) {
  const { language, t } = useLanguage();
  const { configured, user } = useAuth();
  const zh = language === "zh-Hant";
  const textKey = zh ? "zh" : "en";
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const interactiveConnection = useRef<InteractiveConnection | null>(null);
  const editedLanguagesRef = useRef(new Set<ProgrammingLanguage>());
  const hydratedLanguagesRef = useRef(new Set<ProgrammingLanguage>());
  const [programmingLanguage, setProgrammingLanguage] = useState<ProgrammingLanguage>("cpp");
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [codeByLanguage, setCodeByLanguage] = useState(() => ({ ...problem.starterCode }));
  const [savedCodeByLanguage, setSavedCodeByLanguage] = useState(() => ({ ...problem.starterCode }));
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [pendingOverwrite, setPendingOverwrite] = useState<"import" | "reset" | null>(null);
  const [pendingImportedCode, setPendingImportedCode] = useState("");
  const [stdin, setStdin] = useState(problem.samples[0]?.input ?? "");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  // The input the current result was produced from, so editing the input never compares stale output.
  const [runStdin, setRunStdin] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeConsoleTab, setActiveConsoleTab] = useState<"output" | "input">("input");
  const [inputMode, setInputMode] = useState<"batch" | "interactive">("batch");
  const [interactiveOutput, setInteractiveOutput] = useState<InteractiveOutput[]>([]);
  const [interactiveStatus, setInteractiveStatus] = useState<InteractiveStatus>("idle");
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  const [judgeError, setJudgeError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const matchedSample = runStdin === null ? -1 : findMatchingSample(problem.samples, runStdin);
  const sampleCheck = runResult?.status === "accepted" && inputMode === "batch" && matchedSample >= 0
    ? { index: matchedSample, expected: problem.samples[matchedSample].output, matches: outputsMatch(runResult.stdout, problem.samples[matchedSample].output) }
    : null;
  const [problemWidth, setProblemWidth] = useState(35);
  const [resultWidth, setResultWidth] = useState(22);
  const [resizing, setResizing] = useState<ResizeTarget>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [hydratedWorkspaceStateKey, setHydratedWorkspaceStateKey] = useState<string | null>(null);
  const workspaceStateKey = pageStateKey(`problems:${problem.id}:workspace`, user?.id);
  const code = codeByLanguage[programmingLanguage];
  const isDirty = code !== savedCodeByLanguage[programmingLanguage];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = loadPageState(workspaceStateKey, isProblemWorkspaceState);
      if (restored) {
        setProgrammingLanguage(restored.programmingLanguage);
        setStdin(restored.stdin);
        setActiveConsoleTab(restored.activeConsoleTab);
        setInputMode(restored.inputMode);
        setRunResult(restored.runResult);
        setJudgeResult(restored.judgeResult);
        setProblemWidth(restored.problemWidth);
        setResultWidth(restored.resultWidth);
        setAiOpen(restored.aiOpen);
      }
      setHydratedWorkspaceStateKey(workspaceStateKey);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [workspaceStateKey]);

  useEffect(() => {
    if (hydratedWorkspaceStateKey !== workspaceStateKey) return;
    savePageState(workspaceStateKey, {
      activeConsoleTab,
      aiOpen,
      inputMode,
      judgeResult,
      problemWidth,
      programmingLanguage,
      resultWidth,
      runResult,
      stdin,
    });
  }, [activeConsoleTab, aiOpen, hydratedWorkspaceStateKey, inputMode, judgeResult, problemWidth, programmingLanguage, resultWidth, runResult, stdin, workspaceStateKey]);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async (targetLanguage: ProgrammingLanguage) => {
      await Promise.resolve();
      const localDraft = loadLocalProblemCodeDraft(problem.id, targetLanguage);
      if (cancelled || editedLanguagesRef.current.has(targetLanguage)) return;
      if (localDraft) {
        hydratedLanguagesRef.current.add(targetLanguage);
        setCodeByLanguage((current) => ({ ...current, [targetLanguage]: localDraft.code }));
        setSavedCodeByLanguage((current) => ({ ...current, [targetLanguage]: localDraft.savedCode }));
        return;
      }
      if (configured && user) {
        try {
          const saved = await loadSavedProblemCode(problem.id, targetLanguage);
          if (cancelled || editedLanguagesRef.current.has(targetLanguage)) return;
          if (saved) {
            setCodeByLanguage((current) => ({ ...current, [targetLanguage]: saved.code }));
            setSavedCodeByLanguage((current) => ({ ...current, [targetLanguage]: saved.code }));
          }
        } catch {
          // Loading failure must not block the editor; Save will show a specific error.
        }
      }
      hydratedLanguagesRef.current.add(targetLanguage);
    };
    void Promise.all([hydrate("cpp"), hydrate("python")]);
    return () => { cancelled = true; };
  }, [configured, problem.id, user]);

  useEffect(() => {
    if (!hydratedLanguagesRef.current.has(programmingLanguage)) return;
    if (isDirty) {
      saveLocalProblemCodeDraft(problem.id, programmingLanguage, {
        code,
        savedCode: savedCodeByLanguage[programmingLanguage],
      });
    } else {
      clearLocalProblemCodeDraft(problem.id, programmingLanguage);
    }
  }, [code, isDirty, problem.id, programmingLanguage, savedCodeByLanguage]);

  useEffect(() => {
    return () => interactiveConnection.current?.stop();
  }, []);

  useEffect(() => {
    if (!languageMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) setLanguageMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLanguageMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [languageMenuOpen]);

  useEffect(() => {
    if (!resizing) return;
    const resize = (event: PointerEvent) => {
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width === 0) return;
      const pointerPercent = ((event.clientX - bounds.left) / bounds.width) * 100;
      if (resizing === "problem") {
        setProblemWidth(clamp(pointerPercent, 25, Math.min(45, 100 - resultWidth - 35)));
      } else {
        setResultWidth(clamp(100 - pointerPercent, 18, Math.min(32, 100 - problemWidth - 35)));
      }
    };
    const stop = () => setResizing(null);
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop, { once: true });
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stop);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [problemWidth, resizing, resultWidth]);

  const sourceFiles = (): SourceFile[] => [{
    name: programmingLanguage === "python" ? "main.py" : "main.cpp",
    content: code,
  }];

  const run = async () => {
    if (isRunning) return;
    if (inputMode === "interactive") {
      interactiveConnection.current?.stop();
      setActiveConsoleTab("input");
      setRunResult(null);
      setInteractiveOutput([]);
      setInteractiveStatus("connecting");
      setIsRunning(true);
      interactiveConnection.current = startInteractiveCode(sourceFiles(), programmingLanguage, {
        onEvent: (event) => {
          if (event.type === "output") {
            setInteractiveOutput((current) => [...current, event]);
          } else if (event.type === "status") {
            setInteractiveStatus(event.status);
            if (["accepted", "compile_error", "runtime_error", "timeout", "stopped"].includes(event.status)) setIsRunning(false);
          } else {
            setInteractiveOutput((current) => [...current, { stream: "stderr", data: `${event.message}\n` }]);
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

    setActiveConsoleTab("output");
    setRunResult(null);
    setRunStdin(stdin);
    setIsRunning(true);
    try {
      setRunResult(await runCode(sourceFiles(), stdin, programmingLanguage));
    } catch {
      setRunResult({
        status: "service_unavailable",
        stdout: "",
        stderr: t("unableToReachTheCompiler"),
        exit_code: null,
        duration_ms: 0,
        truncated: false,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const chooseProgrammingLanguage = (nextLanguage: ProgrammingLanguage) => {
    if (nextLanguage === programmingLanguage) {
      setLanguageMenuOpen(false);
      return;
    }
    interactiveConnection.current?.stop();
    interactiveConnection.current = null;
    setProgrammingLanguage(nextLanguage);
    setLanguageMenuOpen(false);
    setSaveNotice("");
    setRunResult(null);
    setInteractiveOutput([]);
    setInteractiveStatus("idle");
    setIsRunning(false);
  };

  const updateCurrentCode = (nextCode: string) => {
    editedLanguagesRef.current.add(programmingLanguage);
    hydratedLanguagesRef.current.add(programmingLanguage);
    setSaveNotice("");
    setCodeByLanguage((current) => ({ ...current, [programmingLanguage]: nextCode }));
  };

  const applyOverwrite = (kind: "import" | "reset", importedCode = pendingImportedCode) => {
    updateCurrentCode(kind === "reset" ? problem.starterCode[programmingLanguage] : importedCode);
    setPendingOverwrite(null);
    setPendingImportedCode("");
    setRunResult(null);
    setInteractiveOutput([]);
    setInteractiveStatus("idle");
  };

  const [pendingSubmission, setPendingSubmission] = useState<{ language: ProgrammingLanguage; code: string } | null>(null);

  const applySubmission = (submissionLanguage: ProgrammingLanguage, source: string) => {
    interactiveConnection.current?.stop();
    interactiveConnection.current = null;
    editedLanguagesRef.current.add(submissionLanguage);
    hydratedLanguagesRef.current.add(submissionLanguage);
    setProgrammingLanguage(submissionLanguage);
    setCodeByLanguage((current) => ({ ...current, [submissionLanguage]: source }));
    setSaveNotice("");
    setRunResult(null);
    setRunStdin(null);
    setInteractiveOutput([]);
    setInteractiveStatus("idle");
    setIsRunning(false);
    setPendingSubmission(null);
  };

  // Only the slot being replaced can lose work; the other language keeps its own code.
  const requestSubmissionLoad = (submissionLanguage: ProgrammingLanguage, source: string) => {
    if (codeByLanguage[submissionLanguage] !== savedCodeByLanguage[submissionLanguage]) {
      setPendingSubmission({ language: submissionLanguage, code: source });
      return;
    }
    applySubmission(submissionLanguage, source);
  };

  const requestReset = () => {
    if (isDirty) {
      setPendingOverwrite("reset");
      return;
    }
    applyOverwrite("reset");
  };

  const importCode = async (file: File) => {
    const expectedExtension = programmingLanguage === "python" ? ".py" : ".cpp";
    if (!file.name.toLocaleLowerCase().endsWith(expectedExtension)) {
      setSaveNotice(t("theCurrentLanguageOnlyAccepts", { extension: expectedExtension }));
      return;
    }
    if (file.size === 0) {
      setSaveNotice(t("anEmptyFileCannotBe"));
      return;
    }
    if (file.size > 65_536) {
      setSaveNotice(t("theFileMustNotExceed"));
      return;
    }
    try {
      const importedCode = await file.text();
      if (!importedCode.trim()) {
        setSaveNotice(t("aWhitespaceOnlyFileCannot"));
        return;
      }
      if (isDirty) {
        setPendingImportedCode(importedCode);
        setPendingOverwrite("import");
      } else {
        applyOverwrite("import", importedCode);
      }
    } catch {
      setSaveNotice(t("theFileCouldNotBe"));
    }
  };

  const saveCode = async () => {
    if (isSaving || !isDirty) return;
    if (!user) {
      setSaveNotice(t("signInToSaveCode"));
      return;
    }
    if (new Blob([code]).size > 65_536) {
      setSaveNotice(t("codeMustNotExceed64"));
      return;
    }
    setIsSaving(true);
    setSaveNotice("");
    try {
      const saved = await saveProblemCode(problem.id, programmingLanguage, code);
      setSavedCodeByLanguage((current) => ({ ...current, [programmingLanguage]: saved.code }));
      clearLocalProblemCodeDraft(problem.id, programmingLanguage);
      setSaveNotice(t("savedToYourAccount"));
    } catch (error) {
      if (error instanceof ProblemCodeDraftError && error.code === "migration_missing") {
        setSaveNotice(t("theProblemCodeTableIs"));
      } else if (error instanceof ProblemCodeDraftError && error.code === "not_authenticated") {
        setSaveNotice(t("yourSessionExpiredSignIn"));
      } else {
        setSaveNotice(t("theCodeCouldNotBe"));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const submit = async () => {
    if (isSubmitting || isRunning) return;
    setJudgeError("");
    setJudgeResult(null);
    setIsSubmitting(true);
    try {
      const result = await submitProblem(problem.id, sourceFiles(), programmingLanguage);
      setJudgeResult(result);
      onSubmitted?.(result);
    } catch (error) {
      if (error instanceof JudgeApiError && error.statusCode === 401) {
        setJudgeError(t("signInToDevCompass"));
      } else if (error instanceof JudgeApiError && error.statusCode === 503) {
        setJudgeError(t("theJudgeIsNotConfigured"));
      } else {
        setJudgeError(error instanceof Error ? error.message : (t("theSubmissionCouldNotBe")));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const editorWidth = 100 - problemWidth - resultWidth;
  const aiErrorOutput = [
    runResult?.stderr,
    ...interactiveOutput.filter((entry) => entry.stream === "stderr").map((entry) => entry.data),
  ].filter(Boolean).join("\n");

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#090d14] xl:h-[calc(100dvh-4rem)] xl:flex-none">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/8 bg-[#0b1018] px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onBack} className="rounded-lg border border-white/8 px-3 py-1.5 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-white">← {t("backToProblems")}</button>
          <span className="hidden h-4 w-px bg-white/10 sm:block" />
          <p className="truncate text-xs font-semibold text-slate-200"><span className="mr-2 font-mono text-slate-500">#{problem.id}</span>{problem.title[textKey]}</p>
        </div>
        <div className="hidden items-center gap-2 text-[10px] text-slate-500 xl:flex">
          <span>{t("dragDividersToResize")}</span>
          <button type="button" onClick={() => { setProblemWidth(35); setResultWidth(22); }} className="rounded-md px-2 py-1 text-cyan-300/70 hover:bg-cyan-300/5 hover:text-cyan-200">{t("reset")}</button>
        </div>
      </div>

      <div ref={workspaceRef} className="min-h-0 flex-1 overflow-y-auto xl:grid xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden" style={{ gridTemplateColumns: `minmax(0, ${problemWidth}fr) 6px minmax(0, ${editorWidth}fr) 6px minmax(0, ${resultWidth}fr)` }}>
        <ProblemStatement problem={problem} textKey={textKey} zh={zh} onLoadSample={(input) => { setStdin(input); setInputMode("batch"); setActiveConsoleTab("input"); }} samplesLocked={isRunning} />
        <ResizeHandle label={t("resizeProblemAndEditor")} active={resizing === "problem"} onPointerDown={() => setResizing("problem")} />

        <section className="flex min-h-[780px] min-w-0 flex-col border-y border-white/8 bg-[#0c111b] xl:min-h-0 xl:border-y-0" aria-label={t("codeEditor")}>
          <div className="relative z-30 flex min-h-12 shrink-0 items-center justify-between gap-3 overflow-visible border-b border-white/8 px-4 py-2">
            <div ref={languageMenuRef} className="relative z-50 shrink-0">
              <button type="button" onClick={() => setLanguageMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={languageMenuOpen} aria-label={t("chooseProgrammingLanguage")} className="flex h-8 items-center gap-2 rounded-lg border border-white/8 bg-white/[0.025] px-3 text-[10px] font-semibold text-slate-300 hover:border-white/15">
                <span>{programmingLanguage === "python" ? "Python 3" : "C++20"}</span><span className={`text-[9px] text-slate-600 transition-transform ${languageMenuOpen ? "rotate-180" : ""}`}>⌄</span>
              </button>
              {languageMenuOpen ? (
                <div role="menu" aria-label={t("chooseProgrammingLanguage")} className="absolute left-0 top-[calc(100%+0.45rem)] z-50 min-w-36 overflow-hidden rounded-xl border border-white/10 bg-[#111824] p-1.5 shadow-2xl shadow-black/50">
                  {(["cpp", "python"] as const).map((item) => <button key={item} type="button" role="menuitemradio" aria-checked={programmingLanguage === item} onClick={() => chooseProgrammingLanguage(item)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${programmingLanguage === item ? "bg-cyan-300/10 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}><span>{item === "cpp" ? "C++20" : "Python 3"}</span>{programmingLanguage === item ? <span>✓</span> : null}</button>)}
                </div>
              ) : null}
            </div>
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
              <span className={`whitespace-nowrap text-[9px] font-medium ${isDirty ? "text-amber-200" : "text-emerald-300/75"}`}>{isDirty ? (t("unsaved")) : (t("saved"))}</span>
              <input
                ref={importInputRef}
                type="file"
                accept={programmingLanguage === "python" ? ".py" : ".cpp"}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void importCode(file);
                }}
              />
              <button type="button" onClick={() => importInputRef.current?.click()} className="h-8 whitespace-nowrap rounded-lg border border-white/8 px-3 text-[10px] text-slate-400 hover:border-white/15 hover:text-white">{t("import")}</button>
              <button type="button" onClick={() => void saveCode()} disabled={isSaving || !isDirty} className="h-8 whitespace-nowrap rounded-lg border border-cyan-300/20 px-3 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-300/5 disabled:cursor-default disabled:opacity-35">{isSaving ? (t("saving")) : "Save"}</button>
              <button type="button" onClick={requestReset} className="h-8 whitespace-nowrap rounded-lg border border-white/8 px-3 text-[10px] text-slate-400 hover:border-white/15 hover:text-white">{t("reset2")}</button>
              <button type="button" onClick={() => void run()} disabled={isRunning} className="h-8 whitespace-nowrap rounded-lg bg-cyan-400 px-4 text-[10px] font-bold text-slate-950 hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60">▶ Run</button>
              <button type="button" onClick={() => void submit()} disabled={isSubmitting || isRunning} className="h-8 whitespace-nowrap rounded-lg bg-violet-400 px-4 text-[10px] font-bold text-slate-950 hover:bg-violet-300 disabled:cursor-wait disabled:opacity-60">{isSubmitting ? (t("judging")) : "Submit"}</button>
            </div>
          </div>
          {saveNotice ? <p role="status" className="shrink-0 border-b border-white/8 bg-[#0a0f17] px-4 py-2 text-[10px] text-amber-200">{saveNotice}</p> : null}
          <div className="min-h-[390px] flex-1 overflow-hidden xl:min-h-0">
            <MonacoEditor language={programmingLanguage === "python" ? "python" : "cpp"} theme="vs-dark" value={code} onChange={(value) => updateCurrentCode(value ?? "")} options={{ automaticLayout: true, fontFamily: "JetBrains Mono, Fira Code, Consolas, monospace", fontSize: 14, minimap: { enabled: false }, padding: { top: 18 }, scrollBeyondLastLine: false, tabSize: 4, wordWrap: "off" }} />
          </div>
          {sampleCheck ? (
            <div role="status" className={`shrink-0 border-t px-4 py-2.5 text-[11px] ${sampleCheck.matches ? "border-emerald-300/15 bg-emerald-400/[0.04] text-emerald-300" : "border-amber-300/20 bg-amber-300/[0.04] text-amber-200"}`}>
              <p className="font-semibold">{sampleCheck.matches ? "✓ " : "✕ "}{t(sampleCheck.matches ? "sampleMatches" : "sampleDiffers", { n: sampleCheck.index + 1 })}</p>
              {sampleCheck.matches ? null : (
                <div className="mt-2">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{t("sampleExpectedOutput")}</p>
                  <pre className="mt-1 max-h-24 overflow-auto rounded-lg bg-[#070b11] px-3 py-2 font-mono text-[11px] text-slate-300">{sampleCheck.expected}</pre>
                </div>
              )}
            </div>
          ) : null}
          <OutputPanel
            activeTab={activeConsoleTab}
            isRunning={isRunning}
            inputMode={inputMode}
            interactiveOutput={interactiveOutput}
            interactiveStatus={interactiveStatus}
            onClear={() => { setRunResult(null); setRunStdin(null); setInteractiveOutput([]); }}
            onInputModeChange={(mode) => { if (!isRunning) { setInputMode(mode); setActiveConsoleTab("input"); } }}
            onInteractiveInput={(data) => {
              const line = data.endsWith("\n") ? data : `${data}\n`;
              if (!interactiveConnection.current?.send(line)) return false;
              setInteractiveOutput((current) => [...current, { stream: "stdin", data: line }]);
              return true;
            }}
            onSelectTab={setActiveConsoleTab}
            onStdinChange={setStdin}
            onStopInteractive={() => { interactiveConnection.current?.stop(); interactiveConnection.current = null; setInteractiveStatus("stopped"); setIsRunning(false); }}
            result={runResult}
            stdin={stdin}
            programmingLanguage={programmingLanguage}
          />
        </section>

        <ResizeHandle label={t("resizeEditorAndResult")} active={resizing === "result"} onPointerDown={() => setResizing("result")} />
        <JudgeResultPanel error={judgeError} isSubmitting={isSubmitting} result={judgeResult} problem={problem} textKey={textKey} onLoadSubmission={requestSubmissionLoad} />
      </div>

      {aiOpen ? (
        <div className="fixed bottom-5 right-5 z-50 h-[min(600px,calc(100dvh-8.75rem))] w-[min(380px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-violet-300/20 bg-[#0b1018] shadow-2xl shadow-black/60">
          <AiTutorPanel code={code} errorOutput={aiErrorOutput} judgeSummary={judgeResult} onClose={() => setAiOpen(false)} persistenceScope={`problem:${problem.id}`} programmingLanguage={programmingLanguage} />
        </div>
      ) : (
        <button type="button" onClick={() => setAiOpen(true)} aria-label={t("openAiTutor")} className="fixed bottom-6 right-6 z-40 grid size-14 place-items-center rounded-full border border-violet-300/25 bg-violet-400 text-sm font-black text-slate-950 shadow-lg shadow-violet-950/40 transition-transform hover:scale-105">AI</button>
      )}

      <ConfirmDialog
        open={pendingOverwrite !== null}
        title={pendingOverwrite === "import" ? (t("importAndReplaceTheCurrent")) : (t("resetToTheStarterCode"))}
        description={pendingOverwrite === "import"
          ? (t("youHaveUnsavedChangesImporting"))
          : (t("youHaveUnsavedChangesResetting"))}
        confirmLabel={pendingOverwrite === "import" ? (t("import2")) : (t("reset3"))}
        cancelLabel={t("cancel")}
        closeLabel={t("closeConfirmation")}
        tone={pendingOverwrite === "reset" ? "danger" : "default"}
        onClose={() => { setPendingOverwrite(null); setPendingImportedCode(""); }}
        onConfirm={() => applyOverwrite(pendingOverwrite ?? "reset")}
      />
      <ConfirmDialog
        open={pendingSubmission !== null}
        title={t("loadSubmissionTitle")}
        description={t("loadSubmissionConfirm")}
        confirmLabel={t("loadSubmissionAction")}
        cancelLabel={t("cancel")}
        closeLabel={t("closeConfirmation")}
        tone="danger"
        onClose={() => setPendingSubmission(null)}
        onConfirm={() => { if (pendingSubmission) applySubmission(pendingSubmission.language, pendingSubmission.code); }}
      />
    </section>
  );
}

function ResizeHandle({ label, active, onPointerDown }: { label: string; active: boolean; onPointerDown: () => void }) {
  return <button type="button" aria-label={label} onPointerDown={(event) => { event.preventDefault(); onPointerDown(); }} className={`group relative hidden cursor-col-resize touch-none bg-white/[0.035] outline-none xl:block ${active ? "bg-cyan-300/20" : "hover:bg-cyan-300/10"}`}><span className="absolute left-1/2 top-1/2 h-10 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-700 group-hover:bg-cyan-300/60" /></button>;
}

const problemNoteKeys: TranslationKey[] = ["problemNote1", "problemNote2", "problemNote3", "problemNote4", "problemNote5", "problemNote6", "problemNote7"];

function ProblemStatement({ problem, textKey, zh, onLoadSample, samplesLocked }: { problem: Problem; textKey: "zh" | "en"; zh: boolean; onLoadSample: (input: string) => void; samplesLocked: boolean }) {
  const { t } = useLanguage();
  const difficulty = { easy: t("easy"), medium: t("medium"), hard: t("hard") }[problem.difficulty];
  const totalCases = problem.testGroups.reduce((sum, group) => sum + group.testCaseCount, 0);
  return (
    <article className="min-h-[520px] min-w-0 overflow-y-auto bg-[#0a0f17] p-5 sm:p-6 xl:min-h-0" aria-label={t("problemStatement")}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300/65">Problem #{problem.id}</p><h1 className="mt-2 text-xl font-semibold text-white">{problem.title[textKey]}</h1></div><span className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${problem.difficulty === "easy" ? "bg-emerald-400/10 text-emerald-300" : problem.difficulty === "medium" ? "bg-amber-300/10 text-amber-200" : "bg-rose-400/10 text-rose-300"}`}>{difficulty}</span>{problem.apcsLevel ? <span className="rounded-full bg-violet-300/10 px-2.5 py-1 text-[10px] font-semibold text-violet-200">APCS {t("apcsLevelValue", { level: String(problem.apcsLevel) })}</span> : null}</span></div>
      <div className="mt-4 flex flex-wrap gap-2">{problem.tags.map((tag) => <span key={tag} className="rounded-full border border-cyan-300/10 bg-cyan-300/[0.04] px-2.5 py-1 text-[10px] text-cyan-200/75">#{getProblemTagLabel(tag)[textKey]}</span>)}</div>
      <StatementSection title={t("description")}>{problem.description.map((paragraph) => <p key={paragraph[textKey]}>{paragraph[textKey]}</p>)}</StatementSection>
      <StatementSection title={t("input2")}><p>{problem.inputFormat[textKey]}</p></StatementSection>
      <StatementSection title={t("output2")}><p>{problem.outputFormat[textKey]}</p></StatementSection>
      <StatementSection title={t("examples")}>
        {problem.samples.map((sample, index) => <div key={`${sample.input}-${index}`} className="mt-3 overflow-hidden rounded-xl border border-white/8 bg-[#070b11]"><SampleBlock label={`${t("sampleInput")} ${index + 1}`} value={sample.input} action={<button type="button" disabled={samplesLocked} onClick={() => onLoadSample(sample.input)} className="rounded-md border border-cyan-300/20 px-2 py-1 text-[9px] font-semibold normal-case tracking-normal text-cyan-200 hover:border-cyan-300/40 disabled:cursor-not-allowed disabled:opacity-40">{t("loadSampleToInput")}</button>} /><SampleBlock label={`${t("sampleOutput")} ${index + 1}`} value={sample.output} bordered />{sample.explanation ? <p className="border-t border-white/8 px-4 py-3 text-[11px] text-slate-500">{sample.explanation[textKey]}</p> : null}</div>)}
      </StatementSection>
      <StatementSection title={t("testsAndScoring")}>
        <div className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2"><span>{t("totalJudgeCases")}</span><strong className="font-mono text-cyan-200">{totalCases}</strong></div>
        <TestGroupList problem={problem} textKey={textKey} zh={zh} />
        <div className="mt-4 grid grid-cols-2 gap-2"><LimitCard label={t("timeLimit")} value={`${problem.timeLimitMs / 1000} sec`} /><LimitCard label={t("memoryLimit")} value={`${problem.memoryLimitMb} MB`} /></div>
      </StatementSection>
      <StatementSection title={t("problemNotesTitle")}>
        <ul className="space-y-2">
          {problemNoteKeys.map((key) => <li key={key} className="flex gap-3"><span aria-hidden="true" className="mt-2.5 size-1 shrink-0 rounded-full bg-cyan-300/60" /><span className="min-w-0 break-words">{t(key)}</span></li>)}
        </ul>
        <p className="border-t border-white/8 pt-3 text-[11px] text-slate-500">{t("problemNoteSource")} <Link href={sectionPaths.terms} target="_blank" rel="noopener" className="text-cyan-300/80 underline-offset-2 hover:underline">{t("problemNotesMore")}</Link></p>
      </StatementSection>
    </article>
  );
}

function StatementSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-8"><h2 className="text-xs font-semibold text-white">{title}</h2><div className="mt-3 space-y-3 text-xs leading-6 text-slate-400">{children}</div></section>; }
function TestGroupList({ problem, textKey, zh }: { problem: Problem; textKey: "zh" | "en"; zh: boolean }) { const { t } = useLanguage(); return <div className="space-y-2">{problem.testGroups.map((group, index) => <div key={`${group.name[textKey]}-${index}`} className="rounded-lg border border-white/8 bg-white/[0.015] px-3 py-3"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold text-slate-300">{scoringGroupLabel(index, zh)}</span><strong className="font-mono text-[11px] text-cyan-200">{group.scorePercent}%</strong></div><p className="mt-2 text-[11px] leading-5 text-slate-300">{group.condition[textKey]}</p><p className="mt-1 font-mono text-[9px] text-slate-600">{group.testCaseCount} {t("judgeCases2")}</p></div>)}</div>; }
function SampleBlock({ label, value, bordered = false, action }: { label: string; value: string; bordered?: boolean; action?: React.ReactNode }) { return <div className={bordered ? "border-t border-white/8" : ""}><div className="flex items-center justify-between gap-2 px-4 py-2 text-[9px] font-semibold uppercase tracking-wider text-slate-600"><span>{label}</span>{action}</div><pre className="overflow-x-auto px-4 pb-3 font-mono text-xs text-slate-300">{value}</pre></div>; }
function LimitCard({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/8 bg-white/[0.025] p-3"><span className="block text-[9px] uppercase tracking-wider text-slate-600">{label}</span><strong className="mt-1 block font-mono text-[11px] text-slate-300">{value}</strong></div>; }
