"use client";

import { useLanguage } from "@/lib/language-context";

export function QuizComingSoon() {
  const { language } = useLanguage();
  const zh = language === "zh-Hant";
  return (
    <section className="grid flex-1 place-items-center px-6 py-20 text-center">
      <div className="max-w-xl">
        <span className="mx-auto block size-2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.6)]" />
        <h1 className="mt-5 text-2xl font-semibold text-white">
          {zh ? "測驗功能即將推出" : "Quiz is coming soon"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          {zh ? "完成題庫與作答紀錄後，會在這裡提供限時與分類測驗。" : "Timed and categorized quizzes will appear here after the problem and submission systems are complete."}
        </p>
      </div>
    </section>
  );
}
