import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Language } from "@/lib/language-context";
import type { ProgrammingLanguage } from "@/lib/file-items";

export type AiTutorAction = "analyze" | "explain_error" | "hint" | "ask";

export type AiTutorRequest = {
  action: AiTutorAction;
  code: string;
  errorOutput: string;
  question: string;
  language: Language;
  programmingLanguage: ProgrammingLanguage;
};

function getApiUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

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
