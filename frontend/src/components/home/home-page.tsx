"use client";

import type { PrimarySection } from "@/components/site-header";
import { useLanguage } from "@/lib/language-context";

type HomePageProps = {
  onSelect: (section: PrimarySection) => void;
};

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 fill-none stroke-current" strokeWidth="1.6">
      <path d="M4 10h11m-4-4 4 4-4 4" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="1.5">
      <path d="M3.5 6.5h6l2 2h9v10h-17v-12Z" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="1.5">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="m7 9 2.5 2.5L7 14m5 0h5" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="1.5">
      <path d="M12 3c.5 4.2 2.8 6.5 7 7-4.2.5-6.5 2.8-7 7-.5-4.2-2.8-6.5-7-7 4.2-.5 6.5-2.8 7-7Z" />
      <path d="M19 16c.2 1.7 1.1 2.6 2.8 2.8-1.7.2-2.6 1.1-2.8 2.8-.2-1.7-1.1-2.6-2.8-2.8 1.7-.2 2.6-1.1 2.8-2.8Z" />
    </svg>
  );
}

export function HomePage({ onSelect }: HomePageProps) {
  const { t } = useLanguage();
  const features = [
    { icon: <FolderIcon />, title: t("homeFilesFeatureTitle"), detail: t("homeFilesFeatureDetail") },
    { icon: <TerminalIcon />, title: t("homeCompilerFeatureTitle"), detail: t("homeCompilerFeatureDetail") },
    { icon: <SparkIcon />, title: t("homeAiFeatureTitle"), detail: t("homeAiFeatureDetail") },
  ];
  const steps = [
    { title: t("homeStepOneTitle"), detail: t("homeStepOneDetail") },
    { title: t("homeStepTwoTitle"), detail: t("homeStepTwoDetail") },
    { title: t("homeStepThreeTitle"), detail: t("homeStepThreeDetail") },
  ];

  return (
    <div className="min-w-0 flex-1 overflow-x-hidden">
      <section className="relative border-b border-white/8 px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_34%,rgba(34,211,238,0.08),transparent_32%),linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:auto,42px_42px,42px_42px]" />
        <div className="relative mx-auto grid w-full min-w-0 max-w-6xl grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.045] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
              <span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_9px_rgba(103,232,249,0.7)]" />
              {t("homeEyebrow")}
            </div>
            <h1 className="mt-7 max-w-2xl break-words text-3xl font-semibold leading-[1.16] tracking-[-0.035em] text-white sm:text-5xl sm:leading-[1.12] lg:text-[3.5rem]">
              {t("homeHeroTitle")}
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-slate-400 sm:text-base">
              {t("homeHeroDetail")}
            </p>
            <div className="mt-8 flex min-w-0 flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => onSelect("files")} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 text-xs font-bold text-slate-950 shadow-[0_0_26px_rgba(34,211,238,0.14)] transition-colors hover:bg-cyan-300 sm:w-auto">
                {t("homePrimaryAction")}
                <ArrowIcon />
              </button>
              <button type="button" onClick={() => onSelect("problems")} className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.025] px-5 text-xs font-semibold text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.045] sm:w-auto">
                {t("homeSecondaryAction")}
              </button>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0b111a] shadow-2xl shadow-black/35">
            <div className="flex h-11 items-center justify-between border-b border-white/8 bg-[#0d141f] px-4">
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <span className="size-2 rounded-full bg-rose-400/65" />
                <span className="size-2 rounded-full bg-amber-300/65" />
                <span className="size-2 rounded-full bg-emerald-400/65" />
                <span className="ml-2">{t("homePreviewProject")}</span>
              </div>
              <span className="rounded-md border border-white/8 px-2 py-1 font-mono text-[9px] text-slate-600">main.cpp</span>
            </div>
            <div className="grid min-h-72 min-w-0 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,0.56fr)]">
              <pre className="w-full max-w-full overflow-x-auto border-b border-white/8 p-5 font-mono text-[11px] leading-7 text-slate-400 md:border-b-0 md:border-r"><code><span className="text-fuchsia-300">#include</span> <span className="text-emerald-300">&lt;iostream&gt;</span>{"\n\n"}<span className="text-fuchsia-300">int</span> <span className="text-cyan-200">main</span>() {`{`}{"\n"}  std::cout &lt;&lt; <span className="text-emerald-300">&quot;Hello, Code Tutor!&quot;</span>;{"\n"}  <span className="text-fuchsia-300">return</span> <span className="text-cyan-200">0</span>;{"\n"}{`}`}</code></pre>
              <div className="flex flex-col bg-[#080d14] p-5 font-mono text-[10px]">
                <p className="uppercase tracking-[0.18em] text-slate-600">{t("homePreviewOutput")}</p>
                <p className="mt-5 text-slate-300">Hello, Code Tutor!</p>
                <div className="mt-auto flex items-center gap-2 border-t border-white/8 pt-4 text-emerald-300/80">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  {t("homePreviewStatus")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300">{t("homeFeaturesLabel")}</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{t("homeFeaturesTitle")}</h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-500 lg:justify-self-end">{t("homeFeaturesDetail")}</p>
          </div>
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-2xl border border-white/8 bg-[#0d131d] p-6 transition-colors hover:border-cyan-300/20">
                <div className="grid size-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] text-cyan-200">{feature.icon}</div>
                <h3 className="mt-5 text-sm font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-xs leading-6 text-slate-500">{feature.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#0b1018] px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300">{t("homeStepsLabel")}</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{t("homeStepsTitle")}</h2>
          <div className="mt-9 grid gap-px overflow-hidden rounded-2xl border border-white/8 bg-white/8 md:grid-cols-3">
            {steps.map((step, index) => (
              <article key={step.title} className="bg-[#0d131d] p-6 sm:p-7">
                <span className="font-mono text-xs text-cyan-300/70">0{index + 1}</span>
                <h3 className="mt-5 text-sm font-semibold text-white">{step.title}</h3>
                <p className="mt-3 text-xs leading-6 text-slate-500">{step.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-7 rounded-2xl border border-cyan-300/15 bg-[linear-gradient(110deg,rgba(34,211,238,0.07),rgba(13,19,29,0.9)_55%)] p-7 sm:p-9 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-semibold text-white">{t("homeReadyTitle")}</h2>
            <p className="mt-3 max-w-2xl text-xs leading-6 text-slate-400">{t("homeReadyDetail")}</p>
          </div>
          <button type="button" onClick={() => onSelect("files")} className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-cyan-400 px-5 text-xs font-bold text-slate-950 hover:bg-cyan-300">
            {t("homeReadyAction")}
            <ArrowIcon />
          </button>
        </div>
      </section>
    </div>
  );
}
