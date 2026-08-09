"use client";

import { useMemo, useState } from "react";

import { type Language, useLanguage } from "@/lib/language-context";

type TagId =
  | "apcsMiddleAdvanced"
  | "binarySearch"
  | "array"
  | "bfs"
  | "graph"
  | "dynamicProgramming"
  | "apcsBeginner"
  | "apcsAdvanced"
  | "knapsack";

type Difficulty = "beginner" | "medium" | "advanced";

const tagLabels: Record<Language, Record<TagId | "all", string>> = {
  "zh-Hant": {
    all: "#全部",
    apcsMiddleAdvanced: "#APCS中高級",
    binarySearch: "#二分搜",
    array: "#陣列",
    bfs: "#BFS",
    graph: "#圖論",
    dynamicProgramming: "#動態規劃",
    apcsBeginner: "#APCS初級",
    apcsAdvanced: "#APCS高級",
    knapsack: "#背包問題",
  },
  en: {
    all: "#All",
    apcsMiddleAdvanced: "#APCSIntermediateAdvanced",
    binarySearch: "#BinarySearch",
    array: "#Array",
    bfs: "#BFS",
    graph: "#Graph",
    dynamicProgramming: "#DynamicProgramming",
    apcsBeginner: "#APCSBeginner",
    apcsAdvanced: "#APCSAdvanced",
    knapsack: "#Knapsack",
  },
};

const difficultyLabels: Record<Language, Record<Difficulty, string>> = {
  "zh-Hant": { beginner: "入門", medium: "中等", advanced: "進階" },
  en: { beginner: "Beginner", medium: "Medium", advanced: "Advanced" },
};

const problems: Array<{
  id: string;
  title: Record<"zh" | "en", string>;
  description: Record<"zh" | "en", string>;
  difficulty: Difficulty;
  tags: TagId[];
}> = [
  {
    id: "P001",
    title: { zh: "在排序陣列中尋找目標", en: "Find a Target in a Sorted Array" },
    description: {
      zh: "練習縮小搜尋範圍，找出指定數字的位置。",
      en: "Practice narrowing the search range to locate a target value.",
    },
    difficulty: "medium",
    tags: ["apcsMiddleAdvanced", "binarySearch", "array"],
  },
  {
    id: "P002",
    title: { zh: "迷宮的最短路徑", en: "Shortest Path Through a Maze" },
    description: {
      zh: "從起點走到終點，計算最少需要經過幾個格子。",
      en: "Find the minimum number of cells needed to reach the exit.",
    },
    difficulty: "medium",
    tags: ["apcsMiddleAdvanced", "bfs", "graph"],
  },
  {
    id: "P003",
    title: { zh: "連續數字的最大總和", en: "Maximum Contiguous Sum" },
    description: {
      zh: "從數列中找出總和最大的連續區間。",
      en: "Find the contiguous segment with the largest sum.",
    },
    difficulty: "beginner",
    tags: ["apcsBeginner", "dynamicProgramming", "array"],
  },
  {
    id: "P004",
    title: { zh: "貨物裝箱最佳化", en: "Optimize Cargo Packing" },
    description: {
      zh: "在容量限制下，選出總價值最高的物品組合。",
      en: "Choose the most valuable combination under a capacity limit.",
    },
    difficulty: "advanced",
    tags: ["apcsAdvanced", "dynamicProgramming", "knapsack"],
  },
];

const suggestedTags: Array<TagId | "all"> = [
  "all",
  "apcsMiddleAdvanced",
  "binarySearch",
  "bfs",
  "dynamicProgramming",
  "graph",
];

const hashtagPattern = /#[^\s#]+/g;

function findTagId(label: string): TagId | null {
  const normalizedLabel = label.toLocaleLowerCase();
  for (const languageLabels of Object.values(tagLabels)) {
    for (const [tagId, localizedLabel] of Object.entries(languageLabels)) {
      if (
        tagId !== "all" &&
        localizedLabel.toLocaleLowerCase() === normalizedLabel
      ) {
        return tagId as TagId;
      }
    }
  }
  return null;
}

export function ProblemsPage() {
  const { language, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<TagId[]>([]);
  const localizedTags = tagLabels[language];
  const textKey = language === "zh-Hant" ? "zh" : "en";

  const { effectiveTags, hasUnknownHashtag } = useMemo(() => {
    const queryHashtags = query.match(hashtagPattern) ?? [];
    const queryTagIds = queryHashtags.map(findTagId);
    const recognizedQueryTags = queryTagIds.filter(
      (tag): tag is TagId => tag !== null,
    );
    return {
      effectiveTags: [...new Set([...selectedTags, ...recognizedQueryTags])],
      hasUnknownHashtag: queryTagIds.some((tag) => tag === null),
    };
  }, [query, selectedTags]);

  const filteredProblems = useMemo(() => {
    const normalizedQuery = query
      .replace(hashtagPattern, " ")
      .trim()
      .toLocaleLowerCase(language);
    return problems.filter((problem) => {
      const matchesTags =
        !hasUnknownHashtag &&
        effectiveTags.every((tag) => problem.tags.includes(tag));
      const searchableText = [
        problem.title[textKey],
        problem.description[textKey],
        ...problem.tags.map((tag) => localizedTags[tag]),
      ]
        .join(" ")
        .toLocaleLowerCase(language);
      return matchesTags && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [effectiveTags, hasUnknownHashtag, language, localizedTags, query, textKey]);

  const toggleTag = (tag: TagId | "all") => {
    if (tag === "all") {
      setSelectedTags([]);
      setQuery((current) => current.replace(hashtagPattern, " ").replace(/\s+/g, " ").trim());
      return;
    }

    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((selectedTag) => selectedTag !== tag)
        : [...current, tag],
    );
  };

  return (
    <section className="flex-1 bg-[#090d14] px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/70">{t("problemLibrary")}</p>
          <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">{t("problemHeroTitle")}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">{t("problemHeroDetail")}</p>
        </div>

        <label className="mt-7 flex max-w-2xl items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 focus-within:border-cyan-300/30">
          <span className="text-slate-600" aria-hidden="true">⌕</span>
          <span className="sr-only">{t("problemSearchLabel")}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("problemSearchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
          />
        </label>

        <div className="mt-5 flex flex-wrap gap-2" aria-label={t("problemTagFilter")}>
          {suggestedTags.map((tag) => {
            const active = tag === "all" ? effectiveTags.length === 0 : effectiveTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => toggleTag(tag)}
                className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                  active
                    ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-200"
                    : "border-white/8 bg-white/[0.025] text-slate-500 hover:border-white/15 hover:text-slate-300"
                }`}
              >
                {localizedTags[tag]}
              </button>
            );
          })}
        </div>

        <div className="mt-9 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">{t("problemList")}</h2>
          <span className="text-[11px] text-slate-600">
            {t("foundProblems").replace("{count}", String(filteredProblems.length))}
          </span>
        </div>

        {filteredProblems.length > 0 ? (
          <div className="mt-3 grid gap-3">
            {filteredProblems.map((problem) => (
              <button
                key={problem.id}
                type="button"
                className="group rounded-2xl border border-white/8 bg-[#0d131d] p-5 text-left transition-colors hover:border-cyan-300/20 hover:bg-[#101925]"
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-slate-600">{problem.id}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                        problem.difficulty === "advanced"
                          ? "bg-rose-400/8 text-rose-300"
                          : problem.difficulty === "medium"
                            ? "bg-amber-300/8 text-amber-200"
                            : "bg-emerald-400/8 text-emerald-300"
                      }`}>
                        {difficultyLabels[language][problem.difficulty]}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-slate-200 group-hover:text-white">{problem.title[textKey]}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{problem.description[textKey]}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {problem.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-white/[0.035] px-2.5 py-1 text-[10px] text-cyan-200/70">
                          {localizedTags[tag]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-slate-600 transition-colors group-hover:text-cyan-300">{t("viewProblem")}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-white/10 py-16 text-center">
            <p className="text-sm text-slate-400">{t("noProblems")}</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelectedTags([]);
              }}
              className="mt-3 text-xs text-cyan-300 hover:text-cyan-200"
            >
              {t("clearFilters")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
