"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { languageLabel, type ProgrammingLanguage } from "@/lib/file-items";
import { judgeStatusLabel } from "@/lib/judge-status";
import { useLanguage } from "@/lib/language-context";
import { listRecentSubmissions, loadSubmissionSource, type SubmissionSummary } from "@/lib/submission-history";

type HistoryState = { problemId: string; refreshKey: string; submissions: SubmissionSummary[] | null; failed: boolean };

export function SubmissionHistory({
  problemId,
  refreshKey,
  onLoad,
}: {
  problemId: string;
  /** Changes whenever a new submission has been saved, so the list reloads. */
  refreshKey: string;
  onLoad: (language: ProgrammingLanguage, code: string) => void;
}) {
  const { t } = useLanguage();
  const { configured, user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<HistoryState | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState(false);

  useEffect(() => {
    if (!configured || !userId) return;
    let cancelled = false;
    listRecentSubmissions(problemId)
      .then((submissions) => { if (!cancelled) setState({ problemId, refreshKey, submissions, failed: false }); })
      .catch(() => { if (!cancelled) setState({ problemId, refreshKey, submissions: null, failed: true }); });
    return () => { cancelled = true; };
  }, [configured, problemId, refreshKey, userId]);

  const open = async (submission: SubmissionSummary) => {
    if (openingId) return;
    setOpeningId(submission.id);
    setOpenError(false);
    try {
      const source = await loadSubmissionSource(submission.id);
      if (source === null) setOpenError(true);
      else onLoad(submission.language, source);
    } catch {
      setOpenError(true);
    } finally {
      setOpeningId(null);
    }
  };

  const loaded = state?.problemId === problemId && state.refreshKey === refreshKey ? state : null;
  return (
    <div className="mt-7 border-t border-white/8 pt-5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">{t("mySubmissions")}</p>
      {!configured || !userId ? (
        <p className="mt-3 text-[10px] leading-5 text-slate-600">{t("signInToSeeSubmissions")}</p>
      ) : !loaded ? (
        <p className="mt-3 text-[10px] text-slate-600">{t("loadingSubmissions")}</p>
      ) : loaded.failed ? (
        <p role="alert" className="mt-3 text-[10px] text-rose-300">{t("submissionsLoadFailed")}</p>
      ) : !loaded.submissions?.length ? (
        <p className="mt-3 text-[10px] text-slate-600">{t("noSubmissionsYet")}</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {loaded.submissions.map((submission) => (
            <li key={submission.id}>
              <button
                type="button"
                onClick={() => void open(submission)}
                disabled={openingId !== null}
                title={t("loadThisSubmission")}
                className="w-full rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-left transition-colors hover:border-cyan-300/25 disabled:cursor-wait disabled:opacity-60"
              >
                <span className="flex items-center justify-between gap-2 text-[10px]">
                  <span className={submission.status === "accepted" ? "font-semibold text-emerald-300" : "font-semibold text-amber-200"}>{judgeStatusLabel(submission.status, t)}</span>
                  <span className="font-mono text-slate-300">{submission.score}</span>
                </span>
                <span className="mt-1 flex items-center justify-between gap-2 text-[9px] text-slate-600">
                  <span>{new Date(submission.created_at).toLocaleString()}</span>
                  <span className="font-mono">{languageLabel(submission.language)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {openError ? <p role="alert" className="mt-2 text-[10px] text-rose-300">{t("submissionOpenFailed")}</p> : null}
    </div>
  );
}
