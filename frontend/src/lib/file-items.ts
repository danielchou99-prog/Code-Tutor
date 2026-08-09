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

export type ProjectFile = {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type ProjectFileSource = Pick<ProjectFile, "id" | "name"> & {
  content: string;
};

const projectDraftStoragePrefix = "code-tutor:project-draft:";
const activeProjectFileStoragePrefix = "code-tutor:active-project-file:";

function projectDraftKey(projectId: string, fileId?: string): string {
  return `${projectDraftStoragePrefix}${projectId}${fileId ? `:${fileId}` : ""}`;
}

export function loadProjectDraft(projectId: string, fileId?: string): string | null {
  try {
    const storedDraft = window.localStorage.getItem(projectDraftKey(projectId, fileId));
    if (!storedDraft) return null;
    const draft = JSON.parse(storedDraft) as { content?: unknown };
    return typeof draft.content === "string" ? draft.content : null;
  } catch {
    return null;
  }
}

export function saveProjectDraft(projectId: string, content: string, fileId?: string) {
  try {
    window.localStorage.setItem(
      projectDraftKey(projectId, fileId),
      JSON.stringify({ content, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // A blocked or full browser storage must not stop the editor from working.
  }
}

export function clearProjectDraft(projectId: string, fileId?: string) {
  try {
    if (fileId) {
      window.localStorage.removeItem(projectDraftKey(projectId, fileId));
      return;
    }
    window.localStorage.removeItem(projectDraftKey(projectId));
    const prefix = `${projectDraftStoragePrefix}${projectId}:`;
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  } catch {
    // A blocked browser storage must not stop navigation or saving.
  }
}

export function loadActiveProjectFileId(projectId: string): string | null {
  try {
    return window.localStorage.getItem(`${activeProjectFileStoragePrefix}${projectId}`);
  } catch {
    return null;
  }
}

export function saveActiveProjectFileId(projectId: string, fileId: string | null) {
  try {
    const key = `${activeProjectFileStoragePrefix}${projectId}`;
    if (fileId) window.localStorage.setItem(key, fileId);
    else window.localStorage.removeItem(key);
  } catch {
    // The editor still works when browser storage is unavailable.
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

export function isValidProjectFileName(value: string): boolean {
  const name = value.trim();
  const baseName = name.slice(0, name.lastIndexOf(".")).replace(/[ .]+$/u, "").toLocaleLowerCase();
  const reservedNames = new Set([
    "con", "prn", "aux", "nul",
    ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
    ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
  ]);
  return name.length >= 1
    && name.length <= 120
    && baseName.length > 0
    && !/[<>:"/\\|?*\u0000-\u001f]/u.test(name)
    && !reservedNames.has(baseName)
    && /\.(?:cpp|h|hpp)$/iu.test(name);
}

export async function listProjectFiles(projectId: string) {
  return getSupabaseBrowserClient()
    .from("project_files")
    .select("id,user_id,project_id,name,created_at,updated_at")
    .eq("project_id", projectId)
    .order("name", { ascending: true });
}

export async function listProjectFileSources(projectId: string) {
  return getSupabaseBrowserClient()
    .from("project_files")
    .select("id,name,content")
    .eq("project_id", projectId)
    .order("name", { ascending: true });
}

export async function createProjectFile(input: {
  userId: string;
  projectId: string;
  name: string;
}) {
  return getSupabaseBrowserClient()
    .from("project_files")
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      name: input.name.trim(),
      content: "",
    })
    .select("id,user_id,project_id,name,created_at,updated_at")
    .single();
}

export async function loadProjectFileContent(fileId: string) {
  return getSupabaseBrowserClient()
    .from("project_files")
    .select("content")
    .eq("id", fileId)
    .single();
}

export async function saveProjectFileContent(fileId: string, content: string) {
  return getSupabaseBrowserClient()
    .from("project_files")
    .update({ content })
    .eq("id", fileId);
}

export async function deleteProjectFile(fileId: string) {
  return getSupabaseBrowserClient().from("project_files").delete().eq("id", fileId);
}
