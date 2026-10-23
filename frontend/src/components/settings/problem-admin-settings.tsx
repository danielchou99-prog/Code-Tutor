"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { streamAiTutor } from "@/lib/ai-tutor-api";
import {
  type AdminLocalizedText,
  type AdminProblem,
  type AdminProblemCreate,
  type AdminProblemSummary,
  type AiGeneratedTestsResponse,
  type GeneratedCasesResponse,
  type GenerationStrategy,
  type GenerationVersionMetadata,
  applyGenerationBatch,
  createAdminProblem,
  generateHiddenTests,
  generateHiddenTestsWithAi,
  getAdminProblem,
  listGenerationVersions,
  listAdminProblems,
  saveGenerationVersion,
  saveAdminProblem,
  translateAdminProblem,
} from "@/lib/problem-admin-api";
import { clearPageState, loadPageState, pageStateKey, savePageState } from "@/lib/page-state";
import { scoringGroupLabel } from "@/lib/scoring-group-label";
import { useLanguage } from "@/lib/language-context";

const inputClass = "mt-2 h-10 w-full rounded-xl border border-white/8 bg-[#090f18] px-3 text-xs text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-300/30";
const textareaClass = "mt-2 min-h-24 w-full resize-y rounded-xl border border-white/8 bg-[#090f18] p-3 font-mono text-[11px] leading-5 text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-300/30";
const panelClass = "rounded-2xl border border-white/8 bg-[#0d141f] p-4 sm:p-5";

const blankLocalized = (): AdminLocalizedText => ({ zh: "", en: "" });

function blankProblem(): AdminProblem {
  return {
    id: "",
    title: blankLocalized(),
    summary: blankLocalized(),
    description: [blankLocalized()],
    input_format: blankLocalized(),
    output_format: blankLocalized(),
    constraints: [],
    starter_code: {
      cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"Hello, World!\" << '\\n';\n    return 0;\n}\n",
      python: "print(\"Hello, World!\")\n",
    },
    difficulty: "easy",
    apcs_level: null,
    time_limit_ms: 1000,
    memory_limit_mb: 256,
    published: false,
    tags: [{ slug: "implementation", label_zh: "實作", label_en: "Implementation" }],
    samples: [{ input: "", output: "", explanation: null }],
    test_groups: [{
      name: { zh: "完整測資", en: "Full tests" },
      condition: { zh: "無額外限制", en: "No additional constraints" },
      score_percent: 100,
      cases: [{ input: "", expected_output: "", score_points: 100 }],
    }],
  };
}

type SafeAdminProblemDraft = {
  existingId: string | null;
  problem: Omit<AdminProblem, "test_groups">;
};

function withoutHiddenTests(problem: AdminProblem): Omit<AdminProblem, "test_groups"> {
  const safeProblem = { ...problem } as Partial<AdminProblem>;
  delete safeProblem.test_groups;
  return safeProblem as Omit<AdminProblem, "test_groups">;
}

function withoutProblemId(problem: AdminProblem): AdminProblemCreate {
  const newProblem = { ...problem } as Partial<AdminProblem>;
  delete newProblem.id;
  return newProblem as AdminProblemCreate;
}

function isCompleteTag(tag: AdminProblem["tags"][number]) {
  return Boolean(tag.slug.trim() && tag.label_zh.trim());
}

function isSafeAdminProblemDraft(value: unknown): value is SafeAdminProblemDraft {
  if (!value || typeof value !== "object") return false;
  const stored = value as Partial<SafeAdminProblemDraft>;
  if (stored.existingId !== null && typeof stored.existingId !== "string") return false;
  const problem = stored.problem as Partial<Omit<AdminProblem, "test_groups">> | undefined;
  return Boolean(problem)
    && typeof problem?.id === "string"
    && typeof problem?.title?.zh === "string"
    && typeof problem?.title?.en === "string"
    && Array.isArray(problem.description)
    && Array.isArray(problem.constraints)
    && Array.isArray(problem.tags)
    && Array.isArray(problem.samples)
    && typeof problem.starter_code?.cpp === "string"
    && typeof problem.starter_code?.python === "string"
    && ["easy", "medium", "hard"].includes(problem.difficulty ?? "")
    && typeof problem.time_limit_ms === "number"
    && typeof problem.memory_limit_mb === "number"
    && typeof problem.published === "boolean";
}

export function ProblemAdminSettings({ zh }: { zh: boolean }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [problems, setProblems] = useState<AdminProblemSummary[]>([]);
  const [draft, setDraftState] = useState<AdminProblem | null>(null);
  const [existingId, setExistingIdState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [hydratedDraftStateKey, setHydratedDraftStateKey] = useState<string | null>(null);
  const draftStateKey = pageStateKey("settings:problem-admin-public-draft", user?.id);
  const latestDraftRef = useRef<AdminProblem | null>(draft);
  const latestExistingIdRef = useRef<string | null>(existingId);
  const hydratedDraftStateKeyRef = useRef<string | null>(hydratedDraftStateKey);
  const setDraft = (nextDraft: AdminProblem | null) => {
    latestDraftRef.current = nextDraft;
    setDraftState(nextDraft);
  };
  const setExistingId = (nextId: string | null) => {
    latestExistingIdRef.current = nextId;
    setExistingIdState(nextId);
  };

  useLayoutEffect(() => {
    latestDraftRef.current = draft;
    latestExistingIdRef.current = existingId;
    hydratedDraftStateKeyRef.current = hydratedDraftStateKey;
  }, [draft, existingId, hydratedDraftStateKey]);

  const refreshList = async () => setProblems(await listAdminProblems());

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void listAdminProblems()
        .then((items) => { if (!cancelled) setProblems(items); })
        .catch((requestError: unknown) => { if (!cancelled) setError(requestError instanceof Error ? requestError.message : "PROBLEM_LIST_UNAVAILABLE"); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const restored = loadPageState(draftStateKey, isSafeAdminProblemDraft);
      if (!restored) {
        setHydratedDraftStateKey(draftStateKey);
        return;
      }
      const restoreDraft = async () => {
        try {
          const baseProblem = restored.existingId
            ? await getAdminProblem(restored.existingId)
            : blankProblem();
          if (cancelled) return;
          setDraft({ ...baseProblem, ...restored.problem, test_groups: baseProblem.test_groups });
          setExistingId(restored.existingId);
        } catch {
          // If the original problem was removed, discard the stale public draft.
          clearPageState(draftStateKey);
        } finally {
          if (!cancelled) setHydratedDraftStateKey(draftStateKey);
        }
      };
      void restoreDraft();
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [draftStateKey]);

  useEffect(() => {
    if (hydratedDraftStateKey !== draftStateKey || !draft) return;
    savePageState(draftStateKey, { existingId, problem: withoutHiddenTests(draft) });
  }, [draft, draftStateKey, existingId, hydratedDraftStateKey]);

  useEffect(() => {
    const saveLatestDraft = () => {
      const latestDraft = latestDraftRef.current;
      if (hydratedDraftStateKeyRef.current !== draftStateKey || !latestDraft) return;
      savePageState(draftStateKey, {
        existingId: latestExistingIdRef.current,
        problem: withoutHiddenTests(latestDraft),
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveLatestDraft();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", saveLatestDraft);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", saveLatestDraft);
      saveLatestDraft();
    };
  }, [draftStateKey]);

  const startNewProblem = () => {
    const nextDraft = blankProblem();
    clearPageState(draftStateKey);
    latestDraftRef.current = nextDraft;
    latestExistingIdRef.current = null;
    setDraft(nextDraft);
    setExistingId(null);
    setError("");
  };

  const returnToProblemList = () => {
    clearPageState(draftStateKey);
    latestDraftRef.current = null;
    latestExistingIdRef.current = null;
    setDraft(null);
    setExistingId(null);
    setError("");
    setMessage("");
  };

  const editProblem = async (problemId: string) => {
    setBusy(true); setError(""); setMessage("");
    try {
      setDraft(await getAdminProblem(problemId));
      setExistingId(problemId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (t("couldNotLoadTheProblem")));
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!draft || busy) return;
    const totalScore = draft.test_groups.reduce((sum, group) => sum + Number(group.score_percent), 0);
    if (totalScore !== 100) { setError(t("scoresCurrentlyAddUpTo", { total: totalScore })); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const problemForSave = { ...draft, constraints: [], tags: draft.tags.filter(isCompleteTag) };
      const translated = await translateAdminProblem(problemForSave);
      const saved = existingId
        ? await saveAdminProblem(translated)
        : await createAdminProblem(withoutProblemId(translated));
      const translatedTags = new Map(translated.tags.map((tag) => [tag.slug, tag]));
      setDraft({
        ...translated,
        id: saved.id,
        published: saved.published,
        tags: draft.tags.map((tag) => translatedTags.get(tag.slug) ?? tag),
      });
      setExistingId(saved.id);
      await refreshList();
      const keptAsDraft = draft.published && !saved.published;
      setMessage(keptAsDraft
        ? (t("problemSavedAsUnpublishedBecause"))
        : (t("problemSavedThePublicLibrary")));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (t("couldNotSaveTheProblem")));
    } finally { setBusy(false); }
  };

  if (!draft) {
    return (
      <>
        <Header />
        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-[11px] leading-5 text-slate-500">{t("chooseAnExistingProblemOr")}</p>
          <button type="button" onClick={startNewProblem} className="shrink-0 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-bold text-slate-950">＋ {t("newProblem")}</button>
        </div>
        {error ? <Feedback tone="error" text={error === "PROBLEM_LIST_UNAVAILABLE" ? (t("couldNotLoadProblems")) : error} /> : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {problems.map((problem) => (
            <button key={problem.id} type="button" disabled={busy} onClick={() => void editProblem(problem.id)} className="rounded-2xl border border-white/8 bg-[#0d141f] p-4 text-left transition-colors hover:border-cyan-300/25 disabled:opacity-50">
              <div className="flex items-center justify-between gap-3"><span className="font-mono text-[10px] text-slate-600">#{problem.id}</span><span className={`rounded-full px-2 py-1 text-[9px] ${problem.published ? "bg-emerald-300/10 text-emerald-300" : "bg-amber-300/10 text-amber-200"}`}>{problem.published ? (t("published")) : (t("draft"))}</span></div>
              <strong className="mt-3 block text-sm text-white">{problem.title[zh ? "zh" : "en"]}</strong>
              <span className="mt-2 block text-[10px] capitalize text-slate-600">{t(problem.difficulty)}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-5">
        <div><p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/70">{t("problemAdmin")}</p><h2 className="mt-2 text-xl font-semibold text-white">{existingId ? `${t("edit")} #${existingId}` : (t("newProblem"))}</h2></div>
        <button type="button" onClick={returnToProblemList} className="rounded-lg border border-white/8 px-3 py-2 text-[10px] text-slate-400">← {t("problemList2")}</button>
      </div>

      <div className="mt-6 space-y-5">
        <section className={panelClass}>
          <SectionTitle title={t("basicInformation")} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("problemId")}><div className={`${inputClass} flex items-center font-mono`}>{existingId ? `#${existingId}` : (t("generatedOnFirstSave"))}</div></Field>
            <Field label={t("difficulty")}><select className={inputClass} value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: event.target.value as AdminProblem["difficulty"] })}><option value="easy">{t("easy")}</option><option value="medium">{t("medium")}</option><option value="hard">{t("hard")}</option></select></Field>
            <Field label={t("apcsLevel")}><select className={inputClass} value={draft.apcs_level ?? ""} onChange={(event) => setDraft({ ...draft, apcs_level: event.target.value ? Number(event.target.value) : null })}><option value="">{t("apcsLevelUnrated")}</option>{[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{t("apcsLevelValue", { level: String(level) })}</option>)}</select></Field>
            <Field label={t("publication")}><button type="button" role="switch" aria-checked={draft.published} onClick={() => setDraft({ ...draft, published: !draft.published })} className={`mt-2 flex h-10 w-full items-center justify-between rounded-xl border px-3 text-xs ${draft.published ? "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-300" : "border-white/8 bg-[#090f18] text-slate-500"}`}><span>{draft.published ? (t("published")) : (t("draft2"))}</span><span>{draft.published ? "●" : "○"}</span></button></Field>
          </div>
          <LocalizedEditor label={t("title")} value={draft.title} onChange={(title) => setDraft({ ...draft, title })} />
          <LocalizedEditor label={t("summary")} value={draft.summary} onChange={(summary) => setDraft({ ...draft, summary })} multiline />
        </section>

        <section className={panelClass}>
          <SectionTitle title={t("publicStatement")} detail={t("everyoneCanReadThisContent")} />
          <LocalizedListEditor label={t("descriptionParagraphs")} values={draft.description} onChange={(description) => setDraft({ ...draft, description })} />
          <LocalizedEditor label={t("inputFormat")} value={draft.input_format} onChange={(input_format) => setDraft({ ...draft, input_format })} multiline />
          <LocalizedEditor label={t("outputFormat")} value={draft.output_format} onChange={(output_format) => setDraft({ ...draft, output_format })} multiline />
        </section>

        <TagEditor draft={draft} setDraft={setDraft} />
        <SampleEditor draft={draft} setDraft={setDraft} />
        <AutomaticTestGenerator existingId={existingId} draft={draft} setDraft={setDraft} zh={zh} />
        <TestGroupEditor draft={draft} setDraft={setDraft} zh={zh} />

        <section className={panelClass}>
          <SectionTitle title={t("starterCode")} detail={t("shownWhenAUserOpens")} />
          <div className="mt-4 grid gap-4 lg:grid-cols-2"><Field label="C++20"><textarea className={`${textareaClass} min-h-52`} value={draft.starter_code.cpp} onChange={(event) => setDraft({ ...draft, starter_code: { ...draft.starter_code, cpp: event.target.value } })} /></Field><Field label="Python 3"><textarea className={`${textareaClass} min-h-52`} value={draft.starter_code.python} onChange={(event) => setDraft({ ...draft, starter_code: { ...draft.starter_code, python: event.target.value } })} /></Field></div>
        </section>
      </div>

      {error ? <Feedback tone="error" text={error} /> : null}
      {message ? <Feedback tone="success" text={message} /> : null}
      <div className="sticky bottom-3 mt-6 flex justify-end"><button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-cyan-400 px-6 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-black/30 disabled:opacity-50">{busy ? (t("translatingAndSaving")) : (t("translateAndSave"))}</button></div>
    </>
  );
}

function Header() { const { t } = useLanguage(); return <div className="border-b border-white/8 pb-5"><h2 className="text-xl font-semibold text-white">{t("problemAdministration")}</h2><p className="mt-2 text-xs leading-6 text-slate-500">{t("manageStatementsExamplesScoringAnd")}</p></div>; }
function SectionTitle({ title, detail }: { title: string; detail?: string }) { return <div><h3 className="text-sm font-semibold text-white">{title}</h3>{detail ? <p className="mt-1.5 text-[10px] leading-5 text-slate-600">{detail}</p> : null}</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-[11px] text-slate-400">{label}{children}</label>; }
function Feedback({ tone, text }: { tone: "error" | "success"; text: string }) { return <p role={tone === "error" ? "alert" : "status"} className={`mt-5 rounded-xl border p-3 text-[11px] ${tone === "error" ? "border-rose-300/15 bg-rose-300/[0.04] text-rose-300" : "border-emerald-300/15 bg-emerald-300/[0.04] text-emerald-300"}`}>{text}</p>; }

function LocalizedEditor({ label, value, onChange, multiline = false }: { label: string; value: AdminLocalizedText; onChange: (value: AdminLocalizedText) => void; multiline?: boolean; zh?: boolean }) {
  const Element = multiline ? "textarea" : "input";
  return <div className="mt-4"><Field label={label}><Element className={multiline ? textareaClass : inputClass} value={value.zh} onChange={(event) => onChange({ ...value, zh: event.target.value })} /></Field></div>;
}

function LocalizedListEditor({ label, values, onChange }: { label: string; values: AdminLocalizedText[]; onChange: (values: AdminLocalizedText[]) => void; }) {
  const { t } = useLanguage();
  return <div className="mt-5"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-slate-300">{label}</p><button type="button" onClick={() => onChange([...values, blankLocalized()])} className="text-[10px] text-cyan-300">＋ {t("addParagraph")}</button></div><div className="mt-2 space-y-3">{values.map((value, index) => <div key={index} className="rounded-xl border border-white/6 p-3"><Field label={t("paragraph", { number: index + 1 })}><textarea aria-label={`${label} ${index + 1} zh`} className={textareaClass} value={value.zh} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? { ...item, zh: event.target.value } : item))} /></Field><button type="button" disabled={values.length === 1} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))} className="mt-2 text-[9px] text-rose-300 disabled:opacity-25">{t("removeParagraph")}</button></div>)}</div></div>;
}

type DraftProps = { draft: AdminProblem; setDraft: (problem: AdminProblem) => void };

function TagEditor({ draft, setDraft }: DraftProps) {
  const { t } = useLanguage();
  return <section className={panelClass}><SectionTitle title={t("itemTags")} detail={t("enterTheDisplayNameIn")} /><button type="button" onClick={() => setDraft({ ...draft, tags: [...draft.tags, { slug: "", label_zh: "", label_en: "" }] })} className="mt-3 text-[10px] text-cyan-300">＋ {t("addTag")}</button><div className="mt-3 space-y-3">{draft.tags.map((tag, index) => <div key={index} className="grid gap-3 rounded-xl border border-white/6 p-3 sm:grid-cols-[1fr_1.5fr_auto]"><Field label={t("internalSlugNotATranslation")}><input aria-label={t("tagSlug")} className={inputClass} placeholder="binary-search" value={tag.slug} onChange={(event) => setDraft({ ...draft, tags: draft.tags.map((item, itemIndex) => itemIndex === index ? { ...item, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/gu, "") } : item) })} /></Field><Field label={t("displayName")}><input aria-label="標籤中文" className={inputClass} placeholder="二分搜尋" value={tag.label_zh} onChange={(event) => setDraft({ ...draft, tags: draft.tags.map((item, itemIndex) => itemIndex === index ? { ...item, label_zh: event.target.value } : item) })} /></Field><button type="button" disabled={draft.tags.length === 1} onClick={() => setDraft({ ...draft, tags: draft.tags.filter((_, itemIndex) => itemIndex !== index) })} className="self-end pb-2 text-[9px] text-rose-300 disabled:opacity-25">{t("remove")}</button></div>)}</div></section>;
}

function SampleEditor({ draft, setDraft }: DraftProps) {
  const { t } = useLanguage();
  return <section className={panelClass}><SectionTitle title={t("sampleInputAndOutput")} detail={t("theseExamplesArePublicAnd")} /><button type="button" onClick={() => setDraft({ ...draft, samples: [...draft.samples, { input: "", output: "", explanation: null }] })} className="mt-3 text-[10px] text-cyan-300">＋ {t("addSample")}</button><div className="mt-3 space-y-4">{draft.samples.map((sample, index) => <div key={index} className="rounded-xl border border-white/6 p-4"><div className="flex justify-between"><strong className="text-[10px] text-slate-300">{t("sample", { number: index + 1 })}</strong><button type="button" disabled={draft.samples.length === 1} onClick={() => setDraft({ ...draft, samples: draft.samples.filter((_, itemIndex) => itemIndex !== index) })} className="text-[9px] text-rose-300 disabled:opacity-25">{t("remove2")}</button></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label={t("input3")}><textarea className={textareaClass} value={sample.input} onChange={(event) => setDraft({ ...draft, samples: draft.samples.map((item, itemIndex) => itemIndex === index ? { ...item, input: event.target.value } : item) })} /></Field><Field label={t("output3")}><textarea className={textareaClass} value={sample.output} onChange={(event) => setDraft({ ...draft, samples: draft.samples.map((item, itemIndex) => itemIndex === index ? { ...item, output: event.target.value } : item) })} /></Field></div></div>)}</div></section>;
}

const generationStrategies: Array<{ id: GenerationStrategy; weight: number; zh: string; en: string }> = [
  { id: "basic", weight: 10, zh: "基本測資", en: "Basic" },
  { id: "boundary", weight: 15, zh: "邊界測資", en: "Boundary" },
  { id: "extreme", weight: 15, zh: "極端值", en: "Extreme values" },
  { id: "special", weight: 15, zh: "特殊結構", en: "Special structures" },
  { id: "duplicate", weight: 10, zh: "重複資料", en: "Duplicate data" },
  { id: "ordered", weight: 10, zh: "排序結構", en: "Ordered data" },
  { id: "large_random", weight: 25, zh: "大型隨機", en: "Large random" },
];

function strategyAllocations(count: number, selected: GenerationStrategy[]) {
  const enabled = generationStrategies.filter((item) => selected.includes(item.id));
  if (!enabled.length || count < 1) return [];
  const totalWeight = enabled.reduce((sum, item) => sum + item.weight, 0);
  const raw = enabled.map((item) => ({
    strategy: item.id,
    count: Math.floor((count * item.weight) / totalWeight),
    remainder: (count * item.weight) % totalWeight,
  }));
  let remaining = count - raw.reduce((sum, item) => sum + item.count, 0);
  for (const item of [...raw].sort((a, b) => b.remainder - a.remainder)) {
    if (remaining <= 0) break;
    item.count += 1;
    remaining -= 1;
  }
  return raw.filter((item) => item.count > 0).map(({ strategy, count: itemCount }) => ({ strategy, count: itemCount }));
}

function AutomaticTestGenerator({ existingId, draft, setDraft, zh }: DraftProps & { zh: boolean; existingId: string | null }) {
  const { t } = useLanguage();
  const [groupSettings, setGroupSettings] = useState<Record<number, { count: number; points: number }>>({});
  const [firstSeed, setFirstSeed] = useState(1);
  const [replaceCases, setReplaceCases] = useState(true);
  const [result, setResult] = useState<AiGeneratedTestsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const settingsFor = (groupOrder: number) => groupSettings[groupOrder] ?? { count: 10, points: 5 };

  const generate = async () => {
    if (!existingId) {
      setError(t("saveTheProblemBeforeAi"));
      return;
    }
    setBusy(true); setError(""); setMessage(""); setResult(null);
    try {
      const generated = await generateHiddenTestsWithAi(existingId, {
        groups: draft.test_groups.map((_, index) => ({
          group_order: index + 1,
          count: settingsFor(index + 1).count,
          default_points_per_case: settingsFor(index + 1).points,
        })),
        first_seed: firstSeed,
        replace_existing: replaceCases,
      });
      setResult(generated);
      setMessage(zh
        ? `AI 版本 ${generated.version} 已通過公開範例、Docker 與邊界檢查。確認摘要後再套用。`
        : `AI version ${generated.version} passed sample, Docker, and boundary checks. Review before applying.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (t("aiCouldNotGenerateTests")));
    } finally { setBusy(false); }
  };

  const applyAll = async () => {
    if (!existingId || !result) return;
    const generatedScore = result.groups.reduce((sum, group) => sum + group.cases.reduce((caseSum, item) => caseSum + item.score_points, 0), 0);
    const finalScore = result.replace_existing
      ? generatedScore
      : generatedScore + draft.test_groups.reduce((sum, group) => sum + group.score_percent, 0);
    if (finalScore !== 100) {
      setError(t("theAppliedTotalWouldBe", { total: finalScore }));
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      for (const group of result.groups) {
        await applyGenerationBatch(group.batch_id, {
          group_order: group.group_order,
          replace_existing: result.replace_existing,
          case_scores: group.cases.map((item) => item.score_points),
        });
      }
      setDraft(await getAdminProblem(existingId));
      setMessage(t("aiTestsWereAppliedTo"));
      setResult(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (t("couldNotApplyAllTests")));
    } finally { setBusy(false); }
  };

  return <>
    <section className={panelClass}>
      <SectionTitle title={t("aiHiddenTestGeneration")} detail={t("aiAnalyzesTheSavedStatement")} />
      {!existingId ? <p className="mt-3 text-[10px] text-amber-200">{t("saveTheProblemFirst")}</p> : <p className="mt-3 text-[10px] text-slate-500">{t("saveRecentStatementOrScoring")}</p>}
      <div className="mt-4 space-y-3">
        {draft.test_groups.map((_, index) => {
          const order = index + 1;
          const settings = settingsFor(order);
          return <div key={order} className="grid gap-3 rounded-xl border border-white/8 p-3 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end">
            <strong className="pb-3 text-[11px] text-slate-200">{scoringGroupLabel(index, zh)}</strong>
            <Field label={t("caseCount")}><input className={inputClass} type="number" min="1" max="50" value={settings.count} onChange={(event) => setGroupSettings((current) => ({ ...current, [order]: { ...settings, count: Number(event.target.value) } }))} /></Field>
            <Field label={t("defaultPoints")}><input className={inputClass} type="number" min="0" max="100" value={settings.points} onChange={(event) => setGroupSettings((current) => ({ ...current, [order]: { ...settings, points: Number(event.target.value) } }))} /></Field>
            <span className="pb-3 text-[10px] text-slate-500">{settings.count * settings.points} {t("points")}</span>
          </div>;
        })}
        <Field label={t("applyMode")}><select className={`${inputClass} max-w-sm`} value={replaceCases ? "replace" : "append"} onChange={(event) => setReplaceCases(event.target.value === "replace")}><option value="replace">{t("replaceGroupCases")}</option><option value="append">{t("appendToGroupCases")}</option></select></Field>
      </div>
      <details className="mt-4 rounded-xl border border-white/6 px-3 py-2 text-[10px] text-slate-500"><summary className="cursor-pointer font-semibold text-slate-400">{t("advancedSettings")}</summary><div className="mt-3 max-w-xs"><Field label={t("firstSeed")}><input className={inputClass} type="number" min="0" max="2147400000" value={firstSeed} onChange={(event) => setFirstSeed(Number(event.target.value))} /></Field></div></details>
      <div className="mt-4 flex justify-end"><button type="button" disabled={busy || !existingId} onClick={() => void generate()} className="rounded-xl bg-violet-400 px-5 py-3 text-[11px] font-bold text-slate-950 disabled:opacity-40">{busy ? (t("analyzingAndValidating")) : (t("analyzeAndGenerateWithAi"))}</button></div>
      {result ? <div className="mt-5 space-y-3"><div className="flex items-center justify-between gap-3"><strong className="text-xs text-violet-200">{t("testDraftSummary")}</strong><span className="font-mono text-[9px] text-slate-600">{result.version}</span></div>{result.groups.map((group) => <div key={group.group_order} className="rounded-xl border border-white/8 bg-white/[0.02] p-3"><div className="flex items-center justify-between text-[11px]"><strong className="text-slate-200">{scoringGroupLabel(group.group_order - 1, zh)}</strong><span className="text-cyan-300">{group.accepted} {t("cases")}</span></div><p className="mt-2 text-[10px] text-slate-400">{t("boundaryEvidence")}：{group.boundary.actual_value} ≈ {group.boundary.target_value}</p><p className="mt-1 text-[9px] text-slate-600">seed {group.boundary.generator_seed} · {t("attemptedInvalidDuplicates", { attempted: group.attempted, invalid: group.discarded_invalid, duplicate: group.discarded_duplicate })}</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{group.cases.map((testCase, caseIndex) => <label key={testCase.case_order} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[10px] ${testCase.generation_strategy === "boundary" ? "border-cyan-300/25 bg-cyan-300/[0.04]" : "border-white/6"}`}><span className="text-slate-400">{t("case", { number: caseIndex + 1 })} · {testCase.generation_strategy === "boundary" ? (t("boundaryFirst")) : testCase.generation_strategy}</span><span className="flex items-center gap-1"><input aria-label={t("casePoints", { number: caseIndex + 1 })} className="w-16 rounded-md border border-white/8 bg-[#090f18] px-2 py-1 text-right text-slate-200" type="number" min="0" max="100" value={testCase.score_points} onChange={(event) => setResult((current) => current ? { ...current, groups: current.groups.map((item) => item.group_order === group.group_order ? { ...item, cases: item.cases.map((caseItem) => caseItem.case_order === testCase.case_order ? { ...caseItem, score_points: Number(event.target.value) } : caseItem) } : item) } : current)} />{t("pt")}</span></label>)}</div></div>)}<div className="flex items-center justify-between gap-3"><strong className="text-xs text-slate-300">{t("totalAfterApply")}：{(result.replace_existing ? 0 : draft.test_groups.reduce((sum, group) => sum + group.score_percent, 0)) + result.groups.reduce((sum, group) => sum + group.cases.reduce((caseSum, item) => caseSum + item.score_points, 0), 0)}</strong><button type="button" disabled={busy} onClick={() => void applyAll()} className="rounded-xl bg-cyan-400 px-5 py-3 text-[11px] font-bold text-slate-950 disabled:opacity-40">{t("applyAllTests")}</button></div></div> : null}
      {error ? <Feedback tone="error" text={error} /> : null}{message ? <Feedback tone="success" text={message} /> : null}
    </section>
    <details className="rounded-2xl border border-white/8 bg-[#0d141f] p-4 sm:p-5"><summary className="cursor-pointer text-xs font-semibold text-slate-400">{t("advancedManualGeneration")}</summary><div className="mt-4"><ManualTestGenerator existingId={existingId} draft={draft} setDraft={setDraft} zh={zh} /></div></details>
  </>;
}

function ManualTestGenerator({ existingId, draft, setDraft, zh }: DraftProps & { zh: boolean; existingId: string | null }) {
  const { t } = useLanguage();
  const [versions, setVersions] = useState<GenerationVersionMetadata[]>([]);
  const [version, setVersion] = useState("v1");
  const [targetGroup, setTargetGroup] = useState(0);
  const [count, setCount] = useState(100);
  const [defaultPoints, setDefaultPoints] = useState(5);
  const [firstSeed, setFirstSeed] = useState(1);
  const [generatorLanguage, setGeneratorLanguage] = useState<"cpp" | "python">("python");
  const [generatorSource, setGeneratorSource] = useState("");
  const [referenceLanguage, setReferenceLanguage] = useState<"cpp" | "python">("cpp");
  const [referenceSource, setReferenceSource] = useState("");
  const [useValidator, setUseValidator] = useState(false);
  const [validatorLanguage, setValidatorLanguage] = useState<"cpp" | "python">("python");
  const [validatorSource, setValidatorSource] = useState("");
  const [replaceCases, setReplaceCases] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState("");
  const [selectedStrategies, setSelectedStrategies] = useState<GenerationStrategy[]>(generationStrategies.map((item) => item.id));
  const [pendingBatch, setPendingBatch] = useState<GeneratedCasesResponse | null>(null);
  const [strategySuggestion, setStrategySuggestion] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!existingId) {
      return;
    }
    void listGenerationVersions(existingId)
      .then((items) => {
        if (cancelled) return;
        setVersions(items);
        if (items[0]) setVersion(items[0].version);
      })
      .catch(() => { if (!cancelled) setVersions([]); });
    return () => { cancelled = true; };
  }, [existingId]);

  const safeTargetGroup = Math.min(targetGroup, draft.test_groups.length - 1);

  const uploadVersion = async () => {
    if (!existingId) {
      setError(t("saveTheProblemBeforeCreating"));
      return;
    }
    if (!generatorSource.trim() || !referenceSource.trim() || (useValidator && !validatorSource.trim())) {
      setError(t("generatorReferenceSolutionAndAn"));
      return;
    }
    setBusy(true); setError(""); setReport("");
    try {
      const saved = await saveGenerationVersion(existingId, {
        version,
        generator: { language: generatorLanguage, source: generatorSource },
        reference_solution: { language: referenceLanguage, source: referenceSource },
        validator: useValidator ? { language: validatorLanguage, source: validatorSource } : null,
      });
      setVersions((items) => [saved, ...items.filter((item) => item.version !== saved.version)]);
      setGeneratorSource(""); setReferenceSource(""); setValidatorSource("");
      setReport(t("versionWasStoredSecurelySource", { version: saved.version }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save the generation version.");
    } finally { setBusy(false); }
  };

  const generate = async () => {
    if (!existingId) {
      setError(t("saveTheProblemFirst"));
      return;
    }
    const allocations = strategyAllocations(count, selectedStrategies);
    if (!allocations.length) {
      setError(t("selectAtLeastOneTest"));
      return;
    }
    setBusy(true); setError(""); setReport("");
    try {
      const result = await generateHiddenTests(existingId, { version, count, first_seed: firstSeed, default_points_per_case: defaultPoints, group_order: safeTargetGroup + 1, strategy_allocations: allocations });
      setPendingBatch(result);
      setReport(zh
        ? `伺服器草稿已通過：接受 ${result.report.accepted} 筆／嘗試 ${result.report.attempted} 筆；捨棄非法 ${result.report.discarded_invalid}、重複 ${result.report.discarded_duplicate}。確認摘要後再套用到配分群組。`
        : `Server draft passed: ${result.report.accepted} accepted from ${result.report.attempted}; discarded ${result.report.discarded_invalid} invalid and ${result.report.discarded_duplicate} duplicates. Review it before applying.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not generate tests.");
    } finally { setBusy(false); }
  };

  const applyBatch = async () => {
    if (!existingId || !pendingBatch) return;
    const generatedScore = pendingBatch.cases.reduce((sum, item) => sum + item.score_points, 0);
    const currentTotal = draft.test_groups.reduce((sum, group) => sum + group.score_percent, 0);
    const finalTotal = replaceCases
      ? currentTotal - draft.test_groups[safeTargetGroup].score_percent + generatedScore
      : currentTotal + generatedScore;
    if (finalTotal !== 100) {
      setError(t("theAppliedTotalWouldBe2", { total: finalTotal }));
      return;
    }
    setBusy(true); setError("");
    try {
      const applied = await applyGenerationBatch(pendingBatch.batch_id, {
        group_order: safeTargetGroup + 1,
        replace_existing: replaceCases,
        case_scores: pendingBatch.cases.map((item) => item.score_points),
      });
      setDraft(await getAdminProblem(existingId));
      setPendingBatch(null);
      setReport(t("casesWereAppliedSecurelyTo", { count: applied.applied_cases }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not apply generated tests.");
    } finally { setBusy(false); }
  };

  const suggestStrategies = async () => {
    const controller = new AbortController();
    setBusy(true); setError(""); setStrategySuggestion("");
    try {
      await streamAiTutor({
        action: "test_strategy",
        code: "",
        errorOutput: "",
        question: JSON.stringify({
          title: draft.title.zh,
          summary: draft.summary.zh,
          description: draft.description.map((item) => item.zh),
          input_format: draft.input_format.zh,
          output_format: draft.output_format.zh,
          constraints: draft.test_groups.map((group) => group.condition.zh).filter(Boolean),
        }),
        language: zh ? "zh-Hant" : "en",
        programmingLanguage: "cpp",
      }, (chunk) => setStrategySuggestion((current) => current + chunk), controller.signal);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not suggest test strategies.");
    } finally { setBusy(false); }
  };

  return <section className={panelClass}>
    <SectionTitle title={t("automaticHiddenTestGeneration")} detail={t("theGeneratorReadsAFixed")} />
    {!existingId ? <p className="mt-3 text-[10px] text-amber-200">{t("saveTheUnpublishedProblemBefore")}</p> : null}
    <div className="mt-4 grid gap-4 sm:grid-cols-3">
      <Field label={t("version")}><input className={inputClass} value={version} maxLength={40} onChange={(event) => setVersion(event.target.value.replace(/[^a-zA-Z0-9._-]/gu, ""))} /></Field>
      <Field label={t("targetScoringGroup")}><select className={inputClass} value={safeTargetGroup} onChange={(event) => setTargetGroup(Number(event.target.value))}>{draft.test_groups.map((_, index) => <option key={index} value={index}>{scoringGroupLabel(index, zh)}</option>)}</select></Field>
      <Field label={t("storedVersions")}><select className={inputClass} value={version} onChange={(event) => setVersion(event.target.value)}><option value={version}>{version}</option>{versions.filter((item) => item.version !== version).map((item) => <option key={item.version} value={item.version}>{item.version}{item.has_validator ? " + Validator" : ""}</option>)}</select></Field>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <ProgramField title="Generator" language={generatorLanguage} setLanguage={setGeneratorLanguage} source={generatorSource} setSource={setGeneratorSource} placeholder={t("readSeedThenStrategyEmit")} />
      <ProgramField title={t("referenceSolution")} language={referenceLanguage} setLanguage={setReferenceLanguage} source={referenceSource} setSource={setReferenceSource} placeholder={t("readTheGeneratedInputAnd")} />
    </div>
    <label className="mt-4 flex items-center gap-2 text-[11px] text-slate-400"><input type="checkbox" checked={useValidator} onChange={(event) => setUseValidator(event.target.checked)} />{t("useACustomValidatorExit")}</label>
    {useValidator ? <div className="mt-3"><ProgramField title="Validator" language={validatorLanguage} setLanguage={setValidatorLanguage} source={validatorSource} setSource={setValidatorSource} placeholder={t("readInputFromStdinExit")} /></div> : null}
    <div className="mt-4 flex justify-end"><button type="button" disabled={busy || !existingId} onClick={() => void uploadVersion()} className="rounded-xl border border-cyan-300/20 px-4 py-2.5 text-[11px] font-semibold text-cyan-300 disabled:opacity-40">{t("storePrivateVersion")}</button></div>
    <div className="mt-5 border-t border-white/8 pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] font-semibold text-slate-300">{t("testStrategiesAndRecommendedMix")}</p><button type="button" disabled={busy} onClick={() => void suggestStrategies()} className="rounded-lg border border-violet-300/20 px-3 py-2 text-[10px] font-semibold text-violet-200 disabled:opacity-40">{t("aiStrategySuggestions")}</button></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{generationStrategies.map((strategy) => <label key={strategy.id} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-[10px] ${selectedStrategies.includes(strategy.id) ? "border-cyan-300/20 bg-cyan-300/[0.04] text-cyan-200" : "border-white/8 text-slate-600"}`}><span className="flex items-center gap-2"><input type="checkbox" checked={selectedStrategies.includes(strategy.id)} onChange={(event) => setSelectedStrategies((items) => event.target.checked ? [...items, strategy.id] : items.filter((item) => item !== strategy.id))} />{strategy[zh ? "zh" : "en"]}</span><span>{strategy.weight}%</span></label>)}</div>{strategySuggestion ? <div className="mt-3 whitespace-pre-wrap rounded-xl border border-violet-300/15 bg-violet-300/[0.03] p-3 text-[10px] leading-5 text-slate-300">{strategySuggestion}</div> : null}<p className="mt-2 text-[9px] text-slate-600">{t("aiReceivesOnlyThePublic")}</p></div>
    <div className="mt-5 grid gap-4 border-t border-white/8 pt-4 sm:grid-cols-5">
      <Field label={t("caseCountMax100")}><input className={inputClass} type="number" min="1" max="100" value={count} onChange={(event) => setCount(Number(event.target.value))} /></Field>
      <Field label={t("defaultPoints")}><input className={inputClass} type="number" min="0" max="100" value={defaultPoints} onChange={(event) => setDefaultPoints(Number(event.target.value))} /></Field>
      <Field label={t("firstSeed2")}><input className={inputClass} type="number" min="0" value={firstSeed} onChange={(event) => setFirstSeed(Number(event.target.value))} /></Field>
      <Field label={t("insertMode")}><select className={inputClass} value={replaceCases ? "replace" : "append"} onChange={(event) => setReplaceCases(event.target.value === "replace")}><option value="replace">{t("replaceGroupCases2")}</option><option value="append">{t("appendToGroup")}</option></select></Field>
      <div className="flex items-end"><button type="button" disabled={busy || !existingId || !versions.some((item) => item.version === version)} onClick={() => void generate()} className="h-10 w-full rounded-xl bg-violet-400 px-4 text-[11px] font-bold text-slate-950 disabled:opacity-40">{busy ? (t("working")) : (t("generateAndValidate"))}</button></div>
    </div>
    {pendingBatch ? <div className="mt-4 rounded-xl border border-violet-300/15 bg-violet-300/[0.03] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="text-xs text-violet-200">{t("serverTestDraftReady")}</strong><p className="mt-1 text-[10px] text-slate-500">ID {pendingBatch.batch_id} · {pendingBatch.report.accepted} {t("cases")} · {pendingBatch.report.total_input_bytes} bytes</p></div><button type="button" disabled={busy} onClick={() => void applyBatch()} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-[11px] font-bold text-slate-950 disabled:opacity-40">{t("applyToScoringGroup")}</button></div><div className="mt-3 flex flex-wrap gap-2">{Object.entries(pendingBatch.report.strategy_counts).map(([strategy, strategyCount]) => <span key={strategy} className="rounded-full border border-white/8 px-2 py-1 text-[9px] text-slate-400">{strategy}: {strategyCount}</span>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{pendingBatch.cases.map((testCase, index) => <label key={testCase.case_order} className="flex items-center justify-between gap-2 rounded-lg border border-white/6 px-3 py-2 text-[10px] text-slate-400"><span>{t("case", { number: index + 1 })}</span><input aria-label={t("casePoints", { number: index + 1 })} className="w-16 rounded-md border border-white/8 bg-[#090f18] px-2 py-1 text-right text-slate-200" type="number" min="0" max="100" value={testCase.score_points} onChange={(event) => setPendingBatch((current) => current ? { ...current, cases: current.cases.map((item) => item.case_order === testCase.case_order ? { ...item, score_points: Number(event.target.value) } : item) } : current)} /></label>)}</div><p className="mt-3 text-[9px] text-slate-600">{t("hiddenInputsAndExpectedOutputs")}</p></div> : null}
    {error ? <Feedback tone="error" text={error} /> : null}{report ? <Feedback tone="success" text={report} /> : null}
  </section>;
}

function ProgramField({ title, language, setLanguage, source, setSource, placeholder }: { title: string; language: "cpp" | "python"; setLanguage: (value: "cpp" | "python") => void; source: string; setSource: (value: string) => void; placeholder: string; }) {
  const { t } = useLanguage();
  return <div className="rounded-xl border border-white/6 p-3"><div className="flex items-center justify-between gap-3"><strong className="text-[11px] text-slate-300">{title}</strong><select aria-label={`${title} ${t("language")}`} className="rounded-lg border border-white/8 bg-[#090f18] px-2 py-1 text-[10px] text-slate-300" value={language} onChange={(event) => setLanguage(event.target.value as "cpp" | "python")}><option value="cpp">C++20</option><option value="python">Python 3</option></select></div><textarea className={`${textareaClass} min-h-44`} value={source} placeholder={placeholder} autoComplete="off" spellCheck={false} onChange={(event) => setSource(event.target.value)} /></div>;
}

function TestGroupEditor({ draft, setDraft, zh }: DraftProps & { zh: boolean }) {
  const { t } = useLanguage();
  const totalScore = draft.test_groups.reduce((sum, group) => sum + Number(group.score_percent), 0);
  return (
    <section className={panelClass}>
      <SectionTitle
        title={t("scoringGroupsAndHiddenCases")}
        detail={t("onlyAdminsCanReadThis")}
      />
      <div className={`mt-3 text-xs font-semibold ${totalScore === 100 ? "text-emerald-300" : "text-rose-300"}`}>
        {t("currentTotal")}：{totalScore}%
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={t("timeLimitMs")}>
          <input className={inputClass} type="number" min="100" max="10000" value={draft.time_limit_ms} onChange={(event) => setDraft({ ...draft, time_limit_ms: Number(event.target.value) })} />
        </Field>
        <Field label={t("memoryLimitMb")}>
          <input className={inputClass} type="number" min="16" max="1024" value={draft.memory_limit_mb} onChange={(event) => setDraft({ ...draft, memory_limit_mb: Number(event.target.value) })} />
        </Field>
      </div>
      <button type="button" onClick={() => setDraft({ ...draft, test_groups: [...draft.test_groups, { name: blankLocalized(), condition: blankLocalized(), score_percent: 5, cases: [{ input: "", expected_output: "", score_points: 5 }] }] })} className="mt-3 text-[10px] text-cyan-300">
        ＋ {t("addScoringGroup")}
      </button>
      <div className="mt-4 space-y-5">
        {draft.test_groups.map((group, groupIndex) => (
          <div key={groupIndex} className="rounded-2xl border border-violet-300/10 bg-violet-300/[0.02] p-4">
            <div className="flex items-center justify-between">
              <strong className="text-xs text-violet-200">{scoringGroupLabel(groupIndex, zh)}</strong>
              <button type="button" disabled={draft.test_groups.length === 1} onClick={() => setDraft({ ...draft, test_groups: draft.test_groups.filter((_, index) => index !== groupIndex) })} className="text-[9px] text-rose-300 disabled:opacity-25">
                {t("removeGroup")}
              </button>
            </div>
            <LocalizedEditor zh={zh} label={t("groupName")} value={group.name} onChange={(name) => setDraft({ ...draft, test_groups: draft.test_groups.map((item, index) => index === groupIndex ? { ...item, name } : item) })} />
            <LocalizedEditor zh={zh} label={t("scoringCondition")} value={group.condition} onChange={(condition) => setDraft({ ...draft, test_groups: draft.test_groups.map((item, index) => index === groupIndex ? { ...item, condition } : item) })} multiline />
            <p className="mt-3 text-[10px] font-semibold text-slate-400">{t("groupPoints")}：{group.score_percent}</p>
            <div className="mt-5 flex items-center justify-between">
              <p className="text-[10px] font-semibold text-slate-300">{t("hiddenCases", { count: group.cases.length })}</p>
              <button type="button" onClick={() => setDraft({ ...draft, test_groups: draft.test_groups.map((item, index) => index === groupIndex ? { ...item, score_percent: item.score_percent + 5, cases: [...item.cases, { input: "", expected_output: "", score_points: 5 }] } : item) })} className="text-[10px] text-cyan-300">
                ＋ {t("addCase")}
              </button>
            </div>
            <div className="mt-2 space-y-3">
              {group.cases.map((testCase, caseIndex) => (
                <div key={caseIndex} className="grid gap-3 rounded-xl border border-white/6 p-3 sm:grid-cols-[1fr_1fr_7rem_auto]">
                  <Field label={t("input4", { number: caseIndex + 1 })}>
                    <textarea className={textareaClass} value={testCase.input} onChange={(event) => setDraft({ ...draft, test_groups: draft.test_groups.map((item, index) => index === groupIndex ? { ...item, cases: item.cases.map((caseItem, indexOfCase) => indexOfCase === caseIndex ? { ...caseItem, input: event.target.value } : caseItem) } : item) })} />
                  </Field>
                  <Field label={t("expectedOutput", { number: caseIndex + 1 })}>
                    <textarea className={textareaClass} value={testCase.expected_output} onChange={(event) => setDraft({ ...draft, test_groups: draft.test_groups.map((item, index) => index === groupIndex ? { ...item, cases: item.cases.map((caseItem, indexOfCase) => indexOfCase === caseIndex ? { ...caseItem, expected_output: event.target.value } : caseItem) } : item) })} />
                  </Field>
                  <Field label={t("points2")}><input className={inputClass} type="number" min="0" max="100" value={testCase.score_points} onChange={(event) => setDraft({ ...draft, test_groups: draft.test_groups.map((item, index) => index === groupIndex ? { ...item, score_percent: item.score_percent - testCase.score_points + Number(event.target.value), cases: item.cases.map((caseItem, indexOfCase) => indexOfCase === caseIndex ? { ...caseItem, score_points: Number(event.target.value) } : caseItem) } : item) })} /></Field>
                  <button type="button" disabled={group.cases.length === 1} onClick={() => setDraft({ ...draft, test_groups: draft.test_groups.map((item, index) => index === groupIndex ? { ...item, score_percent: item.score_percent - testCase.score_points, cases: item.cases.filter((_, indexOfCase) => indexOfCase !== caseIndex) } : item) })} className="self-end pb-3 text-[9px] text-rose-300 disabled:opacity-25">
                    {t("remove")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
