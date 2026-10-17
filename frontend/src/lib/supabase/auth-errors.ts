import { isAuthRetryableFetchError } from "@supabase/supabase-js";

import type { TranslationKey } from "@/lib/language-context";

export type AuthErrorCode =
  | "network"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "user_exists"
  | "weak_password"
  | "same_password"
  | "unknown";

export function classifyAuthError(error: unknown): AuthErrorCode {
  if (isAuthRetryableFetchError(error)) return "network";

  const record = (error ?? {}) as { code?: unknown; message?: unknown; status?: unknown; name?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";

  if (
    error instanceof TypeError ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed/.test(message)
  ) {
    return "network";
  }
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return "invalid_credentials";
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "email_not_confirmed";
  if (
    record.status === 429 ||
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    message.includes("rate limit")
  ) {
    return "rate_limited";
  }
  if (code === "user_already_exists" || code === "email_exists" || message.includes("already registered")) return "user_exists";
  if (code === "same_password" || message.includes("different from the old password")) return "same_password";
  if (code === "weak_password" || message.includes("password should be")) return "weak_password";
  return "unknown";
}

const errorKeys = {
  network: "authErrorNetwork",
  invalid_credentials: "authErrorInvalidCredentials",
  email_not_confirmed: "authErrorEmailNotConfirmed",
  rate_limited: "authErrorRateLimited",
  user_exists: "authErrorUserExists",
  weak_password: "authErrorWeakPassword",
  same_password: "authErrorSamePassword",
  unknown: "authErrorUnknown",
} as const satisfies Record<AuthErrorCode, TranslationKey>;

export function authErrorText(
  result: { error: string | null; errorCode?: AuthErrorCode },
  t: (key: TranslationKey) => string,
): string {
  if (!result.errorCode) return result.error ?? "";
  // Unknown errors keep Supabase's own message so nothing useful is hidden.
  if (result.errorCode === "unknown" && result.error) return result.error;
  return t(errorKeys[result.errorCode]);
}
