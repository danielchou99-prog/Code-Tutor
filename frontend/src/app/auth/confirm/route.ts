import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

function safeNextPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: NextRequest) {
  const config = getSupabasePublicConfig();
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));
  const destination = new URL(nextPath, request.url);
  const response = NextResponse.redirect(destination);

  if (!config) {
    destination.pathname = "/";
    destination.searchParams.set("auth_error", "configuration_missing");
    return NextResponse.redirect(destination);
  }

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Missing authentication confirmation parameters.") };

  if (result.error) {
    const errorUrl = new URL("/", request.url);
    errorUrl.searchParams.set("auth_error", "confirmation_failed");
    return NextResponse.redirect(errorUrl);
  }

  return response;
}
