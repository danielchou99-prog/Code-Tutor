"use client";

import type { Problem } from "@/components/problems/problem-data";
import type { JudgeResult } from "@/lib/judge-api";
import { judgeStatusLabel } from "@/lib/judge-status";

export function JudgeResultPanel({ error, isSubmitting, result, problem, textKey, zh }: { error: string; isSubmitting: boolean; result: JudgeResult | null; problem: Problem; textKey: "zh" | "en"; zh: boolean }) {
  const totalCases = problem.testGroups.reduce((sum, group) => sum + group.testCaseCount, 0);
  const statusLabel = result ? judgeStatusLabel(result.status, zh) : "";
  return (
    <aside className="min-h-[420px] min-w-0 overflow-y-auto bg-[#0a0f17] p-5 xl:min-h-0" aria-label={zh ? "正式評分結果" : "Judge result"}>
      <div className="flex items-center justify-between"><h2 className="text-xs font-semibold text-white">Judge Result</h2></div>
      <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
        <div className={`flex items-center gap-2 text-xs font-semibold ${error ? "text-rose-300" : result?.status === "accepted" ? "text-emerald-300" : result ? "text-amber-200" : isSubmitting ? "text-violet-300" : "text-slate-300"}`}><span>{error ? "!" : result?.status === "accepted" ? "✓" : result ? "◇" : isSubmitting ? "…" : "○"}</span><span>{error || statusLabel || (isSubmitting ? (zh ? "正在執行隱藏測資…" : "Running hidden tests…") : (zh ? "等待送出" : "Ready to submit"))}</span></div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">{result ? (zh ? `通過 ${result.passed_cases} / ${result.total_cases} 筆測資，總分 ${result.score} 分，執行 ${result.duration_ms} ms。` : `Passed ${result.passed_cases} / ${result.total_cases} cases. Score: ${result.score}. Execution: ${result.duration_ms} ms.`) : isSubmitting ? (zh ? "請稍候，Judge 會逐筆執行測資並計算群組分數。" : "Please wait while the Judge runs each case and calculates group scores.") : (zh ? "按下 Submit 後，正式 Judge 狀態才會顯示在這裡。Run 不會改變此區域。" : "This panel changes only after Submit. Run results stay below the editor.")}</p>
      </div>
      <div className="mt-5 rounded-xl border border-white/8 p-4"><div className="flex items-center justify-between"><span className="text-[10px] text-slate-500">{zh ? "正式測資" : "Judge cases"}</span><strong className="font-mono text-xs text-white">{result?.total_cases ?? totalCases}</strong></div><div className="mt-3 space-y-3">{problem.testGroups.map((group, index) => { const judgedGroup = result?.groups.find((item) => item.group_order === index + 1); return <div key={group.name[textKey]} className="border-t border-white/6 pt-3 first:border-0 first:pt-0"><div className="flex items-center justify-between gap-2 text-[10px]"><span className="font-medium text-slate-300">{judgedGroup ? `${judgedGroup.earned_score} / ${judgedGroup.score_percent}` : `${group.scorePercent}%`}</span><span className={`font-mono ${judgedGroup?.status === "passed" ? "text-emerald-300" : judgedGroup?.status === "failed" ? "text-rose-300" : "text-slate-600"}`}>{judgedGroup ? `${judgedGroup.passed_cases} / ${judgedGroup.total_cases}` : `${group.testCaseCount} ${zh ? "筆" : "cases"}`}</span></div><p className="mt-1 text-[10px] leading-4 text-slate-500">{group.condition[textKey]}</p></div>; })}</div><div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3 text-[10px]"><span className="font-semibold text-slate-300">{zh ? "總分" : "Total"}</span><strong className="font-mono text-white">{result ? `${result.score} / ${result.max_score ?? 100}` : "100%"}</strong></div></div>
      <div className="mt-7 border-t border-white/8 pt-5"><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">Judge status</p><div className="mt-3 grid gap-2 text-[10px] text-slate-600"><span>✓ Accepted</span><span>✕ Wrong Answer</span><span>⚠ Compilation Error</span><span>⏱ Time Limit Exceeded</span></div></div>
    </aside>
  );
}
