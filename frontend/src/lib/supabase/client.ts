import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error("Supabase public configuration is missing.");
  }

  browserClient ??= createBrowserClient(config.url, config.publishableKey);
  return browserClient;
}
