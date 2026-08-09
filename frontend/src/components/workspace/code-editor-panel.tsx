"use client";

import type { BeforeMount, OnMount } from "@monaco-editor/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IDisposable } from "monaco-editor";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  defaultCppCode,
  type FileProject,
  loadProjectContent,
  saveProjectContent,
} from "@/lib/file-items";
import { useLanguage } from "@/lib/language-context";

function EditorLoading() {
  const { language } = useLanguage();
  return (
    <div className="grid h-full place-items-center bg-[#0c111b] font-mono text-xs text-slate-600">
      {language === "zh-Hant" ? "正在載入編輯器…" : "Loading editor…"}
    </div>
  );
}

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <EditorLoading />,
});

type SaveStatus = "saved" | "saving" | "failed";

type CodeEditorPanelProps = {
  isRunning: boolean;
  onRun: (code: string) => void | Promise<void>;
  project: FileProject;
};

export function CodeEditorPanel({ isRunning, onRun, project }: CodeEditorPanelProps) {
  const { t } = useLanguage();
  const [code, setCode] = useState(defaultCppCode);
  const [cursor, setCursor] = useState({ lineNumber: 1, column: 1 });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [clearStep, setClearStep] = useState<0 | 1 | 2>(0);
  const cursorListener = useRef<IDisposable | null>(null);
  const hasLoadedSavedCode = useRef(false);

  const persistCode = useCallback(async (nextCode: string) => {
    try {
      const { error } = await saveProjectContent(project.id, nextCode);
      if (error) throw error;
      setSaveStatus("saved");
    } catch {
      setSaveStatus("failed");
    }
  }, [project.id]);

  useEffect(() => {
    return () => cursorListener.current?.dispose();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadProjectContent(project.id).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setSaveStatus("failed");
      } else {
        setCode(typeof data?.content === "string" ? data.content : defaultCppCode);
        setSaveStatus("saved");
      }
      hasLoadedSavedCode.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    if (!hasLoadedSavedCode.current) return;

    setSaveStatus("saving");
    const timer = window.setTimeout(() => void persistCode(code), 600);
    return () => window.clearTimeout(timer);
  }, [code, persistCode]);

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
    cursorListener.current = editor.onDidChangeCursorPosition(({ position }) => {
      setCursor(position);
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void persistCode(editor.getValue());
    });
  };

  const openClearDialog = () => {
    setClearStep(1);
  };

  const confirmClear = () => {
    setCode("");
    void persistCode("");
    setClearStep(0);
  };

  const statusLabel = {
    saved: t("saved"),
    saving: t("saving"),
    failed: t("saveFailed"),
  }[saveStatus];

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#0c111b]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/8 bg-[#0a0f17] pr-3">
        <div className="flex h-full items-center border-r border-white/8 bg-[#0c111b] px-4 text-xs text-slate-300">
          <span className="max-w-28 truncate text-slate-500 sm:max-w-48">{project.name}</span>
          <span className="mx-2 text-slate-700">/</span>
          main.cpp
          <span
            className={`ml-3 size-1.5 rounded-full ${
              saveStatus === "saved"
                ? "bg-emerald-400"
                : saveStatus === "saving"
                  ? "animate-pulse bg-amber-300"
                  : "bg-rose-400"
            }`}
            aria-hidden="true"
          />
          <span
            className={`ml-1.5 text-[9px] ${
              saveStatus === "failed" ? "text-rose-400" : "text-slate-600"
            }`}
            role="status"
          >
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] text-slate-600 sm:inline">C++ 20</span>
          <button
            type="button"
            onClick={openClearDialog}
            className="hidden h-7 rounded-lg border border-white/8 px-2.5 text-[10px] text-slate-500 transition-colors hover:border-white/15 hover:text-slate-300 sm:block"
            title={t("clearCodeTitle")}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => void onRun(code)}
            disabled={isRunning}
            className="flex h-7 items-center gap-2 rounded-lg bg-cyan-400 px-3 text-[11px] font-bold text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.12)] transition-opacity disabled:cursor-wait disabled:opacity-60"
          >
            <span aria-hidden="true">{isRunning ? "…" : "▶"}</span>
            Run
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <MonacoEditor
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          onChange={(value) => setCode(value ?? "")}
          path="file:///main.cpp"
          language="cpp"
          value={code}
          theme="code-tutor-dark"
          options={{
            accessibilitySupport: "auto",
          ariaLabel: t("editorLabel"),
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
            scrollbar: {
              horizontalScrollbarSize: 8,
              verticalScrollbarSize: 8,
            },
            smoothScrolling: true,
            tabSize: 4,
            wordWrap: "off",
          }}
        />
      </div>

      <div className="flex h-7 shrink-0 items-center justify-between border-t border-white/8 bg-[#0a0f17] px-3 font-mono text-[9px] text-slate-600">
        <span>
          Ln {cursor.lineNumber}, Col {cursor.column}
        </span>
        <div className="flex gap-4">
          <span>{t("spaces")}</span>
          <span>UTF-8</span>
        </div>
      </div>

      <ConfirmDialog
        open={clearStep !== 0}
        title={t(clearStep === 2 ? "clearCodeFinalTitle" : "clearCodeTitle")}
        description={t(clearStep === 2 ? "clearCodeFinalConfirm" : "clearCodeFirstConfirm")}
        confirmLabel={t(clearStep === 2 ? "confirmClearAll" : "continueClear")}
        cancelLabel={t("cancel")}
        closeLabel={t("closeDialog")}
        tone={clearStep === 2 ? "danger" : "default"}
        onClose={() => setClearStep(0)}
        onConfirm={() => {
          if (clearStep === 1) setClearStep(2);
          else confirmClear();
        }}
      />
    </section>
  );
}
