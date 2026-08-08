const historyItems = [
  { title: "Binary Search", time: "10:42" },
  { title: "DFS Traversal", time: "09:18" },
  { title: "Array Sum", time: "Yesterday" },
];

export function HistoryPanel() {
  return (
    <aside className="hidden bg-[#0b1018] p-4 lg:block">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">History</h2>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-lg border border-white/10 bg-white/5 text-lg leading-none text-slate-400"
          aria-label="Create new file"
        >
          +
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2 text-xs text-slate-500">
        <span aria-hidden="true">⌕</span>
        Search submissions
      </div>

      <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Recent runs
      </p>
      <div className="space-y-1.5">
        {historyItems.map((item, index) => (
          <button
            key={item.title}
            type="button"
            className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
              index === 0
                ? "border-cyan-400/20 bg-cyan-400/[0.07]"
                : "border-transparent hover:bg-white/[0.035]"
            }`}
          >
            <span className="block truncate text-xs font-medium text-slate-300">
              {item.title}
            </span>
            <p className="mt-1.5 text-[10px] text-slate-600">{item.time}</p>
          </button>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-violet-400/15 bg-violet-400/[0.04] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
          Learning focus
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          Watch boundary conditions in binary search problems.
        </p>
      </div>
    </aside>
  );
}
