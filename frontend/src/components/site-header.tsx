const primaryItems = [
  { label: "首頁", active: false },
  { label: "工作區", active: true },
  { label: "測驗", active: false, comingSoon: true },
  { label: "關於我們", active: false },
];

function SettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="1.7">
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.9 1.9-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.09h-2.7V20a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.9-1.9.06-.06A1.7 1.7 0 0 0 7.76 15a1.7 1.7 0 0 0-1.56-1.03h-.09v-2.7h.09a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.9-1.9.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56v-.09h2.7v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.9 1.9-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.09v2.7h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="1.7">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.7 19c.7-3.2 3-5 6.3-5s5.6 1.8 6.3 5" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="flex min-h-16 shrink-0 items-center border-b border-white/10 bg-[#0d121c] px-4 sm:px-6">
      <div className="flex min-w-max items-center gap-2">
        <span className="size-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.65)]" />
        <p className="text-sm font-semibold tracking-wide text-white">Code Tutor</p>
      </div>

      <nav aria-label="主要導覽" className="ml-8 hidden h-16 items-center gap-1 md:flex">
        {primaryItems.map((item) => (
          <button
            key={item.label}
            type="button"
            aria-current={item.active ? "page" : undefined}
            aria-disabled={item.comingSoon || undefined}
            className={`relative flex h-full items-center gap-1.5 px-3 text-xs transition-colors ${
              item.active
                ? "text-cyan-200"
                : item.comingSoon
                  ? "cursor-default text-slate-600"
                  : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {item.label}
            {item.comingSoon && (
              <span className="rounded-full border border-white/8 bg-white/[0.035] px-1.5 py-0.5 text-[8px] text-slate-600">
                即將推出
              </span>
            )}
            {item.active && <span className="absolute inset-x-3 bottom-0 h-px bg-cyan-300" />}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          className="hidden items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 lg:flex"
        >
          <SettingsIcon />
          設定
        </button>
        <button
          type="button"
          className="hidden items-center gap-2 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2 text-[11px] text-slate-400 transition-colors hover:border-white/15 sm:flex"
          aria-label="選擇顯示語言，目前為繁體中文"
        >
          <span aria-hidden="true">文</span>
          繁體中文
          <span className="text-[9px] text-slate-600" aria-hidden="true">⌄</span>
        </button>
        <button
          className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:border-cyan-300/30 hover:text-cyan-200"
          type="button"
          aria-label="開啟帳號選單"
        >
          <UserIcon />
        </button>
      </div>
    </header>
  );
}
