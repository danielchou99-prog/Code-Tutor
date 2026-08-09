"use client";

import { useState } from "react";

import { useLanguage } from "@/lib/language-context";

type FileHomeProps = {
  onOpenProject: (projectName: string) => void;
};

const initialFolders = [
  { zh: "演算法練習", en: "Algorithm Practice" },
  { zh: "課堂筆記", en: "Class Notes" },
];

const projects = [
  {
    name: "C++ 基礎練習",
    description: { zh: "目前的 main.cpp 與 Online Compiler", en: "Your current main.cpp and Online Compiler" },
    updatedAt: { zh: "剛剛更新", en: "Updated just now" },
  },
  {
    name: "APCS 題目整理",
    description: { zh: "記錄 APCS 題目的解法與測試", en: "Solutions and tests for APCS problems" },
    updatedAt: { zh: "昨天更新", en: "Updated yesterday" },
  },
];

function FolderIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="1.6">
      <path d="M3.5 7.2h6l1.6 1.9h9.4v8.7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.2Z" />
      <path d="M3.5 7.2V5.9a1.7 1.7 0 0 1 1.7-1.7h4.2l1.6 1.9h7.3a2.2 2.2 0 0 1 2.2 2.2v.8" />
    </svg>
  );
}

export function FileHome({ onOpenProject }: FileHomeProps) {
  const { language, t } = useLanguage();
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const folderNames = [
    ...initialFolders.map((folder) => language === "zh-Hant" ? folder.zh : folder.en),
    ...customFolders,
  ];

  const addFolder = () => {
    const name = window.prompt(t("folderPrompt"));
    const normalizedName = name?.trim();
    if (!normalizedName || folderNames.includes(normalizedName)) return;
    setCustomFolders((current) => [...current, normalizedName]);
  };

  const addProject = () => {
    const name = window.prompt(t("projectPrompt"), t("unnamedProject"));
    const normalizedName = name?.trim();
    if (normalizedName) onOpenProject(normalizedName);
  };

  return (
    <section className="min-w-0 bg-[#090d14] px-5 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={addFolder}
            className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-300/25 hover:text-cyan-200"
          >
            <span className="text-base leading-none" aria-hidden="true">+</span>
            {t("addFolder")}
          </button>
          <button
            type="button"
            onClick={addProject}
            className="flex h-9 items-center gap-2 rounded-lg bg-cyan-400 px-4 text-xs font-bold text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.12)] transition-colors hover:bg-cyan-300"
          >
            <span className="text-base leading-none" aria-hidden="true">+</span>
            {t("addProject")}
          </button>
        </div>

        <div className="mt-9">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">{t("folders")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {folderNames.map((folder) => (
              <button
                key={folder}
                type="button"
                className="group flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-4 text-left transition-colors hover:border-cyan-300/20 hover:bg-cyan-300/[0.035]"
              >
                <span className="grid size-10 place-items-center rounded-lg bg-amber-300/8 text-amber-200/80 group-hover:bg-amber-300/12">
                  <FolderIcon />
                </span>
                <span>
                  <span className="block text-xs font-medium text-slate-300">{folder}</span>
                  <span className="mt-1 block text-[10px] text-slate-600">{t("folderType")}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">{t("projects")}</p>
              <h1 className="mt-2 text-xl font-semibold text-white">{t("yourProjects")}</h1>
            </div>
            <p className="hidden text-[11px] text-slate-600 sm:block">{t("selectProjectHint")}</p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <button
                key={project.name}
                type="button"
                onClick={() => onOpenProject(project.name)}
                className="group rounded-2xl border border-white/8 bg-[#0d131d] p-5 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-[#101925]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-xl border border-cyan-300/10 bg-cyan-300/[0.055] font-mono text-xs font-bold text-cyan-200">
                    C++
                  </span>
                  <span className="text-slate-600 transition-colors group-hover:text-cyan-300" aria-hidden="true">↗</span>
                </div>
                <h2 className="mt-5 text-sm font-semibold text-slate-200">{project.name}</h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {language === "zh-Hant" ? project.description.zh : project.description.en}
                </p>
                <p className="mt-5 text-[10px] text-slate-700">
                  {language === "zh-Hant" ? project.updatedAt.zh : project.updatedAt.en}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
