"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { AiTutorPanel } from "@/components/workspace/ai-tutor-panel";
import { runCode, type RunResult } from "@/lib/compiler-api";
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

type ResultView =
  | { kind: "ready" }
  | { kind: "running" }
  | { kind: "run"; result: RunResult }
  | { kind: "judge-unavailable" };

type ResizeTarget = "problem" | "result" | null;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function ProblemSolverPage({ problem, onBack }: { problem: Problem; onBack: () => void }) {
  const { language } = useLanguage();
  const zh = language === "zh-Hant";
  const textKey = zh ? "zh" : "en";
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [code, setCode] = useState(problem.starterCode);
  const [stdin, setStdin] = useState(problem.samples[0]?.input ?? "");
  const [resultView, setResultView] = useState<ResultView>({ kind: "ready" });
  const [problemWidth, setProblemWidth] = useState(35);
  const [resultWidth, setResultWidth] = useState(22);
  const [resizing, setResizing] = useState<ResizeTarget>(null);
  const [aiOpen, setAiOpen] = useState(false);

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

  const run = async () => {
    if (resultView.kind === "running") return;
    setResultView({ kind: "running" });
    try {
      const result = await runCode([{ name: "main.cpp", content: code }], stdin, "cpp");
      setResultView({ kind: "run", result });
    } catch {
      setResultView({
        kind: "run",
        result: {
          status: "service_unavailable",
          stdout: "",
          stderr: zh
            ? "無法連線到編譯器 API，請確認 FastAPI 後端已在 8000 埠啟動。"
            : "Unable to reach the compiler API. Make sure FastAPI is running on port 8000.",
          exit_code: null,
          duration_ms: 0,
          truncated: false,
        },
      });
    }
  };

  const errorOutput = resultView.kind === "run" ? resultView.result.stderr : "";
  const editorWidth = 100 - problemWidth - resultWidth;

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#090d14]">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/8 bg-[#0b1018] px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onBack} className="rounded-lg border border-white/8 px-3 py-1.5 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-white">
            ← {zh ? "返回題目列表" : "Back to problems"}
          </button>
          <span className="hidden h-4 w-px bg-white/10 sm:block" />
          <p className="truncate text-xs font-semibold text-slate-200">
            <span className="mr-2 font-mono text-slate-500">#{problem.id}</span>
            {problem.title[textKey]}
          </p>
        </div>
        <div className="hidden items-center gap-2 text-[10px] text-slate-500 xl:flex">
          <span>{zh ? "拖曳分隔線可調整版面" : "Drag dividers to resize"}</span>
          <button type="button" onClick={() => { setProblemWidth(35); setResultWidth(22); }} className="rounded-md px-2 py-1 text-cyan-300/70 hover:bg-cyan-300/5 hover:text-cyan-200">
            {zh ? "重設" : "Reset"}
          </button>
        </div>
      </div>

      <div
        ref={workspaceRef}
        className="min-h-0 flex-1 overflow-y-auto xl:grid xl:overflow-hidden"
        style={{ gridTemplateColumns: `minmax(0, ${problemWidth}fr) 6px minmax(0, ${editorWidth}fr) 6px minmax(0, ${resultWidth}fr)` }}
      >
        <ProblemStatement problem={problem} textKey={textKey} zh={zh} />
        <ResizeHandle label={zh ? "調整題目與編輯器寬度" : "Resize problem and editor"} active={resizing === "problem"} onPointerDown={() => setResizing("problem")} />

        <section className="flex min-h-[650px] min-w-0 flex-col border-y border-white/8 bg-[#0c111b] xl:min-h-0 xl:border-y-0" aria-label={zh ? "程式碼編輯器" : "Code editor"}>
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/8 px-4">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-semibold text-slate-200">main.cpp</span>
              <span className="rounded-md bg-cyan-300/[0.06] px-2 py-1 text-[9px] font-semibold text-cyan-200">C++20</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCode(problem.starterCode)} className="h-8 rounded-lg border border-white/8 px-3 text-[10px] text-slate-400 hover:border-white/15 hover:text-white">
                {zh ? "還原程式碼" : "Reset code"}
              </button>
              <button type="button" onClick={() => void run()} disabled={resultView.kind === "running"} className="h-8 rounded-lg bg-cyan-400 px-4 text-[10px] font-bold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60">
                ▶ Run
              </button>
              <button type="button" onClick={() => setResultView({ kind: "judge-unavailable" })} className="h-8 rounded-lg bg-violet-400 px-4 text-[10px] font-bold text-slate-950 transition-colors hover:bg-violet-300">
                Submit
              </button>
            </div>
          </div>
          <div className="min-h-[400px] flex-1">
            <MonacoEditor
              language="cpp"
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value ?? "")}
              options={{
                automaticLayout: true,
                fontFamily: "JetBrains Mono, Fira Code, Consolas, monospace",
                fontSize: 14,
                minimap: { enabled: false },
                padding: { top: 18 },
                scrollBeyondLastLine: false,
                tabSize: 4,
                wordWrap: "off",
              }}
            />
          </div>
          <div className="h-40 shrink-0 border-t border-white/8 bg-[#0a0f17]">
            <div className="flex h-9 items-center justify-between border-b border-white/8 px-4">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Input</span>
              <button type="button" onClick={() => setStdin(problem.samples[0]?.input ?? "")} className="text-[10px] text-slate-600 hover:text-cyan-300">
                {zh ? "載入範例" : "Load sample"}
              </button>
            </div>
            <textarea value={stdin} onChange={(event) => setStdin(event.target.value)} spellCheck={false} aria-label="Input" className="h-[calc(100%-2.25rem)] w-full resize-none bg-transparent px-4 py-3 font-mono text-xs leading-5 text-slate-300 outline-none placeholder:text-slate-700" placeholder={zh ? "輸入自訂測試資料…" : "Enter custom test data…"} />
          </div>
        </section>

        <ResizeHandle label={zh ? "調整編輯器與結果寬度" : "Resize editor and result"} active={resizing === "result"} onPointerDown={() => setResizing("result")} />
        <ResultPanel view={resultView} zh={zh} onRun={() => void run()} />
      </div>

      {aiOpen ? (
        <div className="fixed bottom-5 right-5 z-50 h-[min(600px,calc(100dvh-7rem))] w-[min(380px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-violet-300/20 bg-[#0b1018] shadow-2xl shadow-black/60">
          <button type="button" onClick={() => setAiOpen(false)} aria-label={zh ? "關閉 AI Tutor" : "Close AI Tutor"} className="absolute right-3 top-2.5 z-10 grid size-7 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-white">×</button>
          <AiTutorPanel code={code} errorOutput={errorOutput} programmingLanguage="cpp" />
        </div>
      ) : (
        <button type="button" onClick={() => setAiOpen(true)} aria-label={zh ? "開啟 AI Tutor" : "Open AI Tutor"} className="fixed bottom-6 right-6 z-40 grid size-14 place-items-center rounded-full border border-violet-300/25 bg-violet-400 text-sm font-black text-slate-950 shadow-lg shadow-violet-950/40 transition-transform hover:scale-105">
          AI
        </button>
      )}
    </section>
  );
}

function ResizeHandle({ label, active, onPointerDown }: { label: string; active: boolean; onPointerDown: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => { event.preventDefault(); onPointerDown(); }}
      className={`group relative hidden cursor-col-resize touch-none bg-white/[0.035] outline-none xl:block ${active ? "bg-cyan-300/20" : "hover:bg-cyan-300/10"}`}
    >
      <span className="absolute left-1/2 top-1/2 h-10 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-700 group-hover:bg-cyan-300/60" />
    </button>
  );
}

function ProblemStatement({ problem, textKey, zh }: { problem: Problem; textKey: "zh" | "en"; zh: boolean }) {
  const difficulty = {
    easy: zh ? "簡單" : "Easy",
    medium: zh ? "中等" : "Medium",
    hard: zh ? "困難" : "Hard",
  }[problem.difficulty];

  return (
    <article className="min-h-[520px] min-w-0 overflow-y-auto bg-[#0a0f17] p-5 sm:p-6 xl:min-h-0" aria-label={zh ? "題目內容" : "Problem statement"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300/65">Problem #{problem.id}</p>
          <h1 className="mt-2 text-xl font-semibold text-white">{problem.title[textKey]}</h1>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${problem.difficulty === "easy" ? "bg-emerald-400/10 text-emerald-300" : problem.difficulty === "medium" ? "bg-amber-300/10 text-amber-200" : "bg-rose-400/10 text-rose-300"}`}>
          {difficulty}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {problem.tags.map((tag) => <span key={tag} className="rounded-full border border-cyan-300/10 bg-cyan-300/[0.04] px-2.5 py-1 text-[10px] text-cyan-200/75">#{tagLabels[tag][textKey]}</span>)}
      </div>

      <StatementSection title={zh ? "題目描述" : "Description"}>
        {problem.description.map((paragraph) => <p key={paragraph[textKey]}>{paragraph[textKey]}</p>)}
      </StatementSection>
      <StatementSection title={zh ? "輸入格式" : "Input"}><p>{problem.inputFormat[textKey]}</p></StatementSection>
      <StatementSection title={zh ? "輸出格式" : "Output"}><p>{problem.outputFormat[textKey]}</p></StatementSection>
      <StatementSection title={zh ? "範例" : "Examples"}>
        {problem.samples.map((sample, index) => (
          <div key={`${sample.input}-${index}`} className="mt-3 overflow-hidden rounded-xl border border-white/8 bg-[#070b11]">
            <SampleBlock label={`${zh ? "範例輸入" : "Sample Input"} ${index + 1}`} value={sample.input} />
            <SampleBlock label={zh ? "範例輸出" : "Sample Output"} value={sample.output} bordered />
            {sample.explanation ? <p className="border-t border-white/8 px-4 py-3 text-[11px] text-slate-500">{sample.explanation[textKey]}</p> : null}
          </div>
        ))}
      </StatementSection>
      <StatementSection title={zh ? "限制" : "Constraints"}>
        <ul className="space-y-1 font-mono text-[11px]">
          {problem.constraints.map((constraint) => <li key={constraint[textKey]}>• {constraint[textKey]}</li>)}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <LimitCard label="Time Limit" value={`${problem.timeLimitMs / 1000} sec`} />
          <LimitCard label="Memory Limit" value={`${problem.memoryLimitMb} MB`} />
        </div>
      </StatementSection>
    </article>
  );
}

function StatementSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-8"><h2 className="text-xs font-semibold text-white">{title}</h2><div className="mt-3 space-y-3 text-xs leading-6 text-slate-400">{children}</div></section>;
}

function SampleBlock({ label, value, bordered = false }: { label: string; value: string; bordered?: boolean }) {
  return <div className={bordered ? "border-t border-white/8" : ""}><div className="flex items-center justify-between px-4 py-2 text-[9px] font-semibold uppercase tracking-wider text-slate-600"><span>{label}</span></div><pre className="overflow-x-auto px-4 pb-3 font-mono text-xs text-slate-300">{value}</pre></div>;
}

function LimitCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/8 bg-white/[0.025] p-3"><span className="block text-[9px] uppercase tracking-wider text-slate-600">{label}</span><strong className="mt-1 block font-mono text-[11px] text-slate-300">{value}</strong></div>;
}

function ResultPanel({ view, zh, onRun }: { view: ResultView; zh: boolean; onRun: () => void }) {
  let icon = "○";
  let title = zh ? "準備完成" : "Ready";
  let detail = zh ? "執行程式或送出解答後，結果會顯示在這裡。" : "Run your code or submit your solution to see the result.";
  let tone = "text-slate-300";
  let output = "";
  let duration: number | null = null;

  if (view.kind === "running") {
    icon = "…";
    title = zh ? "正在編譯與執行" : "Compiling and running";
    detail = zh ? "正在使用自訂輸入測試程式。" : "Testing your program with custom input.";
    tone = "text-cyan-300";
  } else if (view.kind === "judge-unavailable") {
    icon = "◇";
    title = zh ? "Submit 版面已準備" : "Submit UI is ready";
    detail = zh ? "正式 Judge、隱藏測資與作答紀錄會在下一階段串接；目前不會產生假分數。" : "The Judge, hidden tests, and submission history will be connected next. No placeholder score is generated.";
    tone = "text-violet-300";
  } else if (view.kind === "run") {
    const successful = view.result.status === "accepted";
    icon = successful ? "✓" : view.result.status === "timeout" ? "⏱" : "!";
    title = successful ? (zh ? "執行完成" : "Run completed") : statusLabel(view.result.status, zh);
    detail = successful ? (zh ? "這只是自訂測試結果，不代表正式 Accepted。" : "This is a custom run, not an official Accepted result.") : (zh ? "請查看下方訊息並修改程式。" : "Review the message below and update your code.");
    tone = successful ? "text-emerald-300" : "text-rose-300";
    output = view.result.stderr || view.result.stdout || (zh ? "程式沒有輸出。" : "The program produced no output.");
    duration = view.result.duration_ms;
  }

  return (
    <aside className="min-h-[420px] min-w-0 overflow-y-auto bg-[#0a0f17] p-5 xl:min-h-0" aria-label={zh ? "執行與評分結果" : "Run and judge result"}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-white">Result</h2>
        <span className="rounded-full border border-white/8 px-2 py-0.5 text-[9px] uppercase tracking-wider text-slate-600">Run / Judge</span>
      </div>
      <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
        <div className={`flex items-center gap-2 text-xs font-semibold ${tone}`}><span aria-hidden="true">{icon}</span><span>{title}</span></div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">{detail}</p>
        {duration !== null ? <div className="mt-4 border-t border-white/8 pt-3"><span className="text-[9px] uppercase tracking-wider text-slate-600">Time</span><strong className="ml-3 font-mono text-[11px] text-slate-300">{duration} ms</strong></div> : null}
      </div>
      {output ? <div className="mt-4"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">Console</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/8 bg-[#070b11] p-3 font-mono text-[11px] leading-5 text-slate-300">{output}</pre></div> : null}
      {view.kind === "ready" ? <button type="button" onClick={onRun} className="mt-5 w-full rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] py-2.5 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-300/[0.08]">▶ Run</button> : null}
      <div className="mt-7 border-t border-white/8 pt-5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">Judge status</p>
        <div className="mt-3 grid gap-2 text-[10px] text-slate-600">
          <span>✓ Accepted</span><span>✕ Wrong Answer</span><span>⚠ Compilation Error</span><span>⏱ Time Limit Exceeded</span>
        </div>
      </div>
    </aside>
  );
}

function statusLabel(status: RunResult["status"], zh: boolean) {
  const labels: Record<RunResult["status"], [string, string]> = {
    accepted: ["執行完成", "Run completed"],
    compile_error: ["編譯錯誤", "Compilation Error"],
    runtime_error: ["執行錯誤", "Runtime Error"],
    timeout: ["執行時間超過限制", "Time Limit Exceeded"],
    service_unavailable: ["編譯器無法連線", "Compiler unavailable"],
    rate_limited: ["執行次數過多", "Rate limited"],
    server_busy: ["編譯器忙碌中", "Compiler busy"],
  };
  return labels[status][zh ? 0 : 1];
}
