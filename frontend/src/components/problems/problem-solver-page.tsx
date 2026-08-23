"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { AiTutorPanel } from "@/components/workspace/ai-tutor-panel";
import { OutputPanel } from "@/components/workspace/output-panel";
import { runCode, type RunResult, type SourceFile } from "@/lib/compiler-api";
import type { ProgrammingLanguage } from "@/lib/file-items";
import {
  type InteractiveConnection,
  type InteractiveOutput,
  type InteractiveStatus,
  startInteractiveCode,
} from "@/lib/interactive-api";
import { useLanguage } from "@/lib/language-context";

import { type Problem, tagLabels } from "./problem-data";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-[#0c111b] font-mono text-xs text-slate-500">
      Loading editor…
    </div>
  ),
});

type JudgeView = "ready" | "unavailable";
type ResizeTarget = "problem" | "result" | null;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function ProblemSolverPage({ problem, onBack }: { problem: Problem; onBack: () => void }) {
  const { language } = useLanguage();
  const zh = language === "zh-Hant";
  const textKey = zh ? "zh" : "en";
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const interactiveConnection = useRef<InteractiveConnection | null>(null);
  const [programmingLanguage, setProgrammingLanguage] = useState<ProgrammingLanguage>("cpp");
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [codeByLanguage, setCodeByLanguage] = useState(() => ({ ...problem.starterCode }));
  const [stdin, setStdin] = useState(problem.samples[0]?.input ?? "");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeConsoleTab, setActiveConsoleTab] = useState<"output" | "input">("input");
  const [inputMode, setInputMode] = useState<"batch" | "interactive">("batch");
  const [interactiveOutput, setInteractiveOutput] = useState<InteractiveOutput[]>([]);
  const [interactiveStatus, setInteractiveStatus] = useState<InteractiveStatus>("idle");
  const [judgeView, setJudgeView] = useState<JudgeView>("ready");
  const [problemWidth, setProblemWidth] = useState(35);
  const [resultWidth, setResultWidth] = useState(22);
  const [resizing, setResizing] = useState<ResizeTarget>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const code = codeByLanguage[programmingLanguage];

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
    setRunResult(null);
    setInteractiveOutput([]);
    setInteractiveStatus("idle");
    setIsRunning(false);
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
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/8 px-4">
            <div ref={languageMenuRef} className="relative">
              <button type="button" onClick={() => setLanguageMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={languageMenuOpen} aria-label={zh ? "選擇程式語言" : "Choose programming language"} className="flex h-8 items-center gap-2 rounded-lg border border-white/8 bg-white/[0.025] px-3 text-[10px] font-semibold text-slate-300 hover:border-white/15">
                <span>{programmingLanguage === "python" ? "Python 3" : "C++20"}</span><span className={`text-[9px] text-slate-600 transition-transform ${languageMenuOpen ? "rotate-180" : ""}`}>⌄</span>
              </button>
              {languageMenuOpen ? (
                <div role="menu" aria-label={zh ? "選擇程式語言" : "Choose programming language"} className="absolute left-0 top-[calc(100%+0.45rem)] z-50 min-w-36 overflow-hidden rounded-xl border border-white/10 bg-[#111824] p-1.5 shadow-2xl shadow-black/50">
                  {(["cpp", "python"] as const).map((item) => <button key={item} type="button" role="menuitemradio" aria-checked={programmingLanguage === item} onClick={() => chooseProgrammingLanguage(item)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${programmingLanguage === item ? "bg-cyan-300/10 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}><span>{item === "cpp" ? "C++20" : "Python 3"}</span>{programmingLanguage === item ? <span>✓</span> : null}</button>)}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCodeByLanguage((current) => ({ ...current, [programmingLanguage]: problem.starterCode[programmingLanguage] }))} className="h-8 rounded-lg border border-white/8 px-3 text-[10px] text-slate-400 hover:border-white/15 hover:text-white">{zh ? "還原程式碼" : "Reset code"}</button>
              <button type="button" onClick={() => void run()} disabled={isRunning} className="h-8 rounded-lg bg-cyan-400 px-4 text-[10px] font-bold text-slate-950 hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60">▶ Run</button>
              <button type="button" onClick={() => setJudgeView("unavailable")} className="h-8 rounded-lg bg-violet-400 px-4 text-[10px] font-bold text-slate-950 hover:bg-violet-300">Submit</button>
            </div>
          </div>
          <div className="min-h-[390px] flex-1 overflow-hidden xl:min-h-0">
            <MonacoEditor language={programmingLanguage === "python" ? "python" : "cpp"} theme="vs-dark" value={code} onChange={(value) => setCodeByLanguage((current) => ({ ...current, [programmingLanguage]: value ?? "" }))} options={{ automaticLayout: true, fontFamily: "JetBrains Mono, Fira Code, Consolas, monospace", fontSize: 14, minimap: { enabled: false }, padding: { top: 18 }, scrollBeyondLastLine: false, tabSize: 4, wordWrap: "off" }} />
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
        <JudgePanel view={judgeView} problem={problem} textKey={textKey} zh={zh} />
      </div>

      {aiOpen ? (
        <div className="fixed bottom-5 right-5 z-50 h-[min(600px,calc(100dvh-8.75rem))] w-[min(380px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-violet-300/20 bg-[#0b1018] shadow-2xl shadow-black/60">
          <AiTutorPanel code={code} errorOutput={aiErrorOutput} onClose={() => setAiOpen(false)} programmingLanguage={programmingLanguage} />
        </div>
      ) : (
        <button type="button" onClick={() => setAiOpen(true)} aria-label={zh ? "開啟 AI Tutor" : "Open AI Tutor"} className="fixed bottom-6 right-6 z-40 grid size-14 place-items-center rounded-full border border-violet-300/25 bg-violet-400 text-sm font-black text-slate-950 shadow-lg shadow-violet-950/40 transition-transform hover:scale-105">AI</button>
      )}
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
      <div className="mt-4 flex flex-wrap gap-2">{problem.tags.map((tag) => <span key={tag} className="rounded-full border border-cyan-300/10 bg-cyan-300/[0.04] px-2.5 py-1 text-[10px] text-cyan-200/75">#{tagLabels[tag][textKey]}</span>)}</div>
      <StatementSection title={zh ? "題目描述" : "Description"}>{problem.description.map((paragraph) => <p key={paragraph[textKey]}>{paragraph[textKey]}</p>)}</StatementSection>
      <StatementSection title={zh ? "輸入格式" : "Input"}><p>{problem.inputFormat[textKey]}</p></StatementSection>
      <StatementSection title={zh ? "輸出格式" : "Output"}><p>{problem.outputFormat[textKey]}</p></StatementSection>
      <StatementSection title={zh ? "範例" : "Examples"}>
        {problem.samples.map((sample, index) => <div key={`${sample.input}-${index}`} className="mt-3 overflow-hidden rounded-xl border border-white/8 bg-[#070b11]"><SampleBlock label={`${zh ? "範例輸入" : "Sample Input"} ${index + 1}`} value={sample.input} /><SampleBlock label={`${zh ? "範例輸出" : "Sample Output"} ${index + 1}`} value={sample.output} bordered />{sample.explanation ? <p className="border-t border-white/8 px-4 py-3 text-[11px] text-slate-500">{sample.explanation[textKey]}</p> : null}</div>)}
      </StatementSection>
      <StatementSection title={zh ? "限制" : "Constraints"}><ul className="space-y-1 font-mono text-[11px]">{problem.constraints.map((constraint) => <li key={constraint[textKey]}>• {constraint[textKey]}</li>)}</ul><div className="mt-4 grid grid-cols-2 gap-2"><LimitCard label="Time Limit" value={`${problem.timeLimitMs / 1000} sec`} /><LimitCard label="Memory Limit" value={`${problem.memoryLimitMb} MB`} /></div></StatementSection>
      <StatementSection title={zh ? "測資與計分" : "Tests and scoring"}>
        <div className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2"><span>{zh ? "正式測資總數" : "Total judge cases"}</span><strong className="font-mono text-cyan-200">{totalCases}</strong></div>
        <div className="space-y-2">{problem.testGroups.map((group, index) => <div key={group.name[textKey]} className="rounded-lg border border-white/8 bg-white/[0.015] px-3 py-3"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold text-slate-300">{zh ? `子任務 ${index + 1}` : `Subtask ${index + 1}`}</span><strong className="font-mono text-[11px] text-cyan-200">{group.scorePercent}%</strong></div><p className="mt-2 text-[11px] leading-5 text-slate-300">{group.condition[textKey]}</p><p className="mt-1 font-mono text-[9px] text-slate-600">{group.testCaseCount} {zh ? "筆測資" : "judge cases"}</p></div>)}</div>
      </StatementSection>
    </article>
  );
}

function StatementSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-8"><h2 className="text-xs font-semibold text-white">{title}</h2><div className="mt-3 space-y-3 text-xs leading-6 text-slate-400">{children}</div></section>; }
function SampleBlock({ label, value, bordered = false }: { label: string; value: string; bordered?: boolean }) { return <div className={bordered ? "border-t border-white/8" : ""}><div className="px-4 py-2 text-[9px] font-semibold uppercase tracking-wider text-slate-600">{label}</div><pre className="overflow-x-auto px-4 pb-3 font-mono text-xs text-slate-300">{value}</pre></div>; }
function LimitCard({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/8 bg-white/[0.025] p-3"><span className="block text-[9px] uppercase tracking-wider text-slate-600">{label}</span><strong className="mt-1 block font-mono text-[11px] text-slate-300">{value}</strong></div>; }

function JudgePanel({ view, problem, textKey, zh }: { view: JudgeView; problem: Problem; textKey: "zh" | "en"; zh: boolean }) {
  const totalCases = problem.testGroups.reduce((sum, group) => sum + group.testCaseCount, 0);
  return (
    <aside className="min-h-[420px] min-w-0 overflow-y-auto bg-[#0a0f17] p-5 xl:min-h-0" aria-label={zh ? "正式評分結果" : "Judge result"}>
      <div className="flex items-center justify-between"><h2 className="text-xs font-semibold text-white">Judge Result</h2></div>
      <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
        <div className={`flex items-center gap-2 text-xs font-semibold ${view === "ready" ? "text-slate-300" : "text-violet-300"}`}><span>{view === "ready" ? "○" : "◇"}</span><span>{view === "ready" ? (zh ? "等待送出" : "Ready to submit") : (zh ? "Submit 版面已準備" : "Submit UI is ready")}</span></div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">{view === "ready" ? (zh ? "按下 Submit 後，正式 Judge 狀態才會顯示在這裡。Run 不會改變此區域。" : "This panel changes only after Submit. Run results stay below the editor.") : (zh ? "正式 Judge、隱藏測資與 Submission 紀錄將在下一階段串接，目前不會產生假分數。" : "The Judge, hidden tests, and submission records will be connected next. No placeholder score is generated.")}</p>
      </div>
      <div className="mt-5 rounded-xl border border-white/8 p-4"><div className="flex items-center justify-between"><span className="text-[10px] text-slate-500">{zh ? "正式測資" : "Judge cases"}</span><strong className="font-mono text-xs text-white">{totalCases}</strong></div><div className="mt-3 space-y-3">{problem.testGroups.map((group) => <div key={group.name[textKey]} className="border-t border-white/6 pt-3 first:border-0 first:pt-0"><div className="flex items-center justify-between gap-2 text-[10px]"><span className="font-medium text-slate-300">{group.scorePercent}%</span><span className="font-mono text-slate-600">{group.testCaseCount} {zh ? "筆" : "cases"}</span></div><p className="mt-1 text-[10px] leading-4 text-slate-500">{group.condition[textKey]}</p></div>)}</div><div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3 text-[10px]"><span className="font-semibold text-slate-300">{zh ? "總分" : "Total"}</span><strong className="font-mono text-white">100%</strong></div></div>
      <div className="mt-7 border-t border-white/8 pt-5"><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">Judge status</p><div className="mt-3 grid gap-2 text-[10px] text-slate-600"><span>✓ Accepted</span><span>✕ Wrong Answer</span><span>⚠ Compilation Error</span><span>⏱ Time Limit Exceeded</span></div></div>
    </aside>
  );
}
