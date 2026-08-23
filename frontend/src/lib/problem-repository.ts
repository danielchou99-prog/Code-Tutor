import {
  type LocalizedText,
  type Problem,
  type ProblemDifficulty,
  type ProblemSample,
  type ProblemStatus,
  problems as fallbackProblems,
  registerProblemTagLabels,
} from "@/components/problems/problem-data";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type ProblemRow = {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  description: LocalizedText[];
  input_format: LocalizedText;
  output_format: LocalizedText;
  constraints_text: LocalizedText[];
  starter_code: Record<"cpp" | "python", string>;
  difficulty: ProblemDifficulty;
  time_limit_ms: number;
  memory_limit_mb: number;
};

type TagRow = { slug: string; label_zh: string; label_en: string };
type TagLinkRow = { problem_id: string; tag_slug: string };
type SampleRow = ProblemSample & { problem_id: string; sample_order: number };
type GroupRow = {
  problem_id: string;
  group_order: number;
  name: LocalizedText;
  condition: LocalizedText;
  test_case_count: number;
  score_percent: number;
};
type SubmissionRow = { problem_id: string; status: string; score: number };

export type ProblemLoadResult = {
  problems: Problem[];
  source: "supabase" | "fallback";
};

function statusByProblem(submissions: SubmissionRow[]): Map<string, ProblemStatus> {
  const statuses = new Map<string, ProblemStatus>();
  for (const submission of submissions) {
    const nextStatus: ProblemStatus = submission.status === "accepted" || submission.score === 100 ? "solved" : "attempted";
    if (statuses.get(submission.problem_id) !== "solved") statuses.set(submission.problem_id, nextStatus);
  }
  return statuses;
}

export async function loadProblems(): Promise<ProblemLoadResult> {
  if (!isSupabaseConfigured()) return { problems: fallbackProblems, source: "fallback" };

  try {
    const supabase = getSupabaseBrowserClient();
    const [problemResult, tagResult, linkResult, sampleResult, groupResult, userResult] = await Promise.all([
      supabase.from("problems").select("id,title,summary,description,input_format,output_format,constraints_text,starter_code,difficulty,time_limit_ms,memory_limit_mb").eq("published", true).order("id"),
      supabase.from("problem_tags").select("slug,label_zh,label_en"),
      supabase.from("problem_tag_links").select("problem_id,tag_slug"),
      supabase.from("problem_samples").select("problem_id,sample_order,input,output,explanation").order("sample_order"),
      supabase.from("problem_test_groups").select("problem_id,group_order,name,condition,test_case_count,score_percent").order("group_order"),
      supabase.auth.getUser(),
    ]);
    const firstError = [problemResult.error, tagResult.error, linkResult.error, sampleResult.error, groupResult.error].find(Boolean);
    if (firstError || !problemResult.data?.length) throw firstError ?? new Error("No published problems were returned.");

    let submissions: SubmissionRow[] = [];
    if (userResult.data.user) {
      const submissionResult = await supabase.from("submissions").select("problem_id,status,score");
      if (!submissionResult.error) submissions = submissionResult.data as SubmissionRow[];
    }

    const tagRows = tagResult.data as TagRow[];
    registerProblemTagLabels(Object.fromEntries(tagRows.map((tag) => [tag.slug, { zh: tag.label_zh, en: tag.label_en }])));
    const links = linkResult.data as TagLinkRow[];
    const samples = sampleResult.data as SampleRow[];
    const groups = groupResult.data as GroupRow[];
    const statuses = statusByProblem(submissions);

    return {
      source: "supabase",
      problems: (problemResult.data as ProblemRow[]).map((problem) => ({
        id: problem.id,
        title: problem.title,
        summary: problem.summary,
        difficulty: problem.difficulty,
        status: statuses.get(problem.id) ?? "unsolved",
        tags: links.filter((link) => link.problem_id === problem.id).map((link) => link.tag_slug),
        description: problem.description,
        inputFormat: problem.input_format,
        outputFormat: problem.output_format,
        samples: samples.filter((sample) => sample.problem_id === problem.id).map((sample) => ({
          input: sample.input,
          output: sample.output,
          explanation: sample.explanation,
        })),
        constraints: problem.constraints_text,
        testGroups: groups.filter((group) => group.problem_id === problem.id).map((group) => ({
          name: group.name,
          condition: group.condition,
          testCaseCount: group.test_case_count,
          scorePercent: group.score_percent,
        })),
        timeLimitMs: problem.time_limit_ms,
        memoryLimitMb: problem.memory_limit_mb,
        starterCode: problem.starter_code,
      })),
    };
  } catch {
    return { problems: fallbackProblems, source: "fallback" };
  }
}
