import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type AiConnectionStatus = {
  connected: boolean;
  provider: "groq";
  key_last_four: string | null;
  updated_at: string | null;
};

function getApiUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

async function authenticatedRequest(
  method: "GET" | "PUT" | "DELETE",
  apiKey?: string,
): Promise<AiConnectionStatus> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Authentication is required.");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${getApiUrl()}/api/ai/connection`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(apiKey ? { "Content-Type": "application/json" } : {}),
      },
      body: apiKey ? JSON.stringify({ api_key: apiKey }) : undefined,
      signal: controller.signal,
    });
    const result = (await response.json().catch(() => null)) as
      | AiConnectionStatus
      | { detail?: string }
      | null;
    if (!response.ok) {
      throw new Error(result && "detail" in result && result.detail
        ? result.detail
        : `AI connection API returned HTTP ${response.status}.`);
    }
    return result as AiConnectionStatus;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function getAiConnection() {
  return authenticatedRequest("GET");
}

export function connectAi(apiKey: string) {
  return authenticatedRequest("PUT", apiKey);
}

export function removeAiConnection() {
  return authenticatedRequest("DELETE");
}
