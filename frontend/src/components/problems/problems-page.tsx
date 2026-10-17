"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { loadPageState, pageStateKey, savePageState } from "@/lib/page-state";
import { migrateLocalProblemCodeDraft } from "@/lib/problem-code-drafts";
import { loadProblems } from "@/lib/problem-repository";

import { getProblemTagLabel, type Problem, type ProblemDifficulty, type ProblemStatus, type ProblemTag, problems } from "./problem-data";
import { ProblemSolverPage } from "./problem-solver-page";

const hashtagPattern = /#[^\s#]+/gu;
const selectedProblemStorageKey = "code-tutor:selected-problem";

type ProblemListState = {
  difficulty: ProblemDifficulty | "all";
  query: string;
  selectedTags: ProblemTag[];
  status: ProblemStatus | "all";
};

function isProblemListState(value: unknown): value is ProblemListState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<ProblemListState>;
  return typeof state.query === "string"
    && ["all", "easy", "medium", "hard"].includes(state.difficulty ?? "")
    && ["all", "solved", "attempted", "unsolved"].includes(state.status ?? "")
    && Array.isArray(state.selectedTags)
    && state.selectedTags.every((tag) => typeof tag === "string");
}

export function ProblemsPage({ resetListRevision = 0 }: { resetListRevision?: number }) {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const zh = language === "zh-Hant";
  const textKey = zh ? "zh" : "en";
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null);
  const [availableProblems, setAvailableProblems] = useState<Problem[]>(problems);
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<ProblemDifficulty | "all">("all");
  const [status, setStatus] = useState<ProblemStatus | "all">("all");
  const [selectedTags, setSelectedTags] = useState<ProblemTag[]>([]);
  const previousResetRevision = useRef(resetListRevision);
  const [hydratedStateKey, setHydratedStateKey] = useState<string | null>(null);
  const listStateKey = pageStateKey("problems:list", user?.id);
  const allTags = useMemo(() => [...new Set(availableProblems.flatMap((problem) => problem.tags))], [availableProblems]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = loadPageState(listStateKey, isProblemListState);
      if (restored) {
        setQuery(restored.query);
        setDifficulty(restored.difficulty);
        setStatus(restored.status);
        setSelectedTags(restored.selectedTags);
      }
      setHydratedStateKey(listStateKey);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [listStateKey]);

  useEffect(() => {
    if (hydratedStateKey !== listStateKey) return;
    savePageState(listStateKey, { difficulty, query, selectedTags, status });
  }, [difficulty, hydratedStateKey, listStateKey, query, selectedTags, status]);

  useEffect(() => {
    let cancelled = false;
    void loadProblems().then((result) => {
      if (cancelled) return;
      const storedProblemId = window.localStorage.getItem(selectedProblemStorageKey);
      const replacementId = storedProblemId ? result.idAliases[storedProblemId] : undefined;
      if (storedProblemId && replacementId) {
        migrateLocalProblemCodeDraft(storedProblemId, replacementId);
        window.localStorage.setItem(selectedProblemStorageKey, replacementId);
      }
      setAvailableProblems(result.problems);
      setSelectedProblem((current) => {
        if (!current) return current;
        const currentId = result.idAliases[current.id] ?? current.id;
        return result.problems.find((problem) => problem.id === currentId) ?? current;
      });
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const storedProblemId = window.localStorage.getItem(selectedProblemStorageKey);
      const storedProblem = availableProblems.find((problem) => problem.id === storedProblemId);
      if (storedProblem) setSelectedProblem(storedProblem);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [availableProblems]);

  useEffect(() => {
    if (previousResetRevision.current === resetListRevision) return;
    previousResetRevision.current = resetListRevision;
    window.localStorage.removeItem(selectedProblemStorageKey);
    setSelectedProblem(null);
  }, [resetListRevision]);

  const queryTags = useMemo(() => {
    return (query.match(hashtagPattern) ?? []).map((token) => {
      const normalized = token.slice(1).toLocaleLowerCase(language).replaceAll("-", "");
      return allTags.find((tag) => {
        const label = getProblemTagLabel(tag);
        const candidates = [tag, label.zh, label.en]
          .map((label) => label.toLocaleLowerCase(language).replaceAll(" ", "").replaceAll("-", ""));
        return candidates.includes(normalized);
      }) ?? null;
    });
  }, [allTags, language, query]);

  const filteredProblems = useMemo(() => {
    const searchText = query.replace(hashtagPattern, " ").trim().toLocaleLowerCase(language);
    const effectiveTags = [...new Set([...selectedTags, ...queryTags.filter((tag): tag is ProblemTag => tag !== null)])];
    const hasUnknownTag = queryTags.some((tag) => tag === null);

    return availableProblems.filter((problem) => {
      if (difficulty !== "all" && problem.difficulty !== difficulty) return false;
      if (status !== "all" && problem.status !== status) return false;
      if (hasUnknownTag || !effectiveTags.every((tag) => problem.tags.includes(tag))) return false;
      if (!searchText) return true;
      const searchable = [problem.id, problem.title[textKey], problem.summary[textKey], ...problem.tags.flatMap((tag) => {
        const label = getProblemTagLabel(tag);
        return [label.zh, label.en];
      })]
        .join(" ")
        .toLocaleLowerCase(language);
      return searchable.includes(searchText);
    });
  }, [availableProblems, difficulty, language, query, queryTags, selectedTags, status, textKey]);

  if (selectedProblem) {
    return <ProblemSolverPage key={selectedProblem.id} problem={selectedProblem} onBack={() => {
      window.localStorage.removeItem(selectedProblemStorageKey);
      setSelectedProblem(null);
    }} onSubmitted={(result) => {
      const nextStatus: ProblemStatus = result.status === "accepted" ? "solved" : "attempted";
      setAvailableProblems((current) => current.map((problem) => problem.id === result.problem_id ? { ...problem, status: nextStatus } : problem));
      setSelectedProblem((current) => current?.id === result.problem_id ? { ...current, status: nextStatus } : current);
    }} />;
  }

  const clearFilters = () => {
    setQuery("");
    setDifficulty("all");
    setStatus("all");
    setSelectedTags([]);
  };

  return (
    <section className="flex-1 bg-[#090d14] px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/70">{t("problemLibrary")}</p>
            <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">{t("findYourNextProblem")}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">{t("searchAndFilterByDifficulty")}</p>
          </div>
          <div className="flex gap-6 text-center">
            <Metric value={String(availableProblems.length)} label={t("problems2")} />
            <Metric value={String(availableProblems.filter((problem) => problem.status === "solved").length)} label={t("solved")} />
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/8 bg-[#0d131d] p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
            <label className="flex h-11 items-center gap-3 rounded-xl border border-white/10 bg-[#090e16] px-4 focus-within:border-cyan-300/30">
              <SearchIcon />
              <span className="sr-only">{t("problemSearchLabel")}</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchIdTitleBinarysearchArray")} className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600" />
            </label>
            <FilterSelect label={t("difficulty")} value={difficulty} onChange={(value) => setDifficulty(value as ProblemDifficulty | "all")} options={[
              ["all", t("allDifficulties")], ["easy", t("easy")], ["medium", t("medium")], ["hard", t("hard")],
            ]} />
            <FilterSelect label={t("status")} value={status} onChange={(value) => setStatus(value as ProblemStatus | "all")} options={[
              ["all", t("allStatuses")], ["solved", t("solved")], ["attempted", t("attempted")], ["unsolved", t("unsolved")],
            ]} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">Tags</span>
            {allTags.map((tag) => {
              const active = selectedTags.includes(tag);
              return <button key={tag} type="button" aria-pressed={active} onClick={() => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} className={`rounded-full border px-3 py-1.5 text-[10px] transition-colors ${active ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-200" : "border-white/8 bg-white/[0.02] text-slate-500 hover:border-white/15 hover:text-slate-300"}`}>#{getProblemTagLabel(tag)[textKey]}</button>;
            })}
            {(query || difficulty !== "all" || status !== "all" || selectedTags.length > 0) ? <button type="button" onClick={clearFilters} className="ml-auto px-2 py-1 text-[10px] text-slate-600 hover:text-cyan-300">{t("clearFilters2")}</button> : null}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">{t("problemList")}</h2>
          <span className="text-[10px] text-slate-600">{t("found", { count: filteredProblems.length })}</span>
        </div>

        {filteredProblems.length ? (
          <div className="mt-4 grid grid-cols-1 gap-x-3 gap-y-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {filteredProblems.map((problem) => <ProblemCard key={problem.id} problem={problem} textKey={textKey} onOpen={() => {
              window.localStorage.setItem(selectedProblemStorageKey, problem.id);
              setSelectedProblem(problem);
            }} />)}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-white/10 py-16 text-center">
            <p className="text-sm font-semibold text-slate-300">{t("noProblems")}</p>
            <p className="mt-2 text-xs text-slate-600">{t("tryRemovingSomeTagsOr")}</p>
            <button type="button" onClick={clearFilters} className="mt-4 text-xs text-cyan-300 hover:text-cyan-200">{t("clearFilters2")}</button>
          </div>
        )}
      </div>
    </section>
  );
}

function ProblemCard({ problem, textKey, onOpen }: { problem: Problem; textKey: "zh" | "en"; onOpen: () => void }) {
  const { t } = useLanguage();
  const difficultyLabel = { easy: t("easy"), medium: t("medium"), hard: t("hard") }[problem.difficulty];
  const statusLabel = { solved: t("solved"), attempted: t("attempted"), unsolved: t("unsolved") }[problem.status];
  return (
    <article className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t("openProblem")} #${problem.id} ${problem.title[textKey]}`}
        className="group aspect-[2/1] w-full rounded-2xl border border-white/9 bg-[#0d131d] p-3 text-left shadow-[0_10px_24px_rgba(0,0,0,0.14)] transition-[border-color,background-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-[#101925] hover:shadow-[0_16px_34px_rgba(0,0,0,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
      >
        <span className="flex h-full min-h-0 w-full flex-col">
          <span className="flex w-full items-start justify-between gap-2">
            <span className="font-mono text-[10px] text-slate-500">#{problem.id}</span>
            <span className={`flex shrink-0 items-center gap-1.5 text-[9px] font-semibold ${problem.status === "solved" ? "text-emerald-300" : problem.status === "attempted" ? "text-amber-200" : "text-slate-600"}`}>
              <span aria-hidden="true">{problem.status === "solved" ? "✓" : problem.status === "attempted" ? "◐" : "○"}</span>{statusLabel}
            </span>
          </span>
          <strong className="mt-2 line-clamp-2 text-xs leading-4 text-slate-100 group-hover:text-white xl:text-sm xl:leading-5">{problem.title[textKey]}</strong>
          <span className="mt-auto flex w-full items-end justify-between gap-2 pt-2">
            <span className={`w-fit rounded-full px-2.5 py-1 text-[9px] font-semibold ${problem.difficulty === "easy" ? "bg-emerald-400/8 text-emerald-300" : problem.difficulty === "medium" ? "bg-amber-300/8 text-amber-200" : "bg-rose-400/8 text-rose-300"}`}>{difficultyLabel}</span>
            <span aria-hidden="true" className="text-xs text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-300">→</span>
          </span>
        </span>
      </button>
      <div className="mt-2 flex min-h-5 flex-wrap justify-center gap-x-2 gap-y-1 px-1 text-center">
        {problem.tags.map((tag) => <span key={tag} className="text-[9px] font-medium text-cyan-300/75">#{getProblemTagLabel(tag)[textKey]}</span>)}
      </div>
    </article>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div><strong className="block font-mono text-xl text-white">{value}</strong><span className="mt-1 block text-[9px] uppercase tracking-wider text-slate-600">{label}</span></div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="relative"><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-[#090e16] px-4 pr-9 text-xs text-slate-300 outline-none focus:border-cyan-300/30">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select><span aria-hidden="true" className="pointer-events-none absolute right-4 top-3.5 text-[10px] text-slate-600">⌄</span></label>;
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-slate-600" strokeWidth="1.7"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
}
