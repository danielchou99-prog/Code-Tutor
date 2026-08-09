"use client";

import { type DragEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import {
  createFileItem,
  deleteFileItem,
  type FileItem,
  type FileItemKind,
  type FileProject,
  listFileItems,
  listRecentProjects,
  moveFileItem,
  parseHashtags,
  removeHashtags,
  updateFileItem,
} from "@/lib/file-items";
import { useLanguage } from "@/lib/language-context";

type FileHomeProps = {
  onOpenProject: (project: FileProject) => void;
};

type FolderCrumb = Pick<FileItem, "id" | "name">;

type ItemDialogState =
  | { mode: "create"; kind: FileItemKind }
  | { mode: "edit"; item: FileItem }
  | null;

function FolderIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="1.6">
      <path d="M3.5 7.2h6l1.6 1.9h9.4v8.7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.2Z" />
      <path d="M3.5 7.2V5.9a1.7 1.7 0 0 1 1.7-1.7h4.2l1.6 1.9h7.3a2.2 2.2 0 0 1 2.2 2.2v.8" />
    </svg>
  );
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return String(error.code);
}

function ItemDialog({
  state,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  state: Exclude<ItemDialogState, null>;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (name: string, tags: string[]) => Promise<void>;
}) {
  const { t } = useLanguage();
  const item = state.mode === "edit" ? state.item : null;
  const kind = state.mode === "create" ? state.kind : item?.kind ?? "project";
  const [name, setName] = useState(item?.name ?? "");
  const [tagInput, setTagInput] = useState(item?.tags.map((tag) => `#${tag}`).join(" ") ?? "");
  const tags = parseHashtags(tagInput);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    await onSubmit(name.trim(), tags);
  };

  const title = state.mode === "edit"
    ? t("editItemTitle")
    : t(kind === "folder" ? "createFolderTitle" : "createProjectTitle");

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 px-4" role="presentation">
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111824] p-5 shadow-2xl shadow-black/60"
        onSubmit={(event) => void submit(event)}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-600 hover:text-slate-300" aria-label={t("closeDialog")}>×</button>
        </div>

        <label className="mt-5 block text-[11px] text-slate-400">
          {t("itemName")}
          <input
            autoFocus
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 h-10 w-full rounded-lg border border-white/8 bg-[#0b111a] px-3 text-xs text-slate-200 outline-none focus:border-cyan-300/30"
          />
        </label>

        <label className="mt-4 block text-[11px] text-slate-400">
          {t("itemTags")}
          <input
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder={t("itemTagsPlaceholder")}
            className="mt-1.5 h-10 w-full rounded-lg border border-white/8 bg-[#0b111a] px-3 text-xs text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-300/30"
          />
        </label>
        <p className="mt-2 text-[10px] text-slate-600">{t("itemTagsHelp")}</p>

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t("itemTags")}>
            {tags.map((tag) => (
              <span key={tag.toLocaleLowerCase()} className="rounded-full border border-cyan-300/10 bg-cyan-300/[0.045] px-2 py-1 text-[10px] text-cyan-200/75">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {error && <p role="alert" className="mt-4 text-[11px] leading-5 text-rose-300">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-white/8 px-4 text-xs text-slate-400 hover:text-slate-200">
            {t("cancel")}
          </button>
          <button disabled={busy || !name.trim()} type="submit" className="h-9 rounded-lg bg-cyan-400 px-4 text-xs font-bold text-slate-950 disabled:cursor-wait disabled:opacity-50">
            {t(state.mode === "edit" ? "saveChanges" : "create")}
          </button>
        </div>
      </form>
    </div>
  );
}

export function FileHome({ onOpenProject }: FileHomeProps) {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [items, setItems] = useState<FileItem[]>([]);
  const [recentProjects, setRecentProjects] = useState<FileItem[]>([]);
  const [path, setPath] = useState<FolderCrumb[]>([]);
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ItemDialogState>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | "root" | null>(null);
  const [moving, setMoving] = useState(false);
  const currentFolderId = path.at(-1)?.id ?? null;

  const friendlyError = useCallback((error: unknown, fallback: "load" | "save" | "delete" | "move") => {
    if (["42P01", "PGRST205"].includes(errorCode(error) ?? "")) return t("fileStorageNotReady");
    if (fallback === "save") return t("fileSaveFailed");
    if (fallback === "delete") return t("fileDeleteFailed");
    if (fallback === "move") return t("fileMoveFailed");
    return t("fileLoadFailed");
  }, [t]);

  const refreshItems = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    const [{ data, error }, recentResult] = await Promise.all([
      listFileItems(user.id, currentFolderId),
      listRecentProjects(user.id),
    ]);
    if (error) {
      setItems([]);
      setLoadError(friendlyError(error, "load"));
    } else {
      setItems((data ?? []) as FileItem[]);
    }
    if (!recentResult.error) setRecentProjects((recentResult.data ?? []) as FileItem[]);
    setLoading(false);
  }, [currentFolderId, friendlyError, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void Promise.all([
      listFileItems(user.id, currentFolderId),
      listRecentProjects(user.id),
    ]).then(([{ data, error }, recentResult]) => {
      if (cancelled) return;
      if (error) {
        setItems([]);
        setLoadError(friendlyError(error, "load"));
      } else {
        setItems((data ?? []) as FileItem[]);
        setLoadError(null);
      }
      if (!recentResult.error) setRecentProjects((recentResult.data ?? []) as FileItem[]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [currentFolderId, friendlyError, user]);

  const queryTags = useMemo(() => parseHashtags(query), [query]);
  const effectiveTags = useMemo(() => {
    const tags = new Map<string, string>();
    for (const tag of [...selectedTags, ...queryTags]) tags.set(tag.toLocaleLowerCase(), tag);
    return [...tags.values()];
  }, [queryTags, selectedTags]);
  const textQuery = useMemo(() => removeHashtags(query).toLocaleLowerCase(), [query]);

  const filteredItems = useMemo(() => items.filter((item) => {
    const itemTags = item.tags.map((tag) => tag.toLocaleLowerCase());
    const includesTags = effectiveTags.every((tag) => itemTags.includes(tag.toLocaleLowerCase()));
    const includesText = !textQuery || item.name.toLocaleLowerCase().includes(textQuery);
    return includesTags && includesText;
  }), [effectiveTags, items, textQuery]);

  const availableTags = useMemo(() => {
    const tags = new Map<string, string>();
    for (const item of items) {
      for (const tag of item.tags) tags.set(tag.toLocaleLowerCase(), tag);
    }
    return [...tags.values()].sort((a, b) => a.localeCompare(b, language));
  }, [items, language]);

  const toggleTag = (tag: string) => {
    const key = tag.toLocaleLowerCase();
    setSelectedTags((current) => current.some((item) => item.toLocaleLowerCase() === key)
      ? current.filter((item) => item.toLocaleLowerCase() !== key)
      : [...current, tag]);
  };

  const submitDialog = async (name: string, tags: string[]) => {
    if (!dialog || !user) return;
    setSaving(true);
    setDialogError(null);
    const result = dialog.mode === "create"
      ? await createFileItem({ userId: user.id, parentId: currentFolderId, kind: dialog.kind, name, tags })
      : await updateFileItem(dialog.item.id, name, tags);
    setSaving(false);

    if (result.error) {
      setDialogError(friendlyError(result.error, "save"));
      return;
    }

    setDialog(null);
    await refreshItems();
  };

  const removeItem = async (item: FileItem) => {
    const confirmed = window.confirm(t(item.kind === "folder" ? "deleteFolderConfirm" : "deleteProjectConfirm"));
    if (!confirmed) return;
    const { error } = await deleteFileItem(item.id);
    if (error) {
      setLoadError(friendlyError(error, "delete"));
      return;
    }
    await refreshItems();
  };

  const enterFolder = (folder: FileItem) => {
    setLoading(true);
    setPath((current) => [...current, { id: folder.id, name: folder.name }]);
    setQuery("");
    setSelectedTags([]);
  };

  const goToCrumb = (index: number) => {
    setLoading(true);
    setPath((current) => current.slice(0, index + 1));
    setQuery("");
    setSelectedTags([]);
  };

  const startDragging = (event: DragEvent<HTMLElement>, item: FileItem) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/code-tutor-file-item", item.id);
    setDraggedItemId(item.id);
    setLoadError(null);
  };

  const finishDragging = () => {
    setDraggedItemId(null);
    setDropTargetId(null);
  };

  const moveDraggedItem = async (event: DragEvent<HTMLElement>, parentId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    const itemId = draggedItemId || event.dataTransfer.getData("text/code-tutor-file-item");
    const item = items.find((candidate) => candidate.id === itemId);
    finishDragging();
    if (!item || item.id === parentId || item.parent_id === parentId) return;

    setMoving(true);
    const { error } = await moveFileItem(item.id, parentId);
    if (error) setLoadError(friendlyError(error, "move"));
    else await refreshItems();
    setMoving(false);
  };

  const folders = filteredItems.filter((item) => item.kind === "folder");
  const projects = filteredItems.filter((item) => item.kind === "project");
  const hasFilters = Boolean(query.trim() || selectedTags.length);

  if (!user) {
    return (
      <section className="grid min-w-0 place-items-center bg-[#090d14] px-6 py-20 text-center">
        <div className="max-w-md rounded-2xl border border-white/8 bg-white/[0.02] px-8 py-10">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-amber-300/8 text-amber-200/80"><FolderIcon /></span>
          <p className="mt-5 text-sm leading-6 text-slate-400">{t("signInForFiles")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
      <FileNavigationSidebar
        folders={items.filter((item) => item.kind === "folder")}
        path={path}
        recentProjects={recentProjects}
        onFolder={enterFolder}
        onOpenProject={onOpenProject}
        onRoot={() => goToCrumb(-1)}
        onCrumb={goToCrumb}
      />
      <div className="min-w-0 bg-[#090d14] px-5 py-6 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <nav className="flex flex-wrap items-center gap-2" aria-label={t("folders")}>
            <button
              type="button"
              onClick={() => goToCrumb(-1)}
              onDragEnter={() => { if (draggedItemId) setDropTargetId("root"); }}
              onDragOver={(event) => { if (draggedItemId) event.preventDefault(); }}
              onDragLeave={() => { if (dropTargetId === "root") setDropTargetId(null); }}
              onDrop={(event) => void moveDraggedItem(event, null)}
              title={draggedItemId ? t("dropInRoot") : undefined}
              className={`rounded-lg text-xl font-semibold text-white transition-colors hover:text-cyan-100 ${dropTargetId === "root" ? "bg-cyan-300/10 ring-1 ring-cyan-300/35" : ""}`}
            >
              {t("fileRoot")}
            </button>
            {path.map((crumb, index) => (
              <span key={crumb.id} className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="text-slate-700">/</span>
                <button type="button" onClick={() => goToCrumb(index)} className={index === path.length - 1 ? "text-slate-300" : "hover:text-cyan-200"}>{crumb.name}</button>
              </span>
            ))}
          </nav>

        <div className="mt-5 rounded-2xl border border-white/8 bg-[#0d131d] p-4">
          <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            {t("fileSearchLabel")}
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("fileSearchPlaceholder")} className="mt-2 h-10 w-full rounded-lg border border-white/8 bg-[#090e16] px-3 text-xs font-normal normal-case tracking-normal text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-300/25" />
          </label>
          {availableTags.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] text-slate-600">{t("fileTagFilter")}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {availableTags.map((tag) => {
                  const active = effectiveTags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase());
                  return (
                    <button key={tag.toLocaleLowerCase()} type="button" aria-pressed={active} onClick={() => toggleTag(tag)} className={active ? "rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[10px] text-cyan-100" : "rounded-full border border-white/8 bg-white/[0.02] px-2.5 py-1 text-[10px] text-slate-500 hover:border-cyan-300/20 hover:text-cyan-200"}>
                      #{tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <p className="mt-3 text-[10px] leading-4 text-slate-600" role="status">
            {moving ? t("movingItem") : t("dragToMove")}
          </p>
        </div>

        {loadError && <p role="alert" className="mt-5 rounded-xl border border-rose-300/10 bg-rose-300/[0.035] p-3 text-xs text-rose-300">{loadError}</p>}
        {loading ? (
          <p className="py-16 text-center text-xs text-slate-600">{t("fileLoading")}</p>
        ) : hasFilters && filteredItems.length === 0 ? (
          <p className="py-16 text-center text-xs text-slate-600">{t("noFileResults")}</p>
        ) : (
          <>
            <div className="mt-9">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-white">{t("folders")}</p>
                <button type="button" onClick={() => { setDialogError(null); setDialog({ mode: "create", kind: "folder" }); }} className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-300/25 hover:text-cyan-200">
                  <span className="text-base leading-none" aria-hidden="true">+</span>{t("addFolder")}
                </button>
              </div>
              {folders.length === 0 ? <p className="mt-4 text-xs text-slate-700">{t("emptyFolders")}</p> : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {folders.map((folder) => (
                    <article
                      key={folder.id}
                      draggable={!moving}
                      onDragStart={(event) => startDragging(event, folder)}
                      onDragEnd={finishDragging}
                      onDragEnter={() => { if (draggedItemId && draggedItemId !== folder.id) setDropTargetId(folder.id); }}
                      onDragOver={(event) => { if (draggedItemId && draggedItemId !== folder.id) event.preventDefault(); }}
                      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null) && dropTargetId === folder.id) setDropTargetId(null); }}
                      onDrop={(event) => void moveDraggedItem(event, folder.id)}
                      title={dropTargetId === folder.id ? t("dropInFolder") : t("dragToMove")}
                      className={`group cursor-grab rounded-xl border bg-white/[0.025] p-4 transition-colors active:cursor-grabbing ${
                        dropTargetId === folder.id
                          ? "border-cyan-300/45 bg-cyan-300/[0.08] ring-1 ring-cyan-300/25"
                          : "border-white/8 hover:border-cyan-300/20 hover:bg-cyan-300/[0.035]"
                      } ${draggedItemId === folder.id ? "opacity-45" : ""}`}
                    >
                      <button type="button" onClick={() => enterFolder(folder)} className="flex w-full items-center gap-3 text-left">
                        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-300/8 text-amber-200/80"><FolderIcon /></span>
                        <span className="min-w-0"><span className="block truncate text-xs font-medium text-slate-300">{folder.name}</span><span className="mt-1 block text-[10px] text-slate-600">{t("folderType")}</span></span>
                      </button>
                      <ItemMeta item={folder} onTag={toggleTag} />
                      <ItemActions item={folder} onEdit={() => { setDialogError(null); setDialog({ mode: "edit", item: folder }); }} onDelete={() => void removeItem(folder)} />
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-10">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-white">{t("projects")}</p>
                <button type="button" onClick={() => { setDialogError(null); setDialog({ mode: "create", kind: "project" }); }} className="flex h-9 items-center gap-2 rounded-lg bg-cyan-400 px-4 text-xs font-bold text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.12)] transition-colors hover:bg-cyan-300">
                  <span className="text-base leading-none" aria-hidden="true">+</span>{t("addProject")}
                </button>
              </div>
              {projects.length === 0 ? <p className="mt-4 text-xs text-slate-700">{t("emptyProjects")}</p> : (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {projects.map((project) => (
                    <article
                      key={project.id}
                      draggable={!moving}
                      onDragStart={(event) => startDragging(event, project)}
                      onDragEnd={finishDragging}
                      title={t("dragToMove")}
                      className={`group cursor-grab rounded-2xl border border-white/8 bg-[#0d131d] p-5 transition-all active:cursor-grabbing hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-[#101925] ${draggedItemId === project.id ? "opacity-45" : ""}`}
                    >
                      <button type="button" onClick={() => onOpenProject({ id: project.id, name: project.name })} className="w-full text-left">
                        <div className="flex items-start justify-between gap-4"><span className="grid size-11 place-items-center rounded-xl border border-cyan-300/10 bg-cyan-300/[0.055] font-mono text-xs font-bold text-cyan-200">C++</span><span className="text-slate-600 group-hover:text-cyan-300" aria-hidden="true">↗</span></div>
                        <h2 className="mt-5 text-sm font-semibold text-slate-200">{project.name}</h2>
                      </button>
                      <ItemMeta item={project} onTag={toggleTag} />
                      <ItemActions item={project} onEdit={() => { setDialogError(null); setDialog({ mode: "edit", item: project }); }} onDelete={() => void removeItem(project)} />
                    </article>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        </div>
      </div>

      {dialog && <ItemDialog key={dialog.mode === "edit" ? dialog.item.id : dialog.kind} state={dialog} busy={saving} error={dialogError} onClose={() => setDialog(null)} onSubmit={submitDialog} />}
    </section>
  );
}

function FileNavigationSidebar({
  folders,
  path,
  recentProjects,
  onFolder,
  onOpenProject,
  onRoot,
  onCrumb,
}: {
  folders: FileItem[];
  path: FolderCrumb[];
  recentProjects: FileItem[];
  onFolder: (folder: FileItem) => void;
  onOpenProject: (project: FileProject) => void;
  onRoot: () => void;
  onCrumb: (index: number) => void;
}) {
  const { t } = useLanguage();

  return (
    <aside className="hidden border-r border-white/6 bg-[#0b1018] p-4 lg:block">
      <h2 className="text-sm font-semibold text-slate-200">{t("fileNavigation")}</h2>

      <div className="mt-5">
        <button type="button" onClick={onRoot} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-slate-400 hover:bg-white/[0.035] hover:text-cyan-200">
          <span className="text-amber-200/65"><FolderIcon /></span>
          <span className="truncate">{t("fileRoot")}</span>
        </button>
        {path.map((crumb, index) => (
          <button key={crumb.id} type="button" onClick={() => onCrumb(index)} className="flex w-full items-center gap-2 rounded-lg py-2 pl-6 pr-2 text-left text-[11px] text-slate-500 hover:bg-white/[0.035] hover:text-cyan-200">
            <span className="text-slate-700">└</span><span className="truncate">{crumb.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-7 border-t border-white/6 pt-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white">{t("currentFolders")}</p>
        <div className="mt-2 space-y-1">
          {folders.length === 0 ? <p className="px-2 py-2 text-[10px] leading-4 text-slate-700">{t("emptyFolders")}</p> : folders.slice(0, 6).map((folder) => (
            <button key={folder.id} type="button" onClick={() => onFolder(folder)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-slate-500 hover:bg-white/[0.035] hover:text-cyan-200">
              <span className="text-amber-200/50"><FolderIcon /></span><span className="truncate">{folder.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-7 border-t border-white/6 pt-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white">{t("recentProjects")}</p>
        <div className="mt-2 space-y-1">
          {recentProjects.length === 0 ? <p className="px-2 py-2 text-[10px] leading-4 text-slate-700">{t("noRecentProjects")}</p> : recentProjects.map((project) => (
            <button key={project.id} type="button" onClick={() => onOpenProject({ id: project.id, name: project.name })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-slate-500 hover:bg-white/[0.035] hover:text-cyan-200">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-cyan-300/[0.055] font-mono text-[8px] text-cyan-200/70">C++</span><span className="truncate">{project.name}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function ItemMeta({ item, onTag }: { item: FileItem; onTag: (tag: string) => void }) {
  if (item.tags.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {item.tags.map((tag) => (
        <button key={tag.toLocaleLowerCase()} type="button" onClick={() => onTag(tag)} className="rounded-full bg-white/[0.035] px-2 py-1 text-[10px] text-cyan-200/65 hover:bg-cyan-300/10 hover:text-cyan-100">#{tag}</button>
      ))}
    </div>
  );
}

function ItemActions({ item, onEdit, onDelete }: { item: FileItem; onEdit: () => void; onDelete: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="mt-4 flex items-center gap-3 border-t border-white/5 pt-3 text-[10px]">
      <button type="button" onClick={onEdit} className="text-slate-600 hover:text-cyan-200">{t("editItem")}</button>
      <button type="button" onClick={onDelete} className="text-slate-700 hover:text-rose-300">{t("deleteItem")}</button>
      <span className="ml-auto text-slate-700">{t(item.kind === "folder" ? "folderType" : "projectType")}</span>
    </div>
  );
}
