import type { ProgrammingLanguage } from "@/lib/file-items";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getApiUrl, type SourceFile } from "@/lib/compiler-api";

export type JudgeStatus = "accepted" | "wrong_answer" | "compile_error" | "runtime_error" | "timeout" | "service_unavailable" | "server_busy";

export type JudgeGroupResult = {
  group_order: number;
  score_percent: number;
  earned_score: number;
  passed_cases: number;
  total_cases: number;
  status: "passed" | "failed" | "not_run";
};

export type JudgeResult = {
  submission_id: string | null;
  problem_id: string;
  status: JudgeStatus;
  score: number;
  passed_cases: number;
  total_cases: number;
  duration_ms: number;
  groups: JudgeGroupResult[];
  message: string;
};

export class JudgeApiError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

export async function submitProblem(problemId: string, files: SourceFile[], language: ProgrammingLanguage): Promise<JudgeResult> {
  const sessionResult = await getSupabaseBrowserClient().auth.getSession();
  const accessToken = sessionResult.data.session?.access_token;
  if (!accessToken) throw new JudgeApiError("Authentication is required.", 401);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${getApiUrl()}/api/problems/${encodeURIComponent(problemId)}/submit`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: files.find((file) => file.name.toLocaleLowerCase() === (language === "python" ? "main.py" : "main.cpp"))?.content ?? "",
        files,
        language,
      }),
      signal: controller.signal,
    });
    const body = await response.json() as JudgeResult | { detail?: string };
    if (!response.ok) {
      throw new JudgeApiError("detail" in body && body.detail ? body.detail : `Judge API returned HTTP ${response.status}.`, response.status);
    }
    return body as JudgeResult;
  } finally {
    window.clearTimeout(timeout);
  }
}
