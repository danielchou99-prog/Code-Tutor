import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type FileItemKind = "folder" | "project";

export type FileItem = {
  id: string;
  user_id: string;
  parent_id: string | null;
  kind: FileItemKind;
  name: string;
  tags: string[];
  language: "cpp" | null;
  created_at: string;
  updated_at: string;
};

export type FileProject = Pick<FileItem, "id" | "name">;

const projectDraftStoragePrefix = "code-tutor:project-draft:";

export function loadProjectDraft(projectId: string): string | null {
  try {
    const storedDraft = window.localStorage.getItem(`${projectDraftStoragePrefix}${projectId}`);
    if (!storedDraft) return null;
    const draft = JSON.parse(storedDraft) as { content?: unknown };
    return typeof draft.content === "string" ? draft.content : null;
  } catch {
    return null;
  }
}

export function saveProjectDraft(projectId: string, content: string) {
  try {
    window.localStorage.setItem(
      `${projectDraftStoragePrefix}${projectId}`,
      JSON.stringify({ content, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // A blocked or full browser storage must not stop the editor from working.
  }
}

export function clearProjectDraft(projectId: string) {
  try {
    window.localStorage.removeItem(`${projectDraftStoragePrefix}${projectId}`);
  } catch {
    // A blocked browser storage must not stop navigation or saving.
  }
}

export const defaultCppCode = `#include <iostream>
#include <vector>
using namespace std;

int main() {
    int n;
    cin >> n;

    vector<int> numbers(n);
    long long sum = 0;

    for (int i = 0; i < n; ++i) {
        cin >> numbers[i];
        sum += numbers[i];
    }

    cout << sum << '\\n';
    return 0;
}`;

export function parseHashtags(value: string): string[] {
  const matches = value.match(/#[^\s#]+/gu) ?? [];
  const uniqueTags = new Map<string, string>();

  for (const match of matches) {
    const tag = match.slice(1).normalize("NFKC").trim().slice(0, 32);
    const key = tag.toLocaleLowerCase();
    if (tag && !uniqueTags.has(key)) uniqueTags.set(key, tag);
    if (uniqueTags.size === 8) break;
  }

  return [...uniqueTags.values()];
}

export function removeHashtags(value: string): string {
  return value.replace(/#[^\s#]+/gu, " ").replace(/\s+/g, " ").trim();
}

export async function listFileItems(userId: string, parentId: string | null) {
  let query = getSupabaseBrowserClient()
    .from("file_items")
    .select("id,user_id,parent_id,kind,name,tags,language,created_at,updated_at")
    .eq("user_id", userId);

  query = parentId === null ? query.is("parent_id", null) : query.eq("parent_id", parentId);
  return query.order("kind", { ascending: true }).order("name", { ascending: true });
}

export async function listRecentProjects(userId: string) {
  return getSupabaseBrowserClient()
    .from("file_items")
    .select("id,user_id,parent_id,kind,name,tags,language,created_at,updated_at")
    .eq("user_id", userId)
    .eq("kind", "project")
    .order("updated_at", { ascending: false })
    .limit(5);
}

export async function createFileItem(input: {
  userId: string;
  parentId: string | null;
  kind: FileItemKind;
  name: string;
  tags: string[];
}) {
  return getSupabaseBrowserClient()
    .from("file_items")
    .insert({
      user_id: input.userId,
      parent_id: input.parentId,
      kind: input.kind,
      name: input.name.trim(),
      tags: input.tags,
      language: input.kind === "project" ? "cpp" : null,
      content: input.kind === "project" ? defaultCppCode : null,
    })
    .select("id,user_id,parent_id,kind,name,tags,language,created_at,updated_at")
    .single();
}

export async function updateFileItem(id: string, name: string, tags: string[]) {
  return getSupabaseBrowserClient()
    .from("file_items")
    .update({ name: name.trim(), tags })
    .eq("id", id)
    .select("id,user_id,parent_id,kind,name,tags,language,created_at,updated_at")
    .single();
}

export async function moveFileItem(id: string, parentId: string | null) {
  return getSupabaseBrowserClient()
    .from("file_items")
    .update({ parent_id: parentId })
    .eq("id", id)
    .select("id,parent_id")
    .single();
}

export async function deleteFileItem(id: string) {
  return getSupabaseBrowserClient().from("file_items").delete().eq("id", id);
}

export async function loadProjectContent(id: string) {
  return getSupabaseBrowserClient()
    .from("file_items")
    .select("content")
    .eq("id", id)
    .eq("kind", "project")
    .single();
}

export async function saveProjectContent(id: string, content: string) {
  return getSupabaseBrowserClient()
    .from("file_items")
    .update({ content })
    .eq("id", id)
    .eq("kind", "project");
}
