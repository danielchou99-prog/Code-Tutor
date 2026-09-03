"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { streamAiTutor } from "@/lib/ai-tutor-api";
import {
  type AdminLocalizedText,
  type AdminProblem,
  type AdminProblemSummary,
  type GeneratedCasesResponse,
  type GenerationStrategy,
  type GenerationVersionMetadata,
  applyGenerationBatch,
  generateHiddenTests,
  getAdminProblem,
  listGenerationVersions,
  listAdminProblems,
  saveGenerationVersion,
  saveAdminProblem,
  translateAdminProblem,
} from "@/lib/problem-admin-api";
import { clearPageState, loadPageState, pageStateKey, savePageState } from "@/lib/page-state";
import { scoringGroupLabel } from "@/lib/scoring-group-label";

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
    time_limit_ms: 1000,
    memory_limit_mb: 256,
    published: false,
    tags: [{ slug: "implementation", label_zh: "實作", label_en: "Implementation" }],
    samples: [{ input: "", output: "", explanation: null }],
    test_groups: [{
      name: { zh: "完整測資", en: "Full tests" },
      condition: { zh: "無額外限制", en: "No additional constraints" },
      score_percent: 100,
      cases: [{ input: "", expected_output: "" }],
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
      setError(requestError instanceof Error ? requestError.message : (zh ? "無法載入題目。" : "Could not load the problem."));
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!draft || busy) return;
    if (!/^(?:\d{4,12}|[a-z]\d{3,11})$/u.test(draft.id)) { setError(zh ? "題號必須是 4–12 位數字，或一個小寫英文字母加 3–11 位數字（例如 a001）。" : "Use 4–12 digits, or one lowercase letter followed by 3–11 digits (for example, a001)."); return; }
    const totalScore = draft.test_groups.reduce((sum, group) => sum + Number(group.score_percent), 0);
    if (totalScore !== 100) { setError(zh ? `配分目前合計 ${totalScore}%，必須等於 100%。` : `Scores currently add up to ${totalScore}%. They must equal 100%.`); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const problemForSave = { ...draft, constraints: [], tags: draft.tags.filter(isCompleteTag) };
      const translated = await translateAdminProblem(problemForSave);
      const saved = await saveAdminProblem(translated);
      const translatedTags = new Map(translated.tags.map((tag) => [tag.slug, tag]));
      setDraft({
        ...translated,
        published: saved.published,
        tags: draft.tags.map((tag) => translatedTags.get(tag.slug) ?? tag),
      });
      setExistingId(saved.id);
      await refreshList();
      const keptAsDraft = draft.published && !saved.published;
      setMessage(keptAsDraft
        ? (zh ? "題目已儲存；內容尚未完整，因此維持未發布。" : "Problem saved as unpublished because its public content is incomplete.")
        : (zh ? "題目已儲存。一般題庫重新整理後會載入最新內容。" : "Problem saved. The public library will load the latest content after refresh."));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (zh ? "無法儲存題目。" : "Could not save the problem."));
    } finally { setBusy(false); }
  };

  if (!draft) {
    return (
      <>
        <Header zh={zh} />
        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-[11px] leading-5 text-slate-500">{zh ? "選擇既有題目，或建立一個預設為未發布的新題目。" : "Choose an existing problem or create a new unpublished draft."}</p>
          <button type="button" onClick={startNewProblem} className="shrink-0 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-bold text-slate-950">＋ {zh ? "新增題目" : "New problem"}</button>
        </div>
        {error ? <Feedback tone="error" text={error === "PROBLEM_LIST_UNAVAILABLE" ? (zh ? "無法載入題目清單。" : "Could not load problems.") : error} /> : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {problems.map((problem) => (
            <button key={problem.id} type="button" disabled={busy} onClick={() => void editProblem(problem.id)} className="rounded-2xl border border-white/8 bg-[#0d141f] p-4 text-left transition-colors hover:border-cyan-300/25 disabled:opacity-50">
              <div className="flex items-center justify-between gap-3"><span className="font-mono text-[10px] text-slate-600">#{problem.id}</span><span className={`rounded-full px-2 py-1 text-[9px] ${problem.published ? "bg-emerald-300/10 text-emerald-300" : "bg-amber-300/10 text-amber-200"}`}>{problem.published ? (zh ? "已發布" : "Published") : (zh ? "草稿" : "Draft")}</span></div>
              <strong className="mt-3 block text-sm text-white">{problem.title[zh ? "zh" : "en"]}</strong>
              <span className="mt-2 block text-[10px] capitalize text-slate-600">{zh ? ({ easy: "簡單", medium: "中等", hard: "困難" } as const)[problem.difficulty] : problem.difficulty}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-5">
        <div><p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/70">{zh ? "題目管理" : "Problem Admin"}</p><h2 className="mt-2 text-xl font-semibold text-white">{existingId ? `${zh ? "編輯題目" : "Edit"} #${existingId}` : (zh ? "新增題目" : "New problem")}</h2></div>
        <button type="button" onClick={returnToProblemList} className="rounded-lg border border-white/8 px-3 py-2 text-[10px] text-slate-400">← {zh ? "題目清單" : "Problem list"}</button>
      </div>

      <div className="mt-6 space-y-5">
        <section className={panelClass}>
          <SectionTitle title={zh ? "基本資料" : "Basic information"} />
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label={zh ? "題號" : "Problem ID"}><input className={inputClass} value={draft.id} disabled={Boolean(existingId)} placeholder="a001" onChange={(event) => setDraft({ ...draft, id: event.target.value.toLowerCase().replace(/[^a-z0-9]/gu, "").slice(0, 12) })} /></Field>
            <Field label={zh ? "難度" : "Difficulty"}><select className={inputClass} value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: event.target.value as AdminProblem["difficulty"] })}><option value="easy">{zh ? "簡單" : "Easy"}</option><option value="medium">{zh ? "中等" : "Medium"}</option><option value="hard">{zh ? "困難" : "Hard"}</option></select></Field>
            <Field label={zh ? "發布狀態" : "Publication"}><button type="button" role="switch" aria-checked={draft.published} onClick={() => setDraft({ ...draft, published: !draft.published })} className={`mt-2 flex h-10 w-full items-center justify-between rounded-xl border px-3 text-xs ${draft.published ? "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-300" : "border-white/8 bg-[#090f18] text-slate-500"}`}><span>{draft.published ? (zh ? "已發布" : "Published") : (zh ? "未發布" : "Draft")}</span><span>{draft.published ? "●" : "○"}</span></button></Field>
          </div>
          <LocalizedEditor label={zh ? "題目名稱" : "Title"} value={draft.title} onChange={(title) => setDraft({ ...draft, title })} />
          <LocalizedEditor label={zh ? "列表摘要" : "Summary"} value={draft.summary} onChange={(summary) => setDraft({ ...draft, summary })} multiline />
        </section>

        <section className={panelClass}>
          <SectionTitle title={zh ? "公開題意" : "Public statement"} detail={zh ? "這些內容會顯示給所有使用者，請勿放入隱藏答案。" : "Everyone can read this content. Never include hidden answers here."} />
          <LocalizedListEditor zh={zh} label={zh ? "題目描述段落" : "Description paragraphs"} values={draft.description} onChange={(description) => setDraft({ ...draft, description })} />
          <LocalizedEditor label={zh ? "輸入格式" : "Input format"} value={draft.input_format} onChange={(input_format) => setDraft({ ...draft, input_format })} multiline />
          <LocalizedEditor label={zh ? "輸出格式" : "Output format"} value={draft.output_format} onChange={(output_format) => setDraft({ ...draft, output_format })} multiline />
        </section>

        <TagEditor draft={draft} setDraft={setDraft} zh={zh} />
        <SampleEditor draft={draft} setDraft={setDraft} zh={zh} />
        <AutomaticTestGenerator existingId={existingId} draft={draft} setDraft={setDraft} zh={zh} />
        <TestGroupEditor draft={draft} setDraft={setDraft} zh={zh} />

        <section className={panelClass}>
          <SectionTitle title={zh ? "預設程式碼" : "Starter code"} detail={zh ? "使用者第一次開啟題目時顯示的內容。" : "Shown when a user opens the problem for the first time."} />
          <div className="mt-4 grid gap-4 lg:grid-cols-2"><Field label="C++20"><textarea className={`${textareaClass} min-h-52`} value={draft.starter_code.cpp} onChange={(event) => setDraft({ ...draft, starter_code: { ...draft.starter_code, cpp: event.target.value } })} /></Field><Field label="Python 3"><textarea className={`${textareaClass} min-h-52`} value={draft.starter_code.python} onChange={(event) => setDraft({ ...draft, starter_code: { ...draft.starter_code, python: event.target.value } })} /></Field></div>
        </section>
      </div>

      {error ? <Feedback tone="error" text={error} /> : null}
      {message ? <Feedback tone="success" text={message} /> : null}
      <div className="sticky bottom-3 mt-6 flex justify-end"><button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-cyan-400 px-6 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-black/30 disabled:opacity-50">{busy ? (zh ? "翻譯並儲存中…" : "Translating and saving…") : (zh ? "翻譯並儲存題目" : "Translate and save")}</button></div>
    </>
  );
}

function Header({ zh }: { zh: boolean }) { return <div className="border-b border-white/8 pb-5"><h2 className="text-xl font-semibold text-white">{zh ? "題目管理" : "Problem administration"}</h2><p className="mt-2 text-xs leading-6 text-slate-500">{zh ? "管理正式題意、範例、配分與隱藏 Judge 測資。" : "Manage statements, examples, scoring, and hidden Judge cases."}</p></div>; }
function SectionTitle({ title, detail }: { title: string; detail?: string }) { return <div><h3 className="text-sm font-semibold text-white">{title}</h3>{detail ? <p className="mt-1.5 text-[10px] leading-5 text-slate-600">{detail}</p> : null}</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-[11px] text-slate-400">{label}{children}</label>; }
function Feedback({ tone, text }: { tone: "error" | "success"; text: string }) { return <p role={tone === "error" ? "alert" : "status"} className={`mt-5 rounded-xl border p-3 text-[11px] ${tone === "error" ? "border-rose-300/15 bg-rose-300/[0.04] text-rose-300" : "border-emerald-300/15 bg-emerald-300/[0.04] text-emerald-300"}`}>{text}</p>; }

function LocalizedEditor({ label, value, onChange, multiline = false }: { label: string; value: AdminLocalizedText; onChange: (value: AdminLocalizedText) => void; multiline?: boolean; zh?: boolean }) {
  const Element = multiline ? "textarea" : "input";
  return <div className="mt-4"><Field label={label}><Element className={multiline ? textareaClass : inputClass} value={value.zh} onChange={(event) => onChange({ ...value, zh: event.target.value })} /></Field></div>;
}

function LocalizedListEditor({ label, values, onChange, zh }: { label: string; values: AdminLocalizedText[]; onChange: (values: AdminLocalizedText[]) => void; zh: boolean }) {
  return <div className="mt-5"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-slate-300">{label}</p><button type="button" onClick={() => onChange([...values, blankLocalized()])} className="text-[10px] text-cyan-300">＋ {zh ? "新增段落" : "Add paragraph"}</button></div><div className="mt-2 space-y-3">{values.map((value, index) => <div key={index} className="rounded-xl border border-white/6 p-3"><Field label={zh ? `段落 ${index + 1}` : `Paragraph ${index + 1}`}><textarea aria-label={`${label} ${index + 1} zh`} className={textareaClass} value={value.zh} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? { ...item, zh: event.target.value } : item))} /></Field><button type="button" disabled={values.length === 1} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))} className="mt-2 text-[9px] text-rose-300 disabled:opacity-25">{zh ? "移除段落" : "Remove paragraph"}</button></div>)}</div></div>;
}

type DraftProps = { draft: AdminProblem; setDraft: (problem: AdminProblem) => void; zh: boolean };

function TagEditor({ draft, setDraft, zh }: DraftProps) {
  return <section className={panelClass}><SectionTitle title={zh ? "標籤" : "Tags"} detail={zh ? "顯示名稱只需輸入中文，英文會自動翻譯。內部代碼不是翻譯，請使用穩定的小寫英文與連字號。" : "Enter the display name in Chinese; English is translated automatically. Keep a stable lowercase internal slug."} /><button type="button" onClick={() => setDraft({ ...draft, tags: [...draft.tags, { slug: "", label_zh: "", label_en: "" }] })} className="mt-3 text-[10px] text-cyan-300">＋ {zh ? "新增標籤" : "Add tag"}</button><div className="mt-3 space-y-3">{draft.tags.map((tag, index) => <div key={index} className="grid gap-3 rounded-xl border border-white/6 p-3 sm:grid-cols-[1fr_1.5fr_auto]"><Field label={zh ? "內部代碼（不是英文翻譯）" : "Internal slug (not a translation)"}><input aria-label={zh ? "標籤內部代碼" : "Tag slug"} className={inputClass} placeholder="binary-search" value={tag.slug} onChange={(event) => setDraft({ ...draft, tags: draft.tags.map((item, itemIndex) => itemIndex === index ? { ...item, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/gu, "") } : item) })} /></Field><Field label={zh ? "顯示名稱" : "Display name"}><input aria-label="標籤中文" className={inputClass} placeholder="二分搜尋" value={tag.label_zh} onChange={(event) => setDraft({ ...draft, tags: draft.tags.map((item, itemIndex) => itemIndex === index ? { ...item, label_zh: event.target.value } : item) })} /></Field><button type="button" disabled={draft.tags.length === 1} onClick={() => setDraft({ ...draft, tags: draft.tags.filter((_, itemIndex) => itemIndex !== index) })} className="self-end pb-2 text-[9px] text-rose-300 disabled:opacity-25">{zh ? "移除" : "Remove"}</button></div>)}</div></section>;
}

function SampleEditor({ draft, setDraft, zh }: DraftProps) {
  return <section className={panelClass}><SectionTitle title={zh ? "範例輸入與輸出" : "Sample input and output"} detail={zh ? "這些範例會公開顯示，不等於真正隱藏測資數量。" : "These examples are public and do not determine the hidden case count."} /><button type="button" onClick={() => setDraft({ ...draft, samples: [...draft.samples, { input: "", output: "", explanation: null }] })} className="mt-3 text-[10px] text-cyan-300">＋ {zh ? "新增範例" : "Add sample"}</button><div className="mt-3 space-y-4">{draft.samples.map((sample, index) => <div key={index} className="rounded-xl border border-white/6 p-4"><div className="flex justify-between"><strong className="text-[10px] text-slate-300">{zh ? `範例 ${index + 1}` : `Sample ${index + 1}`}</strong><button type="button" disabled={draft.samples.length === 1} onClick={() => setDraft({ ...draft, samples: draft.samples.filter((_, itemIndex) => itemIndex !== index) })} className="text-[9px] text-rose-300 disabled:opacity-25">{zh ? "移除範例" : "Remove"}</button></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label={zh ? "範例輸入" : "Input"}><textarea className={textareaClass} value={sample.input} onChange={(event) => setDraft({ ...draft, samples: draft.samples.map((item, itemIndex) => itemIndex === index ? { ...item, input: event.target.value } : item) })} /></Field><Field label={zh ? "範例輸出" : "Output"}><textarea className={textareaClass} value={sample.output} onChange={(event) => setDraft({ ...draft, samples: draft.samples.map((item, itemIndex) => itemIndex === index ? { ...item, output: event.target.value } : item) })} /></Field></div></div>)}</div></section>;
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

function AutomaticTestGenerator({ existingId, draft, setDraft, zh }: DraftProps & { existingId: string | null }) {
  const [versions, setVersions] = useState<GenerationVersionMetadata[]>([]);
  const [version, setVersion] = useState("v1");
  const [targetGroup, setTargetGroup] = useState(0);
  const [count, setCount] = useState(100);
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
      setError(zh ? "請先儲存題目，再建立機密產生版本。" : "Save the problem before creating a private generation version.");
      return;
    }
    if (!generatorSource.trim() || !referenceSource.trim() || (useValidator && !validatorSource.trim())) {
      setError(zh ? "Generator、標準解答與已啟用的 Validator 都不能留白。" : "Generator, Reference Solution, and an enabled Validator cannot be blank.");
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
      setReport(zh ? `版本 ${saved.version} 已安全儲存；原始碼已從表單清除。` : `Version ${saved.version} was stored securely; source fields were cleared.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save the generation version.");
    } finally { setBusy(false); }
  };

  const generate = async () => {
    if (!existingId) {
      setError(zh ? "請先儲存題目。" : "Save the problem first.");
      return;
    }
    const allocations = strategyAllocations(count, selectedStrategies);
    if (!allocations.length) {
      setError(zh ? "至少選擇一種測資策略。" : "Select at least one test strategy.");
      return;
    }
    setBusy(true); setError(""); setReport("");
    try {
      const result = await generateHiddenTests(existingId, { version, count, first_seed: firstSeed, strategy_allocations: allocations });
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
    setBusy(true); setError("");
    try {
      const applied = await applyGenerationBatch(pendingBatch.batch_id, {
        group_order: safeTargetGroup + 1,
        replace_existing: replaceCases,
      });
      setDraft(await getAdminProblem(existingId));
      setPendingBatch(null);
      setReport(zh ? `已將 ${applied.applied_cases} 筆測資安全套用到配分群組。` : `${applied.applied_cases} cases were applied securely to the scoring group.`);
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
    <SectionTitle title={zh ? "自動產生隱藏測資" : "Automatic hidden-test generation"} detail={zh ? "Generator 從 stdin 第一行讀取固定 seed、第二行讀取策略名稱，再輸出一筆完整測資。產生結果先留在伺服器草稿，瀏覽器只取得雜湊與大小摘要。" : "The Generator reads a fixed seed on stdin line 1 and a strategy name on line 2. Results stay in a server draft; the browser receives only hashes and size metadata."} />
    {!existingId ? <p className="mt-3 text-[10px] text-amber-200">{zh ? "先儲存未發布題目，才能建立機密版本。" : "Save the unpublished problem before creating a private version."}</p> : null}
    <div className="mt-4 grid gap-4 sm:grid-cols-3">
      <Field label={zh ? "版本名稱" : "Version"}><input className={inputClass} value={version} maxLength={40} onChange={(event) => setVersion(event.target.value.replace(/[^a-zA-Z0-9._-]/gu, ""))} /></Field>
      <Field label={zh ? "目標配分群組" : "Target scoring group"}><select className={inputClass} value={safeTargetGroup} onChange={(event) => setTargetGroup(Number(event.target.value))}>{draft.test_groups.map((_, index) => <option key={index} value={index}>{scoringGroupLabel(index, zh)}</option>)}</select></Field>
      <Field label={zh ? "已儲存版本" : "Stored versions"}><select className={inputClass} value={version} onChange={(event) => setVersion(event.target.value)}><option value={version}>{version}</option>{versions.filter((item) => item.version !== version).map((item) => <option key={item.version} value={item.version}>{item.version}{item.has_validator ? " + Validator" : ""}</option>)}</select></Field>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <ProgramField zh={zh} title="Generator" language={generatorLanguage} setLanguage={setGeneratorLanguage} source={generatorSource} setSource={setGeneratorSource} placeholder={zh ? "第一行 seed、第二行策略；將一筆完整測資輸出到 stdout" : "Read seed then strategy; emit one complete test input to stdout"} />
      <ProgramField zh={zh} title={zh ? "標準解答（Reference Solution）" : "Reference Solution"} language={referenceLanguage} setLanguage={setReferenceLanguage} source={referenceSource} setSource={setReferenceSource} placeholder={zh ? "讀取 Generator 的輸入並輸出正確答案" : "Read the generated input and emit the correct answer"} />
    </div>
    <label className="mt-4 flex items-center gap-2 text-[11px] text-slate-400"><input type="checkbox" checked={useValidator} onChange={(event) => setUseValidator(event.target.checked)} />{zh ? "使用自訂 Validator（合法回傳 0；不合法回傳 1）" : "Use a custom Validator (exit 0 when valid, 1 when invalid)"}</label>
    {useValidator ? <div className="mt-3"><ProgramField zh={zh} title="Validator" language={validatorLanguage} setLanguage={setValidatorLanguage} source={validatorSource} setSource={setValidatorSource} placeholder={zh ? "從 stdin 讀取測資；不合法時 return 1" : "Read input from stdin; exit 1 when invalid"} /></div> : null}
    <div className="mt-4 flex justify-end"><button type="button" disabled={busy || !existingId} onClick={() => void uploadVersion()} className="rounded-xl border border-cyan-300/20 px-4 py-2.5 text-[11px] font-semibold text-cyan-300 disabled:opacity-40">{zh ? "安全儲存此版本" : "Store private version"}</button></div>
    <div className="mt-5 border-t border-white/8 pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] font-semibold text-slate-300">{zh ? "測資策略與建議比例" : "Test strategies and recommended mix"}</p><button type="button" disabled={busy} onClick={() => void suggestStrategies()} className="rounded-lg border border-violet-300/20 px-3 py-2 text-[10px] font-semibold text-violet-200 disabled:opacity-40">{zh ? "AI 建議測資策略" : "AI strategy suggestions"}</button></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{generationStrategies.map((strategy) => <label key={strategy.id} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-[10px] ${selectedStrategies.includes(strategy.id) ? "border-cyan-300/20 bg-cyan-300/[0.04] text-cyan-200" : "border-white/8 text-slate-600"}`}><span className="flex items-center gap-2"><input type="checkbox" checked={selectedStrategies.includes(strategy.id)} onChange={(event) => setSelectedStrategies((items) => event.target.checked ? [...items, strategy.id] : items.filter((item) => item !== strategy.id))} />{strategy[zh ? "zh" : "en"]}</span><span>{strategy.weight}%</span></label>)}</div>{strategySuggestion ? <div className="mt-3 whitespace-pre-wrap rounded-xl border border-violet-300/15 bg-violet-300/[0.03] p-3 text-[10px] leading-5 text-slate-300">{strategySuggestion}</div> : null}<p className="mt-2 text-[9px] text-slate-600">{zh ? "AI 僅接收公開題目敘述與限制，不會接收隱藏測資、Generator 或標準解答。" : "AI receives only the public statement and constraints, never hidden cases, Generator, or Reference source."}</p></div>
    <div className="mt-5 grid gap-4 border-t border-white/8 pt-4 sm:grid-cols-4">
      <Field label={zh ? "產生數量（最多 100）" : "Case count (max 100)"}><input className={inputClass} type="number" min="1" max="100" value={count} onChange={(event) => setCount(Number(event.target.value))} /></Field>
      <Field label={zh ? "起始 seed" : "First seed"}><input className={inputClass} type="number" min="0" value={firstSeed} onChange={(event) => setFirstSeed(Number(event.target.value))} /></Field>
      <Field label={zh ? "加入方式" : "Insert mode"}><select className={inputClass} value={replaceCases ? "replace" : "append"} onChange={(event) => setReplaceCases(event.target.value === "replace")}><option value="replace">{zh ? "取代群組現有測資" : "Replace group cases"}</option><option value="append">{zh ? "加到群組末尾" : "Append to group"}</option></select></Field>
      <div className="flex items-end"><button type="button" disabled={busy || !existingId || !versions.some((item) => item.version === version)} onClick={() => void generate()} className="h-10 w-full rounded-xl bg-violet-400 px-4 text-[11px] font-bold text-slate-950 disabled:opacity-40">{busy ? (zh ? "處理中…" : "Working…") : (zh ? "產生並檢查" : "Generate and validate")}</button></div>
    </div>
    {pendingBatch ? <div className="mt-4 rounded-xl border border-violet-300/15 bg-violet-300/[0.03] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="text-xs text-violet-200">{zh ? "待套用的伺服器測資草稿" : "Server test draft ready"}</strong><p className="mt-1 text-[10px] text-slate-500">ID {pendingBatch.batch_id} · {pendingBatch.report.accepted} {zh ? "筆" : "cases"} · {pendingBatch.report.total_input_bytes} bytes</p></div><button type="button" disabled={busy} onClick={() => void applyBatch()} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-[11px] font-bold text-slate-950 disabled:opacity-40">{zh ? "套用到配分群組" : "Apply to scoring group"}</button></div><div className="mt-3 flex flex-wrap gap-2">{Object.entries(pendingBatch.report.strategy_counts).map(([strategy, strategyCount]) => <span key={strategy} className="rounded-full border border-white/8 px-2 py-1 text-[9px] text-slate-400">{strategy}: {strategyCount}</span>)}</div><p className="mt-3 text-[9px] text-slate-600">{zh ? "隱藏 Input／Expected Output 沒有傳到此頁面。" : "Hidden inputs and expected outputs were not sent to this page."}</p></div> : null}
    {error ? <Feedback tone="error" text={error} /> : null}{report ? <Feedback tone="success" text={report} /> : null}
  </section>;
}

function ProgramField({ title, language, setLanguage, source, setSource, placeholder, zh }: { title: string; language: "cpp" | "python"; setLanguage: (value: "cpp" | "python") => void; source: string; setSource: (value: string) => void; placeholder: string; zh: boolean }) {
  return <div className="rounded-xl border border-white/6 p-3"><div className="flex items-center justify-between gap-3"><strong className="text-[11px] text-slate-300">{title}</strong><select aria-label={`${title} ${zh ? "語言" : "language"}`} className="rounded-lg border border-white/8 bg-[#090f18] px-2 py-1 text-[10px] text-slate-300" value={language} onChange={(event) => setLanguage(event.target.value as "cpp" | "python")}><option value="cpp">C++20</option><option value="python">Python 3</option></select></div><textarea className={`${textareaClass} min-h-44`} value={source} placeholder={placeholder} autoComplete="off" spellCheck={false} onChange={(event) => setSource(event.target.value)} /></div>;
}

function TestGroupEditor({ draft, setDraft, zh }: DraftProps) {
  const totalScore = draft.test_groups.reduce((sum, group) => sum + Number(group.score_percent), 0);
  return (
    <section className={panelClass}>
      <SectionTitle
        title={zh ? "配分群組與隱藏測資" : "Scoring groups and hidden cases"}
        detail={zh ? "此區只有管理員可讀取。每組全數通過才取得該組分數，總分必須為 100%。" : "Only admins can read this section. A group awards points only when every case passes. Total score must be 100%."}
      />
      <div className={`mt-3 text-xs font-semibold ${totalScore === 100 ? "text-emerald-300" : "text-rose-300"}`}>
        {zh ? "目前總分" : "Current total"}：{totalScore}%
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={zh ? "執行時間限制（毫秒）" : "Time limit (ms)"}>
          <input className={inputClass} type="number" min="100" max="10000" value={draft.time_limit_ms} onChange={(event) => setDraft({ ...draft, time_limit_ms: Number(event.target.value) })} />
        </Field>
        <Field label={zh ? "記憶體限制（MB）" : "Memory limit (MB)"}>
          <input className={inputClass} type="number" min="16" max="1024" value={draft.memory_limit_mb} onChange={(event) => setDraft({ ...draft, memory_limit_mb: Number(event.target.value) })} />
        </Field>
      </div>
      <button type="button" onClick={() => setDraft({ ...draft, test_groups: [...draft.test_groups, { name: blankLocalized(), condition: blankLocalized(), score_percent: 0, cases: [{ input: "", expected_output: "" }] }] })} className="mt-3 text-[10px] text-cyan-300">
        ＋ {zh ? "新增配分群組" : "Add scoring group"}
      </button>
      <div className="mt-4 space-y-5">
        {draft.test_groups.map((group, groupIndex) => (
          <div key={groupIndex} className="rounded-2xl border border-violet-300/10 bg-violet-300/[0.02] p-4">
            <div className="flex items-center justify-between">
              <strong className="text-xs text-violet-200">{scoringGroupLabel(groupIndex, zh)}</strong>
              <button type="button" disabled={draft.test_groups.length === 1} onClick={() => setDraft({ ...draft, test_groups: draft.test_groups.filter((_, index) => index !== groupIndex) })} className="text-[9px] text-rose-300 disabled:opacity-25">
                {zh ? "移除群組" : "Remove group"}
              </button>
            </div>
            <LocalizedEditor zh={zh} label={zh ? "群組名稱" : "Group name"} value={group.name} onChange={(name) => setDraft({ ...draft, test_groups: draft.test_groups.map((item, index) => index === groupIndex ? { ...item, name } : item) })} />
            <LocalizedEditor zh={zh} label={zh ? "得分條件" : "Scoring condition"} value={group.condition} onChange={(condition) => setDraft({ ...draft, test_groups: draft.test_groups.map((item, index) => index === groupIndex ? { ...item, condition } : item) })} multiline />
            <Field label={zh ? "占分百分比" : "Score percent"}>
              <input className={`${inputClass} max-w-40`} type="number" min="1" max="100" value={group.score_percent} onChange={(event) => setDraft({ ...draft, test_groups: draft.test_groups.map((item, index) => index === groupIndex ? { ...item, score_percent: Number(event.target.value) } : item) })} />
            </Field>
            <div className="mt-5 flex items-center justify-between">
              <p className="text-[10px] font-semibold text-slate-300">{zh ? `隱藏測資：${group.cases.length} 筆` : `Hidden cases: ${group.cases.length}`}</p>
              <button type="button" onClick={() => setDraft({ ...draft, test_groups: draft.test_groups.map((item, index) => index === groupIndex ? { ...item, cases: [...item.cases, { input: "", expected_output: "" }] } : item) })} className="text-[10px] text-cyan-300">
                ＋ {zh ? "新增測資" : "Add case"}
              </button>
            </div>
            <div className="mt-2 space-y-3">
              {group.cases.map((testCase, caseIndex) => (
                <div key={caseIndex} className="grid gap-3 rounded-xl border border-white/6 p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Field label={zh ? `輸入 ${caseIndex + 1}` : `Input ${caseIndex + 1}`}>
                    <textarea className={textareaClass} value={testCase.input} onChange={(event) => setDraft({ ...draft, test_groups: draft.test_groups.map((item, index) => index === groupIndex ? { ...item, cases: item.cases.map((caseItem, indexOfCase) => indexOfCase === caseIndex ? { ...caseItem, input: event.target.value } : caseItem) } : item) })} />
                  </Field>
                  <Field label={zh ? `預期輸出 ${caseIndex + 1}` : `Expected output ${caseIndex + 1}`}>
                    <textarea className={textareaClass} value={testCase.expected_output} onChange={(event) => setDraft({ ...draft, test_groups: draft.test_groups.map((item, index) => index === groupIndex ? { ...item, cases: item.cases.map((caseItem, indexOfCase) => indexOfCase === caseIndex ? { ...caseItem, expected_output: event.target.value } : caseItem) } : item) })} />
                  </Field>
                  <button type="button" disabled={group.cases.length === 1} onClick={() => setDraft({ ...draft, test_groups: draft.test_groups.map((item, index) => index === groupIndex ? { ...item, cases: item.cases.filter((_, indexOfCase) => indexOfCase !== caseIndex) } : item) })} className="self-end pb-3 text-[9px] text-rose-300 disabled:opacity-25">
                    {zh ? "移除" : "Remove"}
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
