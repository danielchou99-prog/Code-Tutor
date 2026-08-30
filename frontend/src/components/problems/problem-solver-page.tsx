"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

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
import { useLanguage } from "@/lib/language-context";
import { loadPageState, pageStateKey, savePageState } from "@/lib/page-state";
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
  const { language } = useLanguage();
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
  const [isRunning, setIsRunning] = useState(false);
  const [activeConsoleTab, setActiveConsoleTab] = useState<"output" | "input">("input");
  const [inputMode, setInputMode] = useState<"batch" | "interactive">("batch");
  const [interactiveOutput, setInteractiveOutput] = useState<InteractiveOutput[]>([]);
  const [interactiveStatus, setInteractiveStatus] = useState<InteractiveStatus>("idle");
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  const [judgeError, setJudgeError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    setIsRunning(true);
    try {
      setRunResult(await runCode(sourceFiles(), stdin, programmingLanguage));
    } catch {
      setRunResult({
        status: "service_unavailable",
        stdout: "",
        stderr: zh
          ? "無法連線到編譯器 API，請確認 FastAPI 後端已在 8000 埠啟動。"
          : "Unable to reach the compiler API. Make sure FastAPI is running on port 8000.",
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
      setSaveNotice(zh ? `目前語言只接受 ${expectedExtension} 檔案。` : `The current language only accepts ${expectedExtension} files.`);
      return;
    }
    if (file.size === 0) {
      setSaveNotice(zh ? "無法匯入空白檔案。" : "An empty file cannot be imported.");
      return;
    }
    if (file.size > 65_536) {
      setSaveNotice(zh ? "檔案不可超過 64 KiB。" : "The file must not exceed 64 KiB.");
      return;
    }
    try {
      const importedCode = await file.text();
      if (!importedCode.trim()) {
        setSaveNotice(zh ? "無法匯入只有空白內容的檔案。" : "A whitespace-only file cannot be imported.");
        return;
      }
      if (isDirty) {
        setPendingImportedCode(importedCode);
        setPendingOverwrite("import");
      } else {
        applyOverwrite("import", importedCode);
      }
    } catch {
      setSaveNotice(zh ? "無法讀取這個檔案，請重新選擇。" : "The file could not be read. Choose it again.");
    }
  };

  const saveCode = async () => {
    if (isSaving || !isDirty) return;
    if (!user) {
      setSaveNotice(zh ? "請先登入，才能將程式碼儲存到帳號。未儲存內容仍保留在此裝置。" : "Sign in to save code to your account. The unsaved draft remains on this device.");
      return;
    }
    if (new Blob([code]).size > 65_536) {
      setSaveNotice(zh ? "程式碼不可超過 64 KiB。" : "Code must not exceed 64 KiB.");
      return;
    }
    setIsSaving(true);
    setSaveNotice("");
    try {
      const saved = await saveProblemCode(problem.id, programmingLanguage, code);
      setSavedCodeByLanguage((current) => ({ ...current, [programmingLanguage]: saved.code }));
      clearLocalProblemCodeDraft(problem.id, programmingLanguage);
      setSaveNotice(zh ? "已儲存到你的帳號。" : "Saved to your account.");
    } catch (error) {
      if (error instanceof ProblemCodeDraftError && error.code === "migration_missing") {
        setSaveNotice(zh ? "Supabase 尚未建立題目程式碼資料表，請先執行最新 migration。" : "The problem code table is missing. Run the latest Supabase migration first.");
      } else if (error instanceof ProblemCodeDraftError && error.code === "not_authenticated") {
        setSaveNotice(zh ? "登入狀態已失效，請重新登入後再儲存。" : "Your session expired. Sign in again before saving.");
      } else {
        setSaveNotice(zh ? "程式碼儲存失敗，請檢查網路後再試一次。" : "The code could not be saved. Check your connection and try again.");
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
        setJudgeError(zh ? "請先登入 Code Tutor，再送出正式評分。" : "Sign in to Code Tutor before submitting for judging.");
      } else if (error instanceof JudgeApiError && error.statusCode === 503) {
        setJudgeError(zh ? "Judge 尚未完成伺服器設定，或目前暫時無法使用。" : "The Judge is not configured or is temporarily unavailable.");
      } else {
        setJudgeError(error instanceof Error ? error.message : (zh ? "無法送出程式碼。" : "The submission could not be sent."));
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
          <button type="button" onClick={onBack} className="rounded-lg border border-white/8 px-3 py-1.5 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-white">← {zh ? "返回題目列表" : "Back to problems"}</button>
          <span className="hidden h-4 w-px bg-white/10 sm:block" />
          <p className="truncate text-xs font-semibold text-slate-200"><span className="mr-2 font-mono text-slate-500">#{problem.id}</span>{problem.title[textKey]}</p>
        </div>
        <div className="hidden items-center gap-2 text-[10px] text-slate-500 xl:flex">
          <span>{zh ? "拖曳分隔線可調整版面" : "Drag dividers to resize"}</span>
          <button type="button" onClick={() => { setProblemWidth(35); setResultWidth(22); }} className="rounded-md px-2 py-1 text-cyan-300/70 hover:bg-cyan-300/5 hover:text-cyan-200">{zh ? "重設" : "Reset"}</button>
        </div>
      </div>

      <div ref={workspaceRef} className="min-h-0 flex-1 overflow-y-auto xl:grid xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden" style={{ gridTemplateColumns: `minmax(0, ${problemWidth}fr) 6px minmax(0, ${editorWidth}fr) 6px minmax(0, ${resultWidth}fr)` }}>
        <ProblemStatement problem={problem} textKey={textKey} zh={zh} />
        <ResizeHandle label={zh ? "調整題目與編輯器寬度" : "Resize problem and editor"} active={resizing === "problem"} onPointerDown={() => setResizing("problem")} />

        <section className="flex min-h-[780px] min-w-0 flex-col border-y border-white/8 bg-[#0c111b] xl:min-h-0 xl:border-y-0" aria-label={zh ? "程式碼編輯器" : "Code editor"}>
          <div className="relative z-30 flex min-h-12 shrink-0 items-center justify-between gap-3 overflow-visible border-b border-white/8 px-4 py-2">
            <div ref={languageMenuRef} className="relative z-50 shrink-0">
              <button type="button" onClick={() => setLanguageMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={languageMenuOpen} aria-label={zh ? "選擇程式語言" : "Choose programming language"} className="flex h-8 items-center gap-2 rounded-lg border border-white/8 bg-white/[0.025] px-3 text-[10px] font-semibold text-slate-300 hover:border-white/15">
                <span>{programmingLanguage === "python" ? "Python 3" : "C++20"}</span><span className={`text-[9px] text-slate-600 transition-transform ${languageMenuOpen ? "rotate-180" : ""}`}>⌄</span>
              </button>
              {languageMenuOpen ? (
                <div role="menu" aria-label={zh ? "選擇程式語言" : "Choose programming language"} className="absolute left-0 top-[calc(100%+0.45rem)] z-50 min-w-36 overflow-hidden rounded-xl border border-white/10 bg-[#111824] p-1.5 shadow-2xl shadow-black/50">
                  {(["cpp", "python"] as const).map((item) => <button key={item} type="button" role="menuitemradio" aria-checked={programmingLanguage === item} onClick={() => chooseProgrammingLanguage(item)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${programmingLanguage === item ? "bg-cyan-300/10 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}><span>{item === "cpp" ? "C++20" : "Python 3"}</span>{programmingLanguage === item ? <span>✓</span> : null}</button>)}
                </div>
              ) : null}
            </div>
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
              <span className={`whitespace-nowrap text-[9px] font-medium ${isDirty ? "text-amber-200" : "text-emerald-300/75"}`}>{isDirty ? (zh ? "未儲存" : "Unsaved") : (zh ? "已儲存" : "Saved")}</span>
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
              <button type="button" onClick={() => importInputRef.current?.click()} className="h-8 whitespace-nowrap rounded-lg border border-white/8 px-3 text-[10px] text-slate-400 hover:border-white/15 hover:text-white">{zh ? "匯入" : "Import"}</button>
              <button type="button" onClick={() => void saveCode()} disabled={isSaving || !isDirty} className="h-8 whitespace-nowrap rounded-lg border border-cyan-300/20 px-3 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-300/5 disabled:cursor-default disabled:opacity-35">{isSaving ? (zh ? "儲存中…" : "Saving…") : "Save"}</button>
              <button type="button" onClick={requestReset} className="h-8 whitespace-nowrap rounded-lg border border-white/8 px-3 text-[10px] text-slate-400 hover:border-white/15 hover:text-white">{zh ? "還原" : "Reset"}</button>
              <button type="button" onClick={() => void run()} disabled={isRunning} className="h-8 whitespace-nowrap rounded-lg bg-cyan-400 px-4 text-[10px] font-bold text-slate-950 hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60">▶ Run</button>
              <button type="button" onClick={() => void submit()} disabled={isSubmitting || isRunning} className="h-8 whitespace-nowrap rounded-lg bg-violet-400 px-4 text-[10px] font-bold text-slate-950 hover:bg-violet-300 disabled:cursor-wait disabled:opacity-60">{isSubmitting ? (zh ? "評分中…" : "Judging…") : "Submit"}</button>
            </div>
          </div>
          {saveNotice ? <p role="status" className="shrink-0 border-b border-white/8 bg-[#0a0f17] px-4 py-2 text-[10px] text-amber-200">{saveNotice}</p> : null}
          <div className="min-h-[390px] flex-1 overflow-hidden xl:min-h-0">
            <MonacoEditor language={programmingLanguage === "python" ? "python" : "cpp"} theme="vs-dark" value={code} onChange={(value) => updateCurrentCode(value ?? "")} options={{ automaticLayout: true, fontFamily: "JetBrains Mono, Fira Code, Consolas, monospace", fontSize: 14, minimap: { enabled: false }, padding: { top: 18 }, scrollBeyondLastLine: false, tabSize: 4, wordWrap: "off" }} />
          </div>
          <OutputPanel
            activeTab={activeConsoleTab}
            isRunning={isRunning}
            inputMode={inputMode}
            interactiveOutput={interactiveOutput}
            interactiveStatus={interactiveStatus}
            onClear={() => { setRunResult(null); setInteractiveOutput([]); }}
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

        <ResizeHandle label={zh ? "調整編輯器與結果寬度" : "Resize editor and result"} active={resizing === "result"} onPointerDown={() => setResizing("result")} />
        <JudgePanel error={judgeError} isSubmitting={isSubmitting} result={judgeResult} problem={problem} textKey={textKey} zh={zh} />
      </div>

      {aiOpen ? (
        <div className="fixed bottom-5 right-5 z-50 h-[min(600px,calc(100dvh-8.75rem))] w-[min(380px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-violet-300/20 bg-[#0b1018] shadow-2xl shadow-black/60">
          <AiTutorPanel code={code} errorOutput={aiErrorOutput} judgeSummary={judgeResult} onClose={() => setAiOpen(false)} persistenceScope={`problem:${problem.id}`} programmingLanguage={programmingLanguage} />
        </div>
      ) : (
        <button type="button" onClick={() => setAiOpen(true)} aria-label={zh ? "開啟 AI Tutor" : "Open AI Tutor"} className="fixed bottom-6 right-6 z-40 grid size-14 place-items-center rounded-full border border-violet-300/25 bg-violet-400 text-sm font-black text-slate-950 shadow-lg shadow-violet-950/40 transition-transform hover:scale-105">AI</button>
      )}

      <ConfirmDialog
        open={pendingOverwrite !== null}
        title={pendingOverwrite === "import" ? (zh ? "匯入並取代目前程式碼？" : "Import and replace the current code?") : (zh ? "還原預設程式碼？" : "Reset to the starter code?")}
        description={pendingOverwrite === "import"
          ? (zh ? "目前有尚未儲存的修改。繼續匯入會取代編輯器內容，但不會自動儲存到帳號。" : "You have unsaved changes. Importing will replace the editor contents and will not save automatically.")
          : (zh ? "目前有尚未儲存的修改。還原後會取代編輯器內容，但不會自動儲存到帳號。" : "You have unsaved changes. Resetting will replace the editor contents and will not save automatically.")}
        confirmLabel={pendingOverwrite === "import" ? (zh ? "繼續匯入" : "Import") : (zh ? "繼續還原" : "Reset")}
        cancelLabel={zh ? "取消" : "Cancel"}
        closeLabel={zh ? "關閉確認視窗" : "Close confirmation"}
        tone={pendingOverwrite === "reset" ? "danger" : "default"}
        onClose={() => { setPendingOverwrite(null); setPendingImportedCode(""); }}
        onConfirm={() => applyOverwrite(pendingOverwrite ?? "reset")}
      />
    </section>
  );
}

function ResizeHandle({ label, active, onPointerDown }: { label: string; active: boolean; onPointerDown: () => void }) {
  return <button type="button" aria-label={label} onPointerDown={(event) => { event.preventDefault(); onPointerDown(); }} className={`group relative hidden cursor-col-resize touch-none bg-white/[0.035] outline-none xl:block ${active ? "bg-cyan-300/20" : "hover:bg-cyan-300/10"}`}><span className="absolute left-1/2 top-1/2 h-10 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-700 group-hover:bg-cyan-300/60" /></button>;
}

function ProblemStatement({ problem, textKey, zh }: { problem: Problem; textKey: "zh" | "en"; zh: boolean }) {
  const difficulty = { easy: zh ? "簡單" : "Easy", medium: zh ? "中等" : "Medium", hard: zh ? "困難" : "Hard" }[problem.difficulty];
  const totalCases = problem.testGroups.reduce((sum, group) => sum + group.testCaseCount, 0);
  return (
    <article className="min-h-[520px] min-w-0 overflow-y-auto bg-[#0a0f17] p-5 sm:p-6 xl:min-h-0" aria-label={zh ? "題目內容" : "Problem statement"}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300/65">Problem #{problem.id}</p><h1 className="mt-2 text-xl font-semibold text-white">{problem.title[textKey]}</h1></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${problem.difficulty === "easy" ? "bg-emerald-400/10 text-emerald-300" : problem.difficulty === "medium" ? "bg-amber-300/10 text-amber-200" : "bg-rose-400/10 text-rose-300"}`}>{difficulty}</span></div>
      <div className="mt-4 flex flex-wrap gap-2">{problem.tags.map((tag) => <span key={tag} className="rounded-full border border-cyan-300/10 bg-cyan-300/[0.04] px-2.5 py-1 text-[10px] text-cyan-200/75">#{getProblemTagLabel(tag)[textKey]}</span>)}</div>
      <StatementSection title={zh ? "題目描述" : "Description"}>{problem.description.map((paragraph) => <p key={paragraph[textKey]}>{paragraph[textKey]}</p>)}</StatementSection>
      <StatementSection title={zh ? "輸入格式" : "Input"}><p>{problem.inputFormat[textKey]}</p></StatementSection>
      <StatementSection title={zh ? "輸出格式" : "Output"}><p>{problem.outputFormat[textKey]}</p></StatementSection>
      <StatementSection title={zh ? "範例" : "Examples"}>
        {problem.samples.map((sample, index) => <div key={`${sample.input}-${index}`} className="mt-3 overflow-hidden rounded-xl border border-white/8 bg-[#070b11]"><SampleBlock label={`${zh ? "範例輸入" : "Sample Input"} ${index + 1}`} value={sample.input} /><SampleBlock label={`${zh ? "範例輸出" : "Sample Output"} ${index + 1}`} value={sample.output} bordered />{sample.explanation ? <p className="border-t border-white/8 px-4 py-3 text-[11px] text-slate-500">{sample.explanation[textKey]}</p> : null}</div>)}
      </StatementSection>
      <StatementSection title={zh ? "限制" : "Constraints"}>
        <ul className="space-y-1 font-mono text-[11px]">{problem.constraints.map((constraint) => <li key={constraint[textKey]}>• {constraint[textKey]}</li>)}</ul>
        <TestGroupList problem={problem} textKey={textKey} zh={zh} />
        <div className="mt-4 grid grid-cols-2 gap-2"><LimitCard label="Time Limit" value={`${problem.timeLimitMs / 1000} sec`} /><LimitCard label="Memory Limit" value={`${problem.memoryLimitMb} MB`} /></div>
      </StatementSection>
      <StatementSection title={zh ? "測資與計分" : "Tests and scoring"}>
        <div className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2"><span>{zh ? "正式測資總數" : "Total judge cases"}</span><strong className="font-mono text-cyan-200">{totalCases}</strong></div>
        <TestGroupList problem={problem} textKey={textKey} zh={zh} />
      </StatementSection>
    </article>
  );
}

function StatementSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-8"><h2 className="text-xs font-semibold text-white">{title}</h2><div className="mt-3 space-y-3 text-xs leading-6 text-slate-400">{children}</div></section>; }
function TestGroupList({ problem, textKey, zh }: { problem: Problem; textKey: "zh" | "en"; zh: boolean }) { return <div className="space-y-2">{problem.testGroups.map((group, index) => <div key={`${group.name[textKey]}-${index}`} className="rounded-lg border border-white/8 bg-white/[0.015] px-3 py-3"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold text-slate-300">{zh ? `子任務 ${index + 1}` : `Subtask ${index + 1}`}</span><strong className="font-mono text-[11px] text-cyan-200">{group.scorePercent}%</strong></div><p className="mt-2 text-[11px] leading-5 text-slate-300">{group.condition[textKey]}</p><p className="mt-1 font-mono text-[9px] text-slate-600">{group.testCaseCount} {zh ? "筆測資" : "judge cases"}</p></div>)}</div>; }
function SampleBlock({ label, value, bordered = false }: { label: string; value: string; bordered?: boolean }) { return <div className={bordered ? "border-t border-white/8" : ""}><div className="px-4 py-2 text-[9px] font-semibold uppercase tracking-wider text-slate-600">{label}</div><pre className="overflow-x-auto px-4 pb-3 font-mono text-xs text-slate-300">{value}</pre></div>; }
function LimitCard({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/8 bg-white/[0.025] p-3"><span className="block text-[9px] uppercase tracking-wider text-slate-600">{label}</span><strong className="mt-1 block font-mono text-[11px] text-slate-300">{value}</strong></div>; }

function JudgePanel({ error, isSubmitting, result, problem, textKey, zh }: { error: string; isSubmitting: boolean; result: JudgeResult | null; problem: Problem; textKey: "zh" | "en"; zh: boolean }) {
  const totalCases = problem.testGroups.reduce((sum, group) => sum + group.testCaseCount, 0);
  const statusLabel = result ? ({
    accepted: zh ? "已通過" : "Accepted",
    wrong_answer: zh ? "答案錯誤" : "Wrong Answer",
    compile_error: zh ? "編譯錯誤" : "Compilation Error",
    runtime_error: zh ? "執行錯誤" : "Runtime Error",
    timeout: zh ? "超出時間限制" : "Time Limit Exceeded",
    memory_limit: zh ? "記憶體超出限制" : "Memory Limit Exceeded",
    output_limit: zh ? "輸出超過限制" : "Output Limit Exceeded",
    service_unavailable: zh ? "Judge 暫時無法使用" : "Judge Unavailable",
    server_busy: zh ? "Judge 忙碌中" : "Judge Busy",
    system_error: zh ? "Judge 系統錯誤" : "Judge System Error",
  }[result.status]) : "";
  return (
    <aside className="min-h-[420px] min-w-0 overflow-y-auto bg-[#0a0f17] p-5 xl:min-h-0" aria-label={zh ? "正式評分結果" : "Judge result"}>
      <div className="flex items-center justify-between"><h2 className="text-xs font-semibold text-white">Judge Result</h2></div>
      <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
        <div className={`flex items-center gap-2 text-xs font-semibold ${error ? "text-rose-300" : result?.status === "accepted" ? "text-emerald-300" : result ? "text-amber-200" : isSubmitting ? "text-violet-300" : "text-slate-300"}`}><span>{error ? "!" : result?.status === "accepted" ? "✓" : result ? "◇" : isSubmitting ? "…" : "○"}</span><span>{error || statusLabel || (isSubmitting ? (zh ? "正在執行隱藏測資…" : "Running hidden tests…") : (zh ? "等待送出" : "Ready to submit"))}</span></div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">{result ? (zh ? `通過 ${result.passed_cases} / ${result.total_cases} 筆測資，總分 ${result.score} 分，執行 ${result.duration_ms} ms。` : `Passed ${result.passed_cases} / ${result.total_cases} cases. Score: ${result.score}. Execution: ${result.duration_ms} ms.`) : isSubmitting ? (zh ? "請稍候，Judge 會逐筆執行測資並計算群組分數。" : "Please wait while the Judge runs each case and calculates group scores.") : (zh ? "按下 Submit 後，正式 Judge 狀態才會顯示在這裡。Run 不會改變此區域。" : "This panel changes only after Submit. Run results stay below the editor.")}</p>
      </div>
      <div className="mt-5 rounded-xl border border-white/8 p-4"><div className="flex items-center justify-between"><span className="text-[10px] text-slate-500">{zh ? "正式測資" : "Judge cases"}</span><strong className="font-mono text-xs text-white">{result?.total_cases ?? totalCases}</strong></div><div className="mt-3 space-y-3">{problem.testGroups.map((group, index) => { const judgedGroup = result?.groups.find((item) => item.group_order === index + 1); return <div key={group.name[textKey]} className="border-t border-white/6 pt-3 first:border-0 first:pt-0"><div className="flex items-center justify-between gap-2 text-[10px]"><span className="font-medium text-slate-300">{judgedGroup ? `${judgedGroup.earned_score} / ${judgedGroup.score_percent}` : `${group.scorePercent}%`}</span><span className={`font-mono ${judgedGroup?.status === "passed" ? "text-emerald-300" : judgedGroup?.status === "failed" ? "text-rose-300" : "text-slate-600"}`}>{judgedGroup ? `${judgedGroup.passed_cases} / ${judgedGroup.total_cases}` : `${group.testCaseCount} ${zh ? "筆" : "cases"}`}</span></div><p className="mt-1 text-[10px] leading-4 text-slate-500">{group.condition[textKey]}</p></div>; })}</div><div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3 text-[10px]"><span className="font-semibold text-slate-300">{zh ? "總分" : "Total"}</span><strong className="font-mono text-white">{result ? `${result.score} / 100` : "100%"}</strong></div></div>
      <div className="mt-7 border-t border-white/8 pt-5"><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">Judge status</p><div className="mt-3 grid gap-2 text-[10px] text-slate-600"><span>✓ Accepted</span><span>✕ Wrong Answer</span><span>⚠ Compilation Error</span><span>⏱ Time Limit Exceeded</span></div></div>
    </aside>
  );
}
