"use client";

import type { Problem } from "@/components/problems/problem-data";
import type { JudgeResult } from "@/lib/judge-api";
import { judgeStatusLabel } from "@/lib/judge-status";
import { useLanguage } from "@/lib/language-context";

export function JudgeResultPanel({ error, isSubmitting, result, problem, textKey }: { error: string; isSubmitting: boolean; result: JudgeResult | null; problem: Problem; textKey: "zh" | "en"; }) {
  const { t } = useLanguage();
  const totalCases = problem.testGroups.reduce((sum, group) => sum + group.testCaseCount, 0);
  const statusLabel = result ? judgeStatusLabel(result.status, t) : "";
  return (
    <aside className="min-h-[420px] min-w-0 overflow-y-auto bg-[#0a0f17] p-5 xl:min-h-0" aria-label={t("judgeResult")}>
      <div className="flex items-center justify-between"><h2 className="text-xs font-semibold text-white">Judge Result</h2></div>
      <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
        <div className={`flex items-center gap-2 text-xs font-semibold ${error ? "text-rose-300" : result?.status === "accepted" ? "text-emerald-300" : result ? "text-amber-200" : isSubmitting ? "text-violet-300" : "text-slate-300"}`}><span>{error ? "!" : result?.status === "accepted" ? "✓" : result ? "◇" : isSubmitting ? "…" : "○"}</span><span>{error || statusLabel || (isSubmitting ? (t("runningHiddenTests")) : (t("readyToSubmit")))}</span></div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">{result ? (t("passedCasesScoreExecutionMs", { passed: result.passed_cases, total: result.total_cases, score: result.score, ms: result.duration_ms })) : isSubmitting ? (t("pleaseWaitWhileTheJudge")) : (t("thisPanelChangesOnlyAfter"))}</p>
      </div>
      <div className="mt-5 rounded-xl border border-white/8 p-4"><div className="flex items-center justify-between"><span className="text-[10px] text-slate-500">{t("judgeCases")}</span><strong className="font-mono text-xs text-white">{result?.total_cases ?? totalCases}</strong></div><div className="mt-3 space-y-3">{problem.testGroups.map((group, index) => { const judgedGroup = result?.groups.find((item) => item.group_order === index + 1); return <div key={group.name[textKey]} className="border-t border-white/6 pt-3 first:border-0 first:pt-0"><div className="flex items-center justify-between gap-2 text-[10px]"><span className="font-medium text-slate-300">{judgedGroup ? `${judgedGroup.earned_score} / ${judgedGroup.score_percent}` : `${group.scorePercent}%`}</span><span className={`font-mono ${judgedGroup?.status === "passed" ? "text-emerald-300" : judgedGroup?.status === "failed" ? "text-rose-300" : "text-slate-600"}`}>{judgedGroup ? `${judgedGroup.passed_cases} / ${judgedGroup.total_cases}` : `${group.testCaseCount} ${t("cases")}`}</span></div><p className="mt-1 text-[10px] leading-4 text-slate-500">{group.condition[textKey]}</p></div>; })}</div><div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3 text-[10px]"><span className="font-semibold text-slate-300">{t("total")}</span><strong className="font-mono text-white">{result ? `${result.score} / ${result.max_score ?? 100}` : "100%"}</strong></div></div>
      <div className="mt-7 border-t border-white/8 pt-5"><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">Judge status</p><div className="mt-3 grid gap-2 text-[10px] text-slate-600"><span>✓ Accepted</span><span>✕ Wrong Answer</span><span>⚠ Compilation Error</span><span>⏱ Time Limit Exceeded</span></div></div>
    </aside>
  );
}
