import type { components } from "@/lib/api-schema";
import type { ProgrammingLanguage } from "@/lib/file-items";
import { bearerHeader, getAccessToken } from "@/lib/api-client";
import { getApiUrl, type SourceFile } from "@/lib/compiler-api";

// Derived from the backend models; run `npm run gen:api` after changing them.
export type JudgeResult = Required<components["schemas"]["SubmitResponse"]>;
export type JudgeStatus = JudgeResult["status"];
export type JudgeGroupResult = components["schemas"]["JudgeGroupResult"];

export class JudgeApiError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

export async function submitProblem(problemId: string, files: SourceFile[], language: ProgrammingLanguage): Promise<JudgeResult> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new JudgeApiError("Authentication is required.", 401);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${getApiUrl()}/api/problems/${encodeURIComponent(problemId)}/submit`, {
      method: "POST",
      headers: {
        ...bearerHeader(accessToken),
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
