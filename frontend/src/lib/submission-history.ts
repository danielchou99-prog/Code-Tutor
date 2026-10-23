import type { ProgrammingLanguage } from "@/lib/file-items";
import type { JudgeStatus } from "@/lib/judge-api";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SubmissionSummary = {
  id: string;
  created_at: string;
  language: ProgrammingLanguage;
  status: JudgeStatus;
  score: number;
};

const recentSubmissionLimit = 10;

/** Row-level security limits this to the signed-in user's own submissions. */
export async function listRecentSubmissions(problemId: string): Promise<SubmissionSummary[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("submissions")
    .select("id,created_at,language,status,score")
    .eq("problem_id", problemId)
    .order("created_at", { ascending: false })
    .limit(recentSubmissionLimit);
  if (error) throw error;
  return (data ?? []) as SubmissionSummary[];
}

/** The source is fetched only when a submission is opened, so the list stays light. */
export async function loadSubmissionSource(submissionId: string): Promise<string | null> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("submissions")
    .select("source_code")
    .eq("id", submissionId)
    .single();
  if (error) throw error;
  return typeof data?.source_code === "string" ? data.source_code : null;
}
