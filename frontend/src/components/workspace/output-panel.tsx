export function OutputPanel() {
  return (
    <section className="h-52 shrink-0 border-t border-white/10 bg-[#090e16]">
      <div className="flex h-10 items-center justify-between border-b border-white/8 px-4">
        <div className="flex h-full items-center gap-5 text-[11px] font-medium">
          <button className="h-full border-b border-cyan-300 text-cyan-200" type="button">
            OUTPUT
          </button>
          <button className="h-full text-slate-600" type="button">
            INPUT
          </button>
          <button className="h-full text-slate-600" type="button">
            PROBLEMS <span className="ml-1 rounded bg-white/5 px-1">0</span>
          </button>
        </div>
        <button className="text-xs text-slate-600" type="button" aria-label="Clear output">
          Clear
        </button>
      </div>

      <div className="flex h-[calc(100%-2.5rem)] flex-col justify-between p-4 font-mono text-xs">
        <div className="space-y-2">
          <p className="text-slate-600">$ g++ main.cpp -std=c++20 && ./a.out</p>
          <p className="text-slate-300">15</p>
        </div>
        <div className="flex items-center justify-between border-t border-white/5 pt-3">
          <div className="flex items-center gap-2 text-emerald-300">
            <span className="grid size-4 place-items-center rounded-full bg-emerald-400/10 text-[9px]">✓</span>
            Process finished successfully
          </div>
          <span className="text-slate-600">42 ms</span>
        </div>
      </div>
    </section>
  );
}
