import type { ProgrammingLanguage } from "@/lib/file-items";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SavedProblemCode = {
  code: string;
  updatedAt: string;
};

export type LocalProblemCodeDraft = {
  code: string;
  savedCode: string;
};

export class ProblemCodeDraftError extends Error {
  constructor(
    public readonly code: "not_authenticated" | "migration_missing" | "load_failed" | "save_failed",
    message: string,
  ) {
    super(message);
    this.name = "ProblemCodeDraftError";
  }
}

const localDraftPrefix = "code-tutor:problem-code-draft:";

function localDraftKey(problemId: string, language: ProgrammingLanguage) {
  return `${localDraftPrefix}${problemId}:${language}`;
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  return error?.code === "PGRST205"
    || /problem_code_drafts|schema cache|could not find the table/iu.test(error?.message ?? "");
}

export function loadLocalProblemCodeDraft(problemId: string, language: ProgrammingLanguage): LocalProblemCodeDraft | null {
  try {
    const stored = window.localStorage.getItem(localDraftKey(problemId, language));
    if (!stored) return null;
    const value = JSON.parse(stored) as { code?: unknown; savedCode?: unknown };
    if (typeof value.code !== "string" || typeof value.savedCode !== "string") return null;
    return { code: value.code, savedCode: value.savedCode };
  } catch {
    return null;
  }
}

export function saveLocalProblemCodeDraft(problemId: string, language: ProgrammingLanguage, draft: LocalProblemCodeDraft) {
  try {
    window.localStorage.setItem(localDraftKey(problemId, language), JSON.stringify(draft));
  } catch {
    // The editor remains usable when browser storage is blocked or full.
  }
}

export function clearLocalProblemCodeDraft(problemId: string, language: ProgrammingLanguage) {
  try {
    window.localStorage.removeItem(localDraftKey(problemId, language));
  } catch {
    // The cloud save has still succeeded when browser storage is unavailable.
  }
}

export async function loadSavedProblemCode(problemId: string, language: ProgrammingLanguage): Promise<SavedProblemCode | null> {
  const supabase = getSupabaseBrowserClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new ProblemCodeDraftError("not_authenticated", "Sign in to load saved problem code.");

  const { data, error } = await supabase
    .from("problem_code_drafts")
    .select("code,updated_at")
    .eq("user_id", authData.user.id)
    .eq("problem_id", problemId)
    .eq("language", language)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) throw new ProblemCodeDraftError("migration_missing", "The problem code table is not ready.");
    throw new ProblemCodeDraftError("load_failed", error.message);
  }
  return data ? { code: String(data.code), updatedAt: String(data.updated_at) } : null;
}

export async function saveProblemCode(problemId: string, language: ProgrammingLanguage, code: string): Promise<SavedProblemCode> {
  const supabase = getSupabaseBrowserClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new ProblemCodeDraftError("not_authenticated", "Sign in to save problem code.");

  const { data, error } = await supabase
    .from("problem_code_drafts")
    .upsert({
      user_id: authData.user.id,
      problem_id: problemId,
      language,
      code,
    }, { onConflict: "user_id,problem_id,language" })
    .select("code,updated_at")
    .single();

  if (error) {
    if (isMissingTable(error)) throw new ProblemCodeDraftError("migration_missing", "The problem code table is not ready.");
    throw new ProblemCodeDraftError("save_failed", error.message);
  }
  return { code: String(data.code), updatedAt: String(data.updated_at) };
}
