"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { streamAiTutor, type AiTutorAction } from "@/lib/ai-tutor-api";
import { useLanguage } from "@/lib/language-context";

type TutorMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const actions: Array<{ action: AiTutorAction; icon: string }> = [
  { action: "analyze", icon: "AI" },
  { action: "explain_error", icon: "!" },
  { action: "hint", icon: "?" },
];

function messageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export function AiTutorPanel({ code, errorOutput }: { code: string; errorOutput: string }) {
  const { language, t } = useLanguage();
  const zh = language === "zh-Hant";
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const labels: Record<AiTutorAction, { title: string; detail: string }> = {
    analyze: { title: t("analyzeCode"), detail: t("analyzeCodeDetail") },
    explain_error: { title: t("explainError"), detail: t("explainErrorDetail") },
    hint: { title: t("giveHint"), detail: t("giveHintDetail") },
    ask: { title: zh ? "詢問 AI" : "Ask AI", detail: "" },
  };

  const send = async (action: AiTutorAction, customQuestion = "") => {
    if (busy || (action === "ask" && !customQuestion.trim())) return;
    const assistantId = messageId();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setMessages((current) => [
      ...current,
      {
        id: messageId(),
        role: "user",
        content: action === "ask" ? customQuestion.trim() : labels[action].title,
      },
      { id: assistantId, role: "assistant", content: "" },
    ]);
    if (action === "ask") setQuestion("");

    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    try {
      await streamAiTutor(
        {
          action,
          code,
          errorOutput,
          question: customQuestion.trim(),
          language,
        },
        (chunk) => {
          setMessages((current) => current.map((message) =>
            message.id === assistantId
              ? { ...message, content: message.content + chunk }
              : message,
          ));
        },
        controller.signal,
      );
    } catch (requestError) {
      const stopped = requestError instanceof Error && requestError.name === "AbortError";
      const message = stopped
        ? (zh ? "已停止這次回答。" : "This response was stopped.")
        : requestError instanceof Error
          ? requestError.message
          : (zh ? "AI Tutor 暫時無法使用。" : "AI Tutor is temporarily unavailable.");
      setMessages((current) => current.map((item) =>
        item.id === assistantId && !item.content ? { ...item, content: message } : item,
      ));
      if (!stopped) setError(message);
    } finally {
      window.clearTimeout(timeout);
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send("ask", question);
  };

  return (
    <aside className="flex min-h-[520px] min-w-0 flex-col bg-[#0b1018]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/8 px-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-violet-300">AI</span>
          <h2 className="text-xs font-semibold text-slate-200">{t("aiTutor")}</h2>
        </div>
        <span className="rounded-full border border-violet-400/15 bg-violet-400/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-300">
          {t("coachMode")}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="rounded-2xl rounded-tl-md border border-white/8 bg-white/[0.035] p-4">
            <p className="text-xs leading-5 text-slate-300">{t("tutorGreeting")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-2xl border p-3 text-xs leading-5 whitespace-pre-wrap break-words ${
                  message.role === "user"
                    ? "ml-7 rounded-tr-md border-cyan-400/10 bg-cyan-400/[0.04] text-slate-300"
                    : "mr-3 rounded-tl-md border-white/8 bg-white/[0.035] text-slate-300"
                }`}
              >
                {message.content || (zh ? "正在思考…" : "Thinking…")}
              </div>
            ))}
          </div>
        )}

        <p className="mb-2 mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          {t("quickActions")}
        </p>
        <div className="space-y-2">
          {actions.map(({ action, icon }) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              onClick={() => void send(action)}
              className="group flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-3 text-left transition-colors hover:border-cyan-400/20 hover:bg-cyan-400/[0.04] disabled:cursor-wait disabled:opacity-50"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-800 text-[10px] font-semibold text-cyan-300 group-hover:bg-cyan-400/10">
                {icon}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-slate-300">{labels[action].title}</span>
                <span className="mt-0.5 block truncate text-[10px] text-slate-600">{labels[action].detail}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.025] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">{t("context")}</p>
            <span className="size-1.5 rounded-full bg-cyan-300" />
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">{t("contextDetail")}</p>
        </div>
        {error ? <p className="mt-3 text-[11px] leading-5 text-rose-400" role="alert">{error}</p> : null}
      </div>

      <form onSubmit={submit} className="border-t border-white/8 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-white/[0.035] p-2 pl-3 focus-within:border-violet-400/30">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (question.trim()) void send("ask", question);
              }
            }}
            rows={1}
            maxLength={2000}
            disabled={busy}
            placeholder={t("askCode")}
            aria-label={t("askCode")}
            className="max-h-28 min-h-7 flex-1 resize-none bg-transparent py-1 text-[11px] text-slate-300 outline-none placeholder:text-slate-600 disabled:cursor-wait"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="h-8 shrink-0 rounded-lg border border-rose-400/25 px-2 text-[10px] font-semibold text-rose-300"
            >
              {zh ? "停止" : "Stop"}
            </button>
          ) : (
            <button
              type="submit"
              disabled={!question.trim()}
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-400 text-sm font-bold text-slate-950 disabled:cursor-default disabled:opacity-40"
              aria-label={t("sendMessage")}
            >
              ↑
            </button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-[9px] text-slate-700">
          {zh ? "Enter 送出，Shift + Enter 換行。AI 不會自動修改檔案。" : "Enter to send, Shift + Enter for a new line. AI never edits files automatically."}
        </p>
      </form>
    </aside>
  );
}
