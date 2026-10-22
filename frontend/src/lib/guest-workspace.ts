import {
  createFileItem,
  createProjectFile,
  defaultCppCode,
  defaultPythonCode,
  deleteFileItem,
  type FileProject,
  isValidProjectFileName,
  listProjectFiles,
  type ProgrammingLanguage,
  type ProjectFile,
  type ProjectFileStore,
  saveProjectFileContent,
} from "@/lib/file-items";

export const guestProjectId = "guest-workspace";
export const requestSignInEvent = "code-tutor:request-sign-in";

const guestWorkspaceKey = "code-tutor:guest-workspace";
const guestSavePendingKey = "code-tutor:guest-save-pending";
const maxGuestFiles = 50;

type GuestFile = { id: string; name: string; content: string; created_at: string; updated_at: string };
type GuestWorkspace = { language: ProgrammingLanguage; files: GuestFile[] };

function entryFileName(language: ProgrammingLanguage): string {
  return language === "python" ? "main.py" : "main.cpp";
}

function newFileId(): string {
  // randomUUID exists only in secure contexts; plain-HTTP LAN testing needs a fallback.
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function newGuestFile(name: string, content: string): GuestFile {
  const now = new Date().toISOString();
  return { id: newFileId(), name, content, created_at: now, updated_at: now };
}

function createDefaultWorkspace(language: ProgrammingLanguage): GuestWorkspace {
  return {
    language,
    files: [newGuestFile(entryFileName(language), language === "python" ? defaultPythonCode : defaultCppCode)],
  };
}

function isGuestWorkspace(value: unknown): value is GuestWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<GuestWorkspace>;
  return (workspace.language === "cpp" || workspace.language === "python")
    && Array.isArray(workspace.files)
    && workspace.files.every((file) => Boolean(file)
      && typeof file.id === "string"
      && typeof file.name === "string"
      && typeof file.content === "string"
      && typeof file.created_at === "string"
      && typeof file.updated_at === "string");
}

function readWorkspace(): GuestWorkspace | null {
  try {
    const stored = window.localStorage.getItem(guestWorkspaceKey);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isGuestWorkspace(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeWorkspace(workspace: GuestWorkspace) {
  try {
    window.localStorage.setItem(guestWorkspaceKey, JSON.stringify(workspace));
  } catch {
    // A full or blocked browser storage must not stop a guest from editing.
  }
}

/** Returns the stored guest workspace, creating a fresh one in `language` when none exists. */
export function loadGuestProject(language: ProgrammingLanguage, name: string): FileProject {
  let workspace = readWorkspace();
  if (!workspace) {
    workspace = createDefaultWorkspace(language);
    writeWorkspace(workspace);
  }
  return { id: guestProjectId, name, language: workspace.language, guest: true };
}

export function resetGuestWorkspace(language: ProgrammingLanguage) {
  writeWorkspace(createDefaultWorkspace(language));
}

export function clearGuestWorkspace() {
  try {
    window.localStorage.removeItem(guestWorkspaceKey);
    window.localStorage.removeItem(guestSavePendingKey);
  } catch {
    // Nothing else to clean up when browser storage is unavailable.
  }
}

function toProjectFile(file: GuestFile): ProjectFile {
  return {
    id: file.id,
    user_id: "guest",
    project_id: guestProjectId,
    name: file.name,
    created_at: file.created_at,
    updated_at: file.updated_at,
  };
}

const noWorkspace = { message: "The guest workspace is unavailable." };

export const guestProjectFileStore: ProjectFileStore = {
  list: async () => {
    const workspace = readWorkspace();
    if (!workspace) return { data: null, error: noWorkspace };
    return {
      data: [...workspace.files].sort((a, b) => a.name.localeCompare(b.name)).map(toProjectFile),
      error: null,
    };
  },
  listSources: async () => {
    const workspace = readWorkspace();
    if (!workspace) return { data: null, error: noWorkspace };
    return { data: workspace.files.map(({ id, name, content }) => ({ id, name, content })), error: null };
  },
  create: async ({ name }) => {
    const workspace = readWorkspace();
    if (!workspace) return { data: null, error: noWorkspace };
    const fileName = name.trim();
    if (!isValidProjectFileName(fileName, workspace.language)) return { data: null, error: { message: "Invalid file name." } };
    if (workspace.files.length >= maxGuestFiles) return { data: null, error: { message: "Too many files." } };
    if (workspace.files.some((file) => file.name.toLocaleLowerCase() === fileName.toLocaleLowerCase())) {
      return { data: null, error: { code: "23505", message: "Duplicate file name." } };
    }
    const file = newGuestFile(fileName, "");
    writeWorkspace({ ...workspace, files: [...workspace.files, file] });
    return { data: toProjectFile(file), error: null };
  },
  loadContent: async (fileId) => {
    const file = readWorkspace()?.files.find((candidate) => candidate.id === fileId);
    return file ? { data: { content: file.content }, error: null } : { data: null, error: noWorkspace };
  },
  saveContent: async (fileId, content) => {
    const workspace = readWorkspace();
    const file = workspace?.files.find((candidate) => candidate.id === fileId);
    if (!workspace || !file) return { error: noWorkspace };
    if (file.content === content) return { error: null };
    writeWorkspace({
      ...workspace,
      files: workspace.files.map((candidate) => candidate.id === fileId
        ? { ...candidate, content, updated_at: new Date().toISOString() }
        : candidate),
    });
    return { error: null };
  },
  remove: async (fileId) => {
    const workspace = readWorkspace();
    if (!workspace) return { error: noWorkspace };
    writeWorkspace({ ...workspace, files: workspace.files.filter((file) => file.id !== fileId) });
    return { error: null };
  },
};

/** Opens the header sign-in panel without saving anything. */
export function requestSignIn() {
  window.dispatchEvent(new Event(requestSignInEvent));
}

/** A guest pressed Save: remember the intent, then ask them to sign in. */
export function requestSignInToSave() {
  try {
    window.localStorage.setItem(guestSavePendingKey, "1");
  } catch {
    // Without storage the guest can still sign in and import by pressing Save again.
  }
  requestSignIn();
}

export function hasPendingGuestSave(): boolean {
  try {
    return window.localStorage.getItem(guestSavePendingKey) === "1" && readWorkspace() !== null;
  } catch {
    return false;
  }
}

export function cancelPendingGuestSave() {
  try {
    window.localStorage.removeItem(guestSavePendingKey);
  } catch {
    // Nothing to cancel when browser storage is unavailable.
  }
}

function importedProjectName(baseName: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  return `${baseName} ${stamp}`.slice(0, 120);
}

/**
 * Turns the guest workspace into a real project owned by `userId`.
 * Nothing is removed from this browser unless every file was saved.
 */
export async function importGuestWorkspace(
  userId: string,
  baseName: string,
): Promise<{ project: FileProject | null; error: boolean }> {
  const workspace = readWorkspace();
  if (!workspace) return { project: null, error: false };

  const created = await createFileItem({
    userId,
    parentId: null,
    kind: "project",
    name: importedProjectName(baseName),
    tags: [],
    language: workspace.language,
  });
  if (created.error || !created.data) return { project: null, error: true };
  const project = created.data;

  try {
    // The database creates the entry file for a new project, so reuse it before adding the rest.
    const existing = await listProjectFiles(project.id);
    if (existing.error) throw existing.error;
    const fileIds = new Map((existing.data ?? []).map((file) => [file.name.toLocaleLowerCase(), file.id]));

    for (const file of workspace.files) {
      let fileId = fileIds.get(file.name.toLocaleLowerCase());
      if (!fileId) {
        const createdFile = await createProjectFile({ userId, projectId: project.id, name: file.name });
        if (createdFile.error || !createdFile.data) throw createdFile.error;
        fileId = createdFile.data.id;
      }
      const saved = await saveProjectFileContent(fileId, file.content);
      if (saved.error) throw saved.error;
    }
  } catch {
    await deleteFileItem(project.id);
    return { project: null, error: true };
  }

  clearGuestWorkspace();
  return { project: { id: project.id, name: project.name, language: workspace.language }, error: false };
}
