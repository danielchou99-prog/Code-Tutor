"use client";

import { useMemo, useState } from "react";

const problems = [
  {
    id: "P001",
    title: "在排序陣列中尋找目標",
    description: "練習縮小搜尋範圍，找出指定數字的位置。",
    difficulty: "中等",
    tags: ["#APCS中高級", "#二分搜", "#陣列"],
  },
  {
    id: "P002",
    title: "迷宮的最短路徑",
    description: "從起點走到終點，計算最少需要經過幾個格子。",
    difficulty: "中等",
    tags: ["#APCS中高級", "#BFS", "#圖論"],
  },
  {
    id: "P003",
    title: "連續數字的最大總和",
    description: "從數列中找出總和最大的連續區間。",
    difficulty: "入門",
    tags: ["#APCS初級", "#動態規劃", "#陣列"],
  },
  {
    id: "P004",
    title: "貨物裝箱最佳化",
    description: "在容量限制下，選出總價值最高的物品組合。",
    difficulty: "進階",
    tags: ["#APCS高級", "#動態規劃", "#背包問題"],
  },
];

const suggestedTags = ["#全部", "#APCS中高級", "#二分搜", "#BFS", "#動態規劃", "#圖論"];

export function ProblemsPage() {
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("#全部");

  const filteredProblems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-Hant");
    return problems.filter((problem) => {
      const matchesTag = selectedTag === "#全部" || problem.tags.includes(selectedTag);
      const searchableText = [problem.title, problem.description, ...problem.tags]
        .join(" ")
        .toLocaleLowerCase("zh-Hant");
      return matchesTag && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [query, selectedTag]);

  return (
    <section className="flex-1 bg-[#090d14] px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/70">Problem library</p>
          <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">尋找適合你的練習題</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">用程度與演算法標籤縮小範圍，快速找到下一題。</p>
        </div>

        <label className="mt-7 flex max-w-2xl items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 focus-within:border-cyan-300/30">
          <span className="text-slate-600" aria-hidden="true">⌕</span>
          <span className="sr-only">搜尋題目或標籤</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋題目、#APCS中高級、#二分搜…"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
          />
        </label>

        <div className="mt-5 flex flex-wrap gap-2" aria-label="題目標籤篩選">
          {suggestedTags.map((tag) => {
            const active = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedTag(tag)}
                className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                  active
                    ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-200"
                    : "border-white/8 bg-white/[0.025] text-slate-500 hover:border-white/15 hover:text-slate-300"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>

        <div className="mt-9 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">題目列表</h2>
          <span className="text-[11px] text-slate-600">找到 {filteredProblems.length} 題</span>
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
                        problem.difficulty === "進階"
                          ? "bg-rose-400/8 text-rose-300"
                          : problem.difficulty === "中等"
                            ? "bg-amber-300/8 text-amber-200"
                            : "bg-emerald-400/8 text-emerald-300"
                      }`}>
                        {problem.difficulty}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-slate-200 group-hover:text-white">{problem.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{problem.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {problem.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-white/[0.035] px-2.5 py-1 text-[10px] text-cyan-200/70">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-slate-600 transition-colors group-hover:text-cyan-300">查看題目 →</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-white/10 py-16 text-center">
            <p className="text-sm text-slate-400">找不到符合條件的題目</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelectedTag("#全部");
              }}
              className="mt-3 text-xs text-cyan-300 hover:text-cyan-200"
            >
              清除搜尋條件
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
