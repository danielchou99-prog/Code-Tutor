export type RunStatus =
  | "accepted"
  | "compile_error"
  | "runtime_error"
  | "timeout"
  | "service_unavailable";

export type RunResult = {
  status: RunStatus;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  duration_ms: number;
  truncated: boolean;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function runCpp(code: string, stdin: string): Promise<RunResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${apiUrl}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, stdin, language: "cpp" }),
      signal: controller.signal,
    });
    const result = (await response.json()) as RunResult;

    if (!response.ok && !result.status) {
      throw new Error(`Compiler API returned HTTP ${response.status}.`);
    }
    return result;
  } finally {
    window.clearTimeout(timeout);
  }
}
