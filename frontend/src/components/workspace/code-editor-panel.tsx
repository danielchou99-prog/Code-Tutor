"use client";

import type { BeforeMount, OnMount } from "@monaco-editor/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IDisposable } from "monaco-editor";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth-context";
import {
  clearProjectDraft,
  createProjectFile,
  deleteProjectFile,
  isValidProjectFileName,
  listProjectFiles,
  loadActiveProjectFileId,
  loadProjectDraft,
  loadProjectFileContent,
  type FileProject,
  type ProjectFile,
  saveActiveProjectFileId,
  saveProjectDraft,
  saveProjectFileContent,
} from "@/lib/file-items";
import { useLanguage } from "@/lib/language-context";

function EditorLoading() {
  const { language } = useLanguage();
  return (
    <div className="grid h-full place-items-center bg-[#0c111b] font-mono text-xs text-slate-600">
      {language === "zh-Hant" ? "正在載入程式碼編輯器…" : "Loading editor…"}
    </div>
  );
}

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <EditorLoading />,
});

type SaveStatus = "saved" | "unsaved" | "saving" | "failed";

type CodeEditorPanelProps = {
  isRunning: boolean;
  onCodeChange: (code: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onFileRequestHandled: () => void;
  onProjectFilesChange: (files: ProjectFile[], activeFileId: string | null) => void;
  onRun: (code: string) => void | Promise<void>;
  project: FileProject;
  requestedFileId: string | null;
};

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 fill-none stroke-current" strokeWidth="1.7">
      <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" />
    </svg>
  );
}

function FilesIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 fill-none stroke-current" strokeWidth="1.7">
      <path d="M4 5h6l2 2h8v12H4V5Z" />
    </svg>
  );
}

export function CodeEditorPanel({
  isRunning,
  onCodeChange,
  onDirtyChange,
  onFileRequestHandled,
  onProjectFilesChange,
  onRun,
  project,
  requestedFileId,
}: CodeEditorPanelProps) {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const zh = language === "zh-Hant";
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [openFileIds, setOpenFileIds] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [code, setCode] = useState("");
  const [savedCode, setSavedCode] = useState("");
  const [cursor, setCursor] = useState({ lineNumber: 1, column: 1 });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [hasLoadedCode, setHasLoadedCode] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [filesMenuOpen, setFilesMenuOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingFileAction, setPendingFileAction] = useState<(() => void) | null>(null);
  const [clearStep, setClearStep] = useState<0 | 1 | 2>(0);
  const cursorListener = useRef<IDisposable | null>(null);
  const loadSequence = useRef(0);
  const activeFileRef = useRef<ProjectFile | null>(null);
  const hasLoadedCodeRef = useRef(false);
  const isSavingRef = useRef(false);
  const latestCode = useRef("");
  const saveCurrentRef = useRef<(nextCode: string) => void>(() => undefined);
  const openFileRequestRef = useRef<(file: ProjectFile) => void>(() => undefined);
  const isDirty = hasLoadedCode && code !== savedCode;
  const displayedSaveStatus: SaveStatus = saveStatus === "saving" || saveStatus === "failed"
    ? saveStatus
    : isDirty ? "unsaved" : "saved";
  const openFiles = openFileIds
    .map((id) => files.find((file) => file.id === id))
    .filter((file): file is ProjectFile => Boolean(file));

  const loadFile = useCallback(async (file: ProjectFile) => {
    const sequence = loadSequence.current + 1;
    loadSequence.current = sequence;
    activeFileRef.current = file;
    setActiveFile(file);
    saveActiveProjectFileId(project.id, file.id);
    setHasLoadedCode(false);
    hasLoadedCodeRef.current = false;
    setCode("");
    setSavedCode("");
    setSaveStatus("saved");
    setFileError(null);
    onDirtyChange(false);

    const { data, error } = await loadProjectFileContent(file.id);
    if (sequence !== loadSequence.current || activeFileRef.current?.id !== file.id) return;
    if (error) {
      setCode("");
      setSavedCode("");
      setSaveStatus("failed");
      setFileError(zh ? "無法載入這個檔案。" : "This file could not be loaded.");
    } else {
      const persistedCode = typeof data?.content === "string" ? data.content : "";
      const restoredDraft = loadProjectDraft(project.id, file.id);
      const nextCode = restoredDraft ?? persistedCode;
      latestCode.current = nextCode;
      setCode(nextCode);
      setSavedCode(persistedCode);
      setSaveStatus("saved");
    }
    hasLoadedCodeRef.current = true;
    setHasLoadedCode(true);
  }, [onDirtyChange, project.id, zh]);

  useEffect(() => {
    let cancelled = false;
    const restoreTimer = window.setTimeout(() => {
      void listProjectFiles(project.id).then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setFileError(
            error.code === "PGRST205"
              ? (zh ? "Project 檔案資料表尚未建立，請先執行 migration。" : "The project file table is not ready. Run the migration first.")
              : (zh ? "無法載入 Project 檔案。" : "Project files could not be loaded."),
          );
          return;
        }
        const nextFiles = (data ?? []) as ProjectFile[];
        setFiles(nextFiles);
        const storedId = loadActiveProjectFileId(project.id);
        const initialFile = nextFiles.find((file) => file.id === storedId)
          ?? nextFiles.find((file) => file.name.toLocaleLowerCase() === "main.cpp")
          ?? nextFiles[0]
          ?? null;
        if (initialFile) {
          setOpenFileIds([initialFile.id]);
          void loadFile(initialFile);
        } else {
          activeFileRef.current = null;
          setActiveFile(null);
          setCode("");
          setSavedCode("");
          setHasLoadedCode(true);
          hasLoadedCodeRef.current = true;
          onDirtyChange(false);
        }
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(restoreTimer);
    };
  }, [loadFile, onDirtyChange, project.id, zh]);

  useEffect(() => () => cursorListener.current?.dispose(), []);

  useEffect(() => {
    latestCode.current = code;
    onCodeChange(code);
    if (!hasLoadedCode || !activeFile) return;
    const dirty = code !== savedCode;
    onDirtyChange(dirty);
    if (dirty) saveProjectDraft(project.id, code, activeFile.id);
    else clearProjectDraft(project.id, activeFile.id);
  }, [activeFile, code, hasLoadedCode, onCodeChange, onDirtyChange, project.id, savedCode]);

  useEffect(() => {
    onProjectFilesChange(files, activeFile?.id ?? null);
  }, [activeFile?.id, files, onProjectFilesChange]);

  const saveCode = useCallback((nextCode: string) => {
    const file = activeFileRef.current;
    if (!file || !hasLoadedCodeRef.current || isSavingRef.current) return;
    isSavingRef.current = true;
    setSaveStatus("saving");
    void saveProjectFileContent(file.id, nextCode).then(({ error }) => {
      if (error) throw error;
      clearProjectDraft(project.id, file.id);
      if (activeFileRef.current?.id === file.id) {
        setSavedCode(nextCode);
        setSaveStatus(latestCode.current === nextCode ? "saved" : "unsaved");
      }
    }).catch(() => {
      if (activeFileRef.current?.id === file.id) setSaveStatus("failed");
    }).finally(() => {
      isSavingRef.current = false;
    });
  }, [project.id]);

  useEffect(() => {
    saveCurrentRef.current = saveCode;
  }, [saveCode]);

  const protectCurrentFile = (action: () => void) => {
    if (isSavingRef.current) return;
    if (isDirty) {
      setPendingFileAction(() => action);
      return;
    }
    action();
  };

  const openFile = (file: ProjectFile) => {
    setFilesMenuOpen(false);
    protectCurrentFile(() => {
      setOpenFileIds((current) => current.includes(file.id) ? current : [...current, file.id]);
      void loadFile(file);
    });
  };
  useEffect(() => {
    openFileRequestRef.current = openFile;
  });

  useEffect(() => {
    if (!requestedFileId) return;
    const requestTimer = window.setTimeout(() => {
      const requestedFile = files.find((file) => file.id === requestedFileId);
      if (requestedFile && requestedFile.id !== activeFile?.id) openFileRequestRef.current(requestedFile);
      onFileRequestHandled();
    }, 0);
    return () => window.clearTimeout(requestTimer);
  }, [activeFile?.id, files, onFileRequestHandled, requestedFileId]);

  const closeFile = (file: ProjectFile) => {
    const close = () => {
      const remainingIds = openFileIds.filter((id) => id !== file.id);
      setOpenFileIds(remainingIds);
      if (activeFileRef.current?.id !== file.id) return;
      const nextFile = remainingIds
        .map((id) => files.find((candidate) => candidate.id === id))
        .find((candidate): candidate is ProjectFile => Boolean(candidate));
      if (nextFile) {
        void loadFile(nextFile);
      } else {
        loadSequence.current += 1;
        activeFileRef.current = null;
        setActiveFile(null);
        saveActiveProjectFileId(project.id, null);
        setCode("");
        setSavedCode("");
        setHasLoadedCode(true);
        hasLoadedCodeRef.current = true;
        onDirtyChange(false);
      }
    };
    if (activeFileRef.current?.id === file.id) protectCurrentFile(close);
    else close();
  };

  const submitNewFile = async () => {
    if (!user || creating) return;
    const normalizedName = newFileName.trim();
    if (!isValidProjectFileName(normalizedName)) {
      setCreateError(zh ? "檔名必須以 .cpp、.h 或 .hpp 結尾，且不可包含 / 或 \\." : "Use a .cpp, .h, or .hpp name without / or \\.");
      return;
    }
    if (files.some((file) => file.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
      setCreateError(zh ? "這個 Project 已有相同檔名。" : "This project already contains that file name.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    const { data, error } = await createProjectFile({
      userId: user.id,
      projectId: project.id,
      name: normalizedName,
    });
    setCreating(false);
    if (error || !data) {
      setCreateError(zh ? "無法新增檔案，請稍後再試。" : "The file could not be created. Try again.");
      return;
    }
    const createdFile = data as ProjectFile;
    setFiles((current) => [...current, createdFile].sort((a, b) => a.name.localeCompare(b.name)));
    setCreateDialogOpen(false);
    setNewFileName("");
    protectCurrentFile(() => {
      setOpenFileIds((current) => [...current, createdFile.id]);
      void loadFile(createdFile);
    });
  };

  const confirmDeleteFile = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const target = deleteTarget;
    const { error } = await deleteProjectFile(target.id);
    setDeleting(false);
    if (error) {
      setFileError(zh ? "無法刪除這個檔案。" : "This file could not be deleted.");
      setDeleteTarget(null);
      return;
    }
    clearProjectDraft(project.id, target.id);
    const nextFiles = files.filter((file) => file.id !== target.id);
    const remainingIds = openFileIds.filter((id) => id !== target.id);
    setFiles(nextFiles);
    setOpenFileIds(remainingIds);
    setDeleteTarget(null);
    if (activeFileRef.current?.id === target.id) {
      const nextFile = remainingIds
        .map((id) => nextFiles.find((file) => file.id === id))
        .find((file): file is ProjectFile => Boolean(file))
        ?? nextFiles[0]
        ?? null;
      if (nextFile) {
        setOpenFileIds((current) => current.includes(nextFile.id) ? current : [...current, nextFile.id]);
        void loadFile(nextFile);
      } else {
        loadSequence.current += 1;
        activeFileRef.current = null;
        setActiveFile(null);
        saveActiveProjectFileId(project.id, null);
        setCode("");
        setSavedCode("");
        setHasLoadedCode(true);
        hasLoadedCodeRef.current = true;
        onDirtyChange(false);
      }
    }
  };

  const handleBeforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme("code-tutor-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "keyword", foreground: "C4A7FF" },
        { token: "number", foreground: "67E8F9" },
        { token: "string", foreground: "86EFAC" },
        { token: "comment", foreground: "526176", fontStyle: "italic" },
      ],
      colors: {
        "editor.background": "#0C111B",
        "editor.foreground": "#CBD5E1",
        "editorLineNumber.foreground": "#293750",
        "editorLineNumber.activeForeground": "#64748B",
        "editor.lineHighlightBackground": "#111927",
        "editorCursor.foreground": "#67E8F9",
        "editor.selectionBackground": "#164E6355",
        "editor.inactiveSelectionBackground": "#164E6333",
        "editorIndentGuide.background1": "#1E293B88",
        "editorIndentGuide.activeBackground1": "#47556988",
      },
    });
  };

  const handleMount: OnMount = (editor, monaco) => {
    const currentPosition = editor.getPosition();
    if (currentPosition) setCursor(currentPosition);
    cursorListener.current?.dispose();
    cursorListener.current = editor.onDidChangeCursorPosition(({ position }) => setCursor(position));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveCurrentRef.current(editor.getValue());
    });
  };

  const statusLabel = {
    saved: t("saved"),
    unsaved: zh ? "尚未儲存" : "Unsaved",
    saving: t("saving"),
    failed: t("saveFailed"),
  }[displayedSaveStatus];
  const canRun = Boolean(activeFile && activeFile.name.toLocaleLowerCase().endsWith(".cpp"));

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#0c111b]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/8 bg-[#0a0f17] pr-3">
        <div className="flex h-full min-w-0 flex-1 items-center">
          <div className="flex h-full min-w-0 overflow-x-auto">
            <div className="flex h-full shrink-0 items-center border-r border-white/8 px-3 text-[10px] text-slate-600">
              <span className="max-w-24 truncate">{project.name}</span>
            </div>
            {openFiles.map((file) => {
              const active = activeFile?.id === file.id;
              return (
                <div
                  key={file.id}
                  className={`group flex h-full shrink-0 items-center border-r border-white/8 text-[11px] ${active ? "bg-[#0c111b] text-slate-200" : "text-slate-600 hover:text-slate-300"}`}
                >
                  <button
                    type="button"
                    onClick={() => active || openFile(file)}
                    className="flex h-full min-w-0 items-center pl-3"
                  >
                    <span className="max-w-32 truncate">{file.name}</span>
                    {active ? (
                      <span className={`ml-2 size-1.5 rounded-full ${isDirty ? "bg-amber-300" : "bg-emerald-400"}`} aria-label={statusLabel} />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeFile(file);
                    }}
                    className="mx-1 grid size-6 place-items-center rounded text-sm text-slate-700 hover:bg-white/5 hover:text-slate-300"
                    aria-label={`${zh ? "關閉" : "Close"} ${file.name}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              setCreateDialogOpen(true);
              setNewFileName("");
              setCreateError(null);
            }}
            className="grid h-full w-9 shrink-0 place-items-center border-r border-white/8 text-base text-slate-500 hover:bg-white/[0.025] hover:text-cyan-200"
            aria-label={zh ? "新增檔案" : "New file"}
            title={zh ? "新增檔案" : "New file"}
          >
            +
          </button>

          <div className="relative h-full">
            <button
              type="button"
              onClick={() => setFilesMenuOpen((open) => !open)}
              className="grid h-full w-9 place-items-center border-r border-white/8 text-slate-600 hover:bg-white/[0.025] hover:text-slate-300"
              aria-label={zh ? "開啟 Project 檔案" : "Open project file"}
              title={zh ? "開啟檔案" : "Open file"}
            >
              <FilesIcon />
            </button>
            {filesMenuOpen ? (
              <div className="absolute left-0 top-full z-30 mt-1 max-h-64 min-w-48 overflow-y-auto rounded-xl border border-white/10 bg-[#111824] p-1.5 shadow-2xl shadow-black/60">
                {files.length ? files.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => openFile(file)}
                    className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-[11px] text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  >
                    <span className="truncate">{file.name}</span>
                    {openFileIds.includes(file.id) ? <span className="text-[9px] text-cyan-300">open</span> : null}
                  </button>
                )) : (
                  <p className="px-3 py-2 text-[10px] text-slate-600">{zh ? "尚無檔案" : "No files yet"}</p>
                )}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => activeFile && setDeleteTarget(activeFile)}
            disabled={!activeFile}
            className="grid h-full w-9 shrink-0 place-items-center border-r border-white/8 text-slate-600 hover:bg-rose-400/[0.05] hover:text-rose-300 disabled:cursor-default disabled:text-slate-800"
            aria-label={zh ? "刪除目前檔案" : "Delete current file"}
            title={zh ? "刪除目前檔案" : "Delete current file"}
          >
            <TrashIcon />
          </button>
        </div>

        <div className="ml-2 flex shrink-0 items-center gap-2">
          <span className={`hidden text-[9px] sm:inline ${displayedSaveStatus === "failed" ? "text-rose-400" : "text-slate-600"}`} role="status">
            {activeFile ? statusLabel : (zh ? "未開啟檔案" : "No file open")}
          </span>
          <button
            type="button"
            onClick={() => saveCode(code)}
            disabled={!activeFile || !isDirty || saveStatus === "saving"}
            className="h-7 rounded-lg border border-cyan-300/20 px-2.5 text-[10px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300/40 disabled:cursor-default disabled:border-white/8 disabled:text-slate-600"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setClearStep(1)}
            disabled={!activeFile}
            className="hidden h-7 rounded-lg border border-white/8 px-2.5 text-[10px] text-slate-500 transition-colors hover:border-white/15 hover:text-slate-300 disabled:cursor-default disabled:text-slate-800 sm:block"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => void onRun(code)}
            disabled={isRunning || !canRun}
            title={!canRun && activeFile ? (zh ? "只有 .cpp 檔案可以執行" : "Only .cpp files can run") : undefined}
            className="flex h-7 items-center gap-2 rounded-lg bg-cyan-400 px-3 text-[11px] font-bold text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.12)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span aria-hidden="true">▶</span>
            Run
          </button>
        </div>
      </div>

      {fileError ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
          <p className="max-w-md text-xs leading-6 text-rose-400">{fileError}</p>
        </div>
      ) : activeFile ? (
        <div className="min-h-0 flex-1">
          <MonacoEditor
            key={activeFile.id}
            beforeMount={handleBeforeMount}
            onMount={handleMount}
            onChange={(value) => setCode(value ?? "")}
            path={`file:///${activeFile.id}/${activeFile.name}`}
            language="cpp"
            value={code}
            theme="code-tutor-dark"
            options={{
              accessibilitySupport: "auto",
              ariaLabel: `${activeFile.name} C++ ${zh ? "程式碼編輯器" : "code editor"}`,
              automaticLayout: true,
              bracketPairColorization: { enabled: true },
              cursorBlinking: "smooth",
              fontFamily: "Cascadia Code, Consolas, monospace",
              fontLigatures: true,
              fontSize: 14,
              hideCursorInOverviewRuler: true,
              insertSpaces: true,
              lineHeight: 24,
              minimap: { enabled: false },
              overviewRulerLanes: 0,
              padding: { top: 18, bottom: 18 },
              renderLineHighlight: "all",
              roundedSelection: true,
              scrollBeyondLastLine: false,
              scrollbar: { horizontalScrollbarSize: 8, verticalScrollbarSize: 8 },
              smoothScrolling: true,
              tabSize: 4,
              wordWrap: "off",
            }}
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div>
            <p className="text-xs text-slate-500">{zh ? "目前沒有開啟的檔案" : "No file is currently open"}</p>
            <p className="mt-2 text-[10px] text-slate-700">{zh ? "使用 + 新增檔案，或使用資料夾按鈕開啟既有檔案。" : "Use + to create a file, or the folder button to open an existing file."}</p>
          </div>
        </div>
      )}

      <div className="flex h-7 shrink-0 items-center justify-between border-t border-white/8 bg-[#0a0f17] px-3 font-mono text-[9px] text-slate-600">
        <span>Ln {cursor.lineNumber}, Col {cursor.column}</span>
        <div className="flex gap-4"><span>{t("spaces")}</span><span>UTF-8</span></div>
      </div>

      {createDialogOpen ? (
        <>
          <button type="button" aria-label={t("closeDialog")} onClick={() => !creating && setCreateDialogOpen(false)} className="fixed inset-0 z-[70] cursor-default bg-black/60" />
          <div className="pointer-events-none fixed inset-0 z-[71] grid place-items-center px-4">
            <form
              onSubmit={(event) => { event.preventDefault(); void submitNewFile(); }}
              className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-[#111824] p-5 shadow-2xl shadow-black/60"
            >
              <h2 className="text-sm font-semibold text-white">{zh ? "新增 Project 檔案" : "New project file"}</h2>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{zh ? "支援 .cpp、.h 與 .hpp，每個 Project 最多 50 個檔案。" : "Supports .cpp, .h, and .hpp, up to 50 files per project."}</p>
              <label className="mt-4 block text-[11px] text-slate-400" htmlFor="new-project-file-name">{zh ? "檔名" : "File name"}</label>
              <input
                id="new-project-file-name"
                autoFocus
                value={newFileName}
                onChange={(event) => { setNewFileName(event.target.value); setCreateError(null); }}
                placeholder="example.cpp"
                maxLength={120}
                disabled={creating}
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0a1019] px-3 text-sm text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-300/40"
              />
              {createError ? <p className="mt-2 text-[11px] leading-5 text-rose-400" role="alert">{createError}</p> : null}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setCreateDialogOpen(false)} disabled={creating} className="h-10 rounded-xl border border-white/10 px-4 text-xs text-slate-400">{t("cancel")}</button>
                <button type="submit" disabled={creating || !newFileName.trim()} className="h-10 rounded-xl bg-cyan-400 px-4 text-xs font-semibold text-slate-950 disabled:opacity-50">{creating ? (zh ? "新增中…" : "Creating…") : (zh ? "新增" : "Create")}</button>
              </div>
            </form>
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={pendingFileAction !== null}
        title={zh ? "尚未儲存的變更" : "Unsaved changes"}
        description={zh ? `如果繼續，${activeFile?.name ?? "目前檔案"} 尚未儲存的變更會遺失。` : `Unsaved changes to ${activeFile?.name ?? "the current file"} will be lost.`}
        confirmLabel={zh ? "不儲存並繼續" : "Continue without saving"}
        cancelLabel={t("cancel")}
        closeLabel={t("closeDialog")}
        tone="danger"
        onClose={() => setPendingFileAction(null)}
        onConfirm={() => {
          const action = pendingFileAction;
          if (activeFile) clearProjectDraft(project.id, activeFile.id);
          setPendingFileAction(null);
          setSavedCode(code);
          onDirtyChange(false);
          if (action) action();
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={zh ? "刪除檔案" : "Delete file"}
        description={zh
          ? `確定永久刪除 ${deleteTarget?.name ?? "這個檔案"}？${isDirty ? "尚未儲存的變更也會遺失。" : ""}此動作無法復原。`
          : `Permanently delete ${deleteTarget?.name ?? "this file"}? ${isDirty ? "Unsaved changes will also be lost. " : ""}This action cannot be undone.`}
        confirmLabel={deleting ? (zh ? "刪除中…" : "Deleting…") : t("confirmDelete")}
        cancelLabel={t("cancel")}
        closeLabel={t("closeDialog")}
        tone="danger"
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteFile()}
      />

      <ConfirmDialog
        open={clearStep !== 0}
        title={clearStep === 2 ? "Are you sure?" : t("clearCodeTitle")}
        description={clearStep === 2 ? `This will permanently clear the current ${activeFile?.name ?? "file"}.` : t("clearCodeFirstConfirm")}
        confirmLabel={t(clearStep === 2 ? "confirmClearAll" : "continueClear")}
        cancelLabel={t("cancel")}
        closeLabel={t("closeDialog")}
        tone={clearStep === 2 ? "danger" : "default"}
        onClose={() => setClearStep(0)}
        onConfirm={() => {
          if (clearStep === 1) setClearStep(2);
          else { setCode(""); setClearStep(0); }
        }}
      />
    </section>
  );
}
