import { AiTutorPanel } from "@/components/workspace/ai-tutor-panel";
import { CodeEditorPanel } from "@/components/workspace/code-editor-panel";
import { HistoryPanel } from "@/components/workspace/history-panel";
import { OutputPanel } from "@/components/workspace/output-panel";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-[#090d14] text-slate-200">
      <SiteHeader />

      <section className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(420px,1fr)_320px]">
        <HistoryPanel />

        <div className="flex min-h-[680px] min-w-0 flex-col border-white/10 lg:border-x">
          <CodeEditorPanel />
          <OutputPanel />
        </div>

        <AiTutorPanel />
      </section>
    </main>
  );
}
