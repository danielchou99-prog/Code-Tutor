import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Language } from "@/lib/language-context";
import type { ProgrammingLanguage } from "@/lib/file-items";
import { getApiUrl } from "@/lib/api-url";

export type AiTutorAction = "analyze" | "explain_error" | "hint" | "common_errors" | "test_strategy" | "ask";

export type SanitizedJudgeSummary = {
  status: string;
  score: number;
  passed_cases: number;
  total_cases: number;
  duration_ms: number;
  peak_memory_kb: number;
  groups: Array<{ group_order: number; earned_score: number; passed_cases: number; total_cases: number; status: "passed" | "failed" | "not_run" }>;
};

export type AiTutorRequest = {
  action: AiTutorAction;
  code: string;
  errorOutput: string;
  question: string;
  language: Language;
  programmingLanguage: ProgrammingLanguage;
  judgeSummary?: SanitizedJudgeSummary | null;
};

export async function streamAiTutor(
  request: AiTutorRequest,
  onChunk: (chunk: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Sign in before using AI Tutor.");

  const response = await fetch(`${getApiUrl()}/api/ai/tutor`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: request.action,
      code: request.code,
      error_output: request.errorOutput,
      question: request.question,
      language: request.language,
      programming_language: request.programmingLanguage,
      judge_summary: request.judgeSummary ?? null,
    }),
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(result?.detail || `AI Tutor API returned HTTP ${response.status}.`);
  }
  if (!response.body) throw new Error("AI Tutor returned an empty response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) onChunk(chunk);
  }
  const finalChunk = decoder.decode();
  if (finalChunk) onChunk(finalChunk);
}
