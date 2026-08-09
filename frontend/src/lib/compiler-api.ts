export type RunStatus =
  | "accepted"
  | "compile_error"
  | "runtime_error"
  | "timeout"
  | "service_unavailable"
  | "rate_limited"
  | "server_busy";

export type RunResult = {
  status: RunStatus;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  duration_ms: number;
  truncated: boolean;
  retry_after_seconds?: number;
};

export type CppSourceFile = {
  name: string;
  content: string;
};

function getApiUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export async function runCpp(files: CppSourceFile[], stdin: string): Promise<RunResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${getApiUrl()}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: files.find((file) => file.name.toLocaleLowerCase().endsWith(".cpp"))?.content ?? "",
        files,
        stdin,
        language: "cpp",
      }),
      signal: controller.signal,
    });
    const result = (await response.json()) as RunResult;
    const retryAfter = Number(response.headers.get("Retry-After"));

    if (!response.ok && !result.status) {
      throw new Error(`Compiler API returned HTTP ${response.status}.`);
    }
    return {
      ...result,
      retry_after_seconds:
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}
