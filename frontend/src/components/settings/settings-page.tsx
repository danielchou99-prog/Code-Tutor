"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { connectAi, getAiConnection, type AiConnectionStatus, removeAiConnection } from "@/lib/ai-connection-api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { type AppSettings, useSettings } from "@/lib/settings-context";

type SettingsSection =
  | "profile"
  | "appearance"
  | "editor"
  | "layout"
  | "font"
  | "execution"
  | "shortcuts"
  | "notifications"
  | "language"
  | "ai"
  | "security"
  | "danger";

const sections: Array<{ id: SettingsSection; icon: string; zh: string; en: string }> = [
  { id: "profile", icon: "♟", zh: "個人資料", en: "Profile" },
  { id: "appearance", icon: "◉", zh: "外觀", en: "Appearance" },
  { id: "editor", icon: "▣", zh: "Compiler / Editor", en: "Compiler / Editor" },
  { id: "layout", icon: "▤", zh: "版面配置", en: "Layout" },
  { id: "font", icon: "Aa", zh: "字體", en: "Font" },
  { id: "execution", icon: "▶", zh: "執行設定", en: "Run settings" },
  { id: "shortcuts", icon: "⌨", zh: "快捷鍵", en: "Shortcuts" },
  { id: "notifications", icon: "●", zh: "通知", en: "Notifications" },
  { id: "language", icon: "◎", zh: "語言", en: "Language" },
  { id: "ai", icon: "✦", zh: "AI / Groq", en: "AI / Groq" },
  { id: "security", icon: "◇", zh: "帳號安全", en: "Account security" },
  { id: "danger", icon: "△", zh: "危險區域", en: "Danger zone" },
];

const inputClass = "mt-2 h-10 w-full rounded-xl border border-white/8 bg-[#090f18] px-3 text-xs text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-50";
const cardClass = "rounded-2xl border border-white/8 bg-[#0d141f] p-5 sm:p-6";

function SettingHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border-b border-white/8 pb-5">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="mt-2 text-xs leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

function SettingRow({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/6 py-5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-lg">
        <p className="text-xs font-semibold text-slate-200">{title}</p>
        {detail ? <p className="mt-1.5 text-[11px] leading-5 text-slate-600">{detail}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, disabled = false, label }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${checked ? "border-cyan-300/30 bg-cyan-400/25" : "border-white/10 bg-white/5"}`}>
      <span className={`absolute top-0.5 size-4.5 rounded-full transition-all ${checked ? "left-[1.35rem] bg-cyan-300" : "left-0.5 bg-slate-500"}`} />
    </button>
  );
}

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string; disabled?: boolean }>; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-white/8 bg-[#090f18] p-1">
      {options.map((option) => (
        <button key={option.value} type="button" disabled={option.disabled} onClick={() => onChange(option.value)} className={`rounded-lg px-3 py-2 text-[10px] transition-colors disabled:cursor-not-allowed disabled:text-slate-700 ${value === option.value ? "bg-cyan-300/10 text-cyan-200" : "text-slate-500 hover:text-slate-300"}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPage() {
  const { language, setLanguage, t } = useLanguage();
  const { settings, updateSettings, resetSettings } = useSettings();
  const { user, updateEmail, updatePassword, updateProfile, signOutAll } = useAuth();
  const zh = language === "zh-Hant";
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"remove-groq" | "signout-all" | null>(null);
  const [groqRevision, setGroqRevision] = useState(0);

  const clearFeedback = () => { setMessage(null); setError(null); };
  const showResult = (result: { error: string | null }, success: string) => {
    if (result.error) {
      setMessage(null);
      setError(result.error);
    } else {
      setError(null);
      setMessage(success);
    }
  };

  return (
    <section className="min-w-0 flex-1 px-4 py-8 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300">Code Tutor</p>
          <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">{zh ? "設定" : "Settings"}</h1>
          <p className="mt-2 text-xs leading-6 text-slate-500">{zh ? "管理個人資料、編輯器、執行方式、AI 連線與帳號安全。" : "Manage your profile, editor, run behavior, AI connection, and account security."}</p>
        </div>

        <div className="mt-8 grid min-w-0 gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav aria-label={zh ? "設定分類" : "Settings categories"} className="flex gap-2 overflow-x-auto pb-2 lg:block lg:overflow-visible lg:pb-0">
            {sections.map((section) => (
              <button key={section.id} type="button" onClick={() => { setActiveSection(section.id); clearFeedback(); }} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition-colors lg:mb-1 lg:w-full ${activeSection === section.id ? "bg-cyan-300/8 text-cyan-200" : "text-slate-500 hover:bg-white/[0.025] hover:text-slate-300"}`}>
                <span className="grid w-5 place-items-center font-mono text-[11px] text-cyan-300/70" aria-hidden="true">{section.icon}</span>
                {zh ? section.zh : section.en}
              </button>
            ))}
          </nav>

          <div className="min-w-0 rounded-2xl border border-white/8 bg-[#0b111a] p-5 sm:p-7">
            {activeSection === "profile" ? <ProfileSettings key={user?.id ?? "guest"} user={user} busy={busy} setBusy={setBusy} updateProfile={updateProfile} showResult={showResult} zh={zh} /> : null}
            {activeSection === "appearance" ? <AppearanceSettings settings={settings} updateSettings={updateSettings} zh={zh} /> : null}
            {activeSection === "editor" ? <EditorSettings settings={settings} updateSettings={updateSettings} zh={zh} /> : null}
            {activeSection === "layout" ? <LayoutSettings settings={settings} updateSettings={updateSettings} zh={zh} /> : null}
            {activeSection === "font" ? <FontSettings settings={settings} updateSettings={updateSettings} zh={zh} /> : null}
            {activeSection === "execution" ? <ExecutionSettings settings={settings} updateSettings={updateSettings} zh={zh} /> : null}
            {activeSection === "shortcuts" ? <ShortcutSettings settings={settings} updateSettings={updateSettings} zh={zh} /> : null}
            {activeSection === "notifications" ? <NotificationSettings settings={settings} updateSettings={updateSettings} zh={zh} /> : null}
            {activeSection === "language" ? <LanguageSettings language={language} setLanguage={setLanguage} zh={zh} /> : null}
            {activeSection === "ai" ? <GroqSettings key={`${user?.id ?? "guest"}-${groqRevision}`} user={user} busy={busy} setBusy={setBusy} setConfirmAction={setConfirmAction} showResult={showResult} setError={setError} zh={zh} /> : null}
            {activeSection === "security" ? <SecuritySettings key={user?.id ?? "guest"} user={user} busy={busy} setBusy={setBusy} updateEmail={updateEmail} updatePassword={updatePassword} showResult={showResult} zh={zh} /> : null}
            {activeSection === "danger" ? <DangerSettings user={user} setConfirmAction={setConfirmAction} zh={zh} /> : null}

            {error ? <p role="alert" className="mt-5 rounded-xl border border-rose-300/15 bg-rose-300/[0.04] p-3 text-[11px] leading-5 text-rose-300">{error}</p> : null}
            {message ? <p role="status" className="mt-5 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.04] p-3 text-[11px] leading-5 text-emerald-300">{message}</p> : null}

            {!(["profile", "ai", "security", "danger"] as SettingsSection[]).includes(activeSection) ? (
              <div className="mt-7 flex justify-end">
                <button type="button" onClick={resetSettings} className="rounded-lg border border-white/8 px-4 py-2 text-[10px] text-slate-500 hover:text-slate-300">{zh ? "恢復預設值" : "Restore defaults"}</button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === "remove-groq" ? (zh ? "移除 Groq 連線？" : "Remove Groq connection?") : (zh ? "登出所有裝置？" : "Sign out every device?")}
        description={confirmAction === "remove-groq" ? (zh ? "加密保存的 API Key 將從 Code Tutor 刪除。" : "The encrypted API key will be deleted from Code Tutor.") : (zh ? "目前瀏覽器與其他登入中的裝置都需要重新登入。" : "This browser and every other signed-in device will need to sign in again.")}
        confirmLabel={confirmAction === "remove-groq" ? (zh ? "移除" : "Remove") : (zh ? "全部登出" : "Sign out all")}
        cancelLabel={t("cancel")}
        closeLabel={t("closeDialog")}
        busy={busy}
        tone="danger"
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          setBusy(true);
          clearFeedback();
          if (confirmAction === "remove-groq") {
            try {
              await removeAiConnection();
              setMessage(zh ? "Groq 連線已移除。" : "Groq connection removed.");
              setGroqRevision((current) => current + 1);
            } catch (requestError) {
              setError(requestError instanceof Error ? requestError.message : (zh ? "無法移除 Groq。" : "Could not remove Groq."));
            }
          } else {
            showResult(await signOutAll(), zh ? "所有裝置已登出。" : "Every device has been signed out.");
          }
          setBusy(false);
          setConfirmAction(null);
        }}
      />
    </section>
  );
}

type AccountUser = ReturnType<typeof useAuth>["user"];
type ResultFunction = (result: { error: string | null }, success: string) => void;

function ProfileSettings({ user, busy, setBusy, updateProfile, showResult, zh }: { user: AccountUser; busy: boolean; setBusy: (value: boolean) => void; updateProfile: ReturnType<typeof useAuth>["updateProfile"]; showResult: ResultFunction; zh: boolean }) {
  const [displayName, setDisplayName] = useState(user?.user_metadata.display_name ?? "");
  const [username, setUsername] = useState(user?.user_metadata.username ?? "");
  const [bio, setBio] = useState(user?.user_metadata.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata.avatar_url ?? "");
  const initial = (displayName || username || user?.email || "?").trim().charAt(0).toUpperCase();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || busy) return;
    if (username && !/^[a-zA-Z0-9_]{3,24}$/u.test(username)) {
      showResult({ error: zh ? "Username 需為 3–24 個英文字母、數字或底線。" : "Username must contain 3–24 letters, numbers, or underscores." }, "");
      return;
    }
    setBusy(true);
    showResult(await updateProfile({ display_name: displayName.trim(), username: username.trim(), bio: bio.trim(), avatar_url: avatarUrl.trim() }), zh ? "個人資料已更新。" : "Profile updated.");
    setBusy(false);
  };

  return (
    <>
      <SettingHeader title={zh ? "個人資料" : "Profile"} detail={zh ? "設定其他使用者會看到的基本資料。" : "Set the basic information shown for your account."} />
      {!user ? <SignInNotice zh={zh} /> : (
        <form onSubmit={(event) => void submit(event)} className="mt-6">
          <div className="flex items-center gap-4">
            <div className="grid size-14 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] text-lg font-semibold text-cyan-200">{initial}</div>
            <div><p className="text-xs font-semibold text-white">{displayName || user.email}</p><p className="mt-1 text-[10px] text-slate-600">{user.email}</p></div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-[11px] text-slate-400">{zh ? "暱稱" : "Display name"}<input className={inputClass} value={displayName} maxLength={50} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <label className="text-[11px] text-slate-400">Username<input className={inputClass} value={username} maxLength={24} placeholder="daniel_chou" onChange={(event) => setUsername(event.target.value)} /></label>
          </div>
          <label className="mt-4 block text-[11px] text-slate-400">{zh ? "頭像網址" : "Avatar URL"}<input className={inputClass} type="url" value={avatarUrl} placeholder="https://…" onChange={(event) => setAvatarUrl(event.target.value)} /></label>
          <label className="mt-4 block text-[11px] text-slate-400">{zh ? "自我介紹" : "Bio"}<textarea className="mt-2 min-h-24 w-full resize-y rounded-xl border border-white/8 bg-[#090f18] p-3 text-xs leading-6 text-slate-200 outline-none focus:border-cyan-300/30" value={bio} maxLength={240} onChange={(event) => setBio(event.target.value)} /></label>
          <div className="mt-5 flex justify-end"><button disabled={busy} className="h-10 rounded-xl bg-cyan-400 px-5 text-xs font-bold text-slate-950 disabled:opacity-50">{busy ? (zh ? "儲存中…" : "Saving…") : (zh ? "儲存個人資料" : "Save profile")}</button></div>
        </form>
      )}
    </>
  );
}

function AppearanceSettings({ settings, updateSettings, zh }: PreferenceProps) {
  return <><SettingHeader title={zh ? "外觀" : "Appearance"} detail={zh ? "調整網站的顏色與背景風格。" : "Adjust the site colors and background style."} /><div className="mt-2"><SettingRow title={zh ? "色彩模式" : "Color mode"} detail={zh ? "切換後會立即套用，並保存在這台裝置。" : "Changes apply immediately and are saved on this device."}><Segmented value={settings.theme} options={[{ value: "dark", label: zh ? "深色" : "Dark" }, { value: "light", label: zh ? "淺色" : "Light" }]} onChange={(theme) => updateSettings({ theme })} /></SettingRow><SettingRow title={zh ? "主題色" : "Accent color"}><Segmented value={settings.accent} options={[{ value: "cyan", label: zh ? "青色" : "Cyan" }, { value: "violet", label: zh ? "紫色" : "Violet" }, { value: "emerald", label: zh ? "綠色" : "Emerald" }]} onChange={(accent) => updateSettings({ accent })} /></SettingRow><SettingRow title={zh ? "背景" : "Background"}><Segmented value={settings.background} options={[{ value: "plain", label: zh ? "純色" : "Plain" }, { value: "grid", label: zh ? "格線" : "Grid" }, { value: "soft", label: zh ? "柔光" : "Soft glow" }]} onChange={(background) => updateSettings({ background })} /></SettingRow></div></>;
}

type PreferenceProps = { settings: AppSettings; updateSettings: (value: Partial<AppSettings>) => void; zh: boolean };

function EditorSettings({ settings, updateSettings, zh }: PreferenceProps) {
  return <><SettingHeader title="Compiler / Editor" detail={zh ? "設定預設語言與程式碼編輯體驗。" : "Configure the default language and code editing experience."} /><div className="mt-2"><SettingRow title={zh ? "預設語言" : "Default language"} detail={zh ? "建立新 Project 時會預先選取此語言。" : "Preselect this language when creating a project."}><Segmented value={settings.defaultProgrammingLanguage} options={[{ value: "cpp" as const, label: "C++20" }, { value: "python" as const, label: "Python 3" }]} onChange={(defaultProgrammingLanguage) => updateSettings({ defaultProgrammingLanguage })} /></SettingRow><SettingRow title={zh ? "字體大小" : "Font size"} detail={`${settings.editorFontSize}px`}><input aria-label={zh ? "編輯器字體大小" : "Editor font size"} type="range" min="12" max="20" value={settings.editorFontSize} onChange={(event) => updateSettings({ editorFontSize: Number(event.target.value) })} className="w-44 accent-cyan-300" /></SettingRow><SettingRow title="Tab width"><Segmented value={settings.tabSize} options={[2, 4, 8].map((value) => ({ value: value as 2 | 4 | 8, label: String(value) }))} onChange={(tabSize) => updateSettings({ tabSize })} /></SettingRow><SettingRow title="Word Wrap" detail={zh ? "讓過長的程式碼在編輯器內換行。" : "Wrap long code inside the editor."}><Switch label="Word Wrap" checked={settings.wordWrap} onChange={(wordWrap) => updateSettings({ wordWrap })} /></SettingRow></div></>;
}

function LayoutSettings({ settings, updateSettings, zh }: PreferenceProps) {
  return <><SettingHeader title={zh ? "版面配置" : "Layout"} detail={zh ? "調整 Project 工作區各區域的尺寸與位置。" : "Adjust the size and placement of Project workspace panels."} /><div className="mt-2"><SettingRow title={zh ? "檔案側欄寬度" : "File sidebar width"} detail={`${settings.sidebarWidth}px`}><input type="range" min="180" max="280" step="10" value={settings.sidebarWidth} onChange={(event) => updateSettings({ sidebarWidth: Number(event.target.value) })} className="w-44 accent-cyan-300" /></SettingRow><SettingRow title={zh ? "AI 面板寬度" : "AI panel width"} detail={`${settings.aiPanelWidth}px`}><input type="range" min="280" max="420" step="10" value={settings.aiPanelWidth} onChange={(event) => updateSettings({ aiPanelWidth: Number(event.target.value) })} className="w-44 accent-cyan-300" /></SettingRow><SettingRow title={zh ? "Console 高度" : "Console height"} detail={`${settings.consoleHeight}px`}><input type="range" min="160" max="360" step="16" value={settings.consoleHeight} onChange={(event) => updateSettings({ consoleHeight: Number(event.target.value) })} className="w-44 accent-cyan-300" /></SettingRow><SettingRow title={zh ? "AI 配置" : "AI placement"}><Segmented value={settings.panelPlacement} options={[{ value: "right", label: zh ? "右側" : "Right" }, { value: "bottom", label: zh ? "下方" : "Bottom" }]} onChange={(panelPlacement) => updateSettings({ panelPlacement })} /></SettingRow></div></>;
}

function FontSettings({ settings, updateSettings, zh }: PreferenceProps) {
  const fonts = ["JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas"] as const;
  return <><SettingHeader title={zh ? "字體" : "Font"} detail={zh ? "選擇程式碼編輯器與 Console 使用的等寬字體。未安裝時會自動使用備用字體。" : "Choose a monospace font for the editor and console. A fallback is used when it is not installed."} /><div className="mt-6 grid gap-3 sm:grid-cols-2">{fonts.map((font) => <button key={font} type="button" onClick={() => updateSettings({ editorFont: font })} style={{ fontFamily: `${font}, monospace` }} className={`rounded-xl border p-4 text-left text-xs ${settings.editorFont === font ? "border-cyan-300/30 bg-cyan-300/[0.06] text-cyan-100" : "border-white/8 bg-white/[0.02] text-slate-400"}`}><span className="block font-semibold">{font}</span><span className="mt-2 block text-[10px] opacity-60">int main() {`{ return 0; }`}</span></button>)}</div></>;
}

function ExecutionSettings({ settings, updateSettings, zh }: PreferenceProps) {
  return <><SettingHeader title={zh ? "執行設定" : "Run settings"} detail={zh ? "控制按下 Run 前後的行為。" : "Control what happens before and after pressing Run."} /><div className="mt-2"><SettingRow title={zh ? "Run 前儲存" : "Save before Run"} detail={zh ? "執行前先將目前檔案保存到 Supabase。" : "Save the current file to Supabase before running."}><Switch label="Save before Run" checked={settings.saveBeforeRun} onChange={(saveBeforeRun) => updateSettings({ saveBeforeRun })} /></SettingRow><SettingRow title={zh ? "自動編譯" : "Auto compile"} detail={zh ? "程式停止輸入後自動檢查；此功能尚未開放，避免浪費編譯額度。" : "Compile after typing stops. Not enabled yet to avoid wasting compiler quota."}><Switch label="Auto compile" checked={settings.autoCompile} disabled onChange={(autoCompile) => updateSettings({ autoCompile })} /></SettingRow><SettingRow title={zh ? "Run 時清除 Console" : "Clear console on Run"}><Switch label="Clear console on Run" checked={settings.clearConsoleOnRun} onChange={(clearConsoleOnRun) => updateSettings({ clearConsoleOnRun })} /></SettingRow></div></>;
}

function ShortcutSettings({ settings, updateSettings, zh }: PreferenceProps) {
  return <><SettingHeader title={zh ? "快捷鍵" : "Shortcuts"} detail={zh ? "開啟或關閉編輯器快捷鍵。" : "Enable or disable editor shortcuts."} /><div className="mt-2"><SettingRow title="Ctrl + Enter" detail={zh ? "編譯並執行目前 Project。" : "Build and run the current project."}><Switch label="Ctrl Enter" checked={settings.runShortcutEnabled} onChange={(runShortcutEnabled) => updateSettings({ runShortcutEnabled })} /></SettingRow><SettingRow title="Ctrl + S" detail={zh ? "儲存目前檔案。" : "Save the current file."}><Switch label="Ctrl S" checked={settings.saveShortcutEnabled} onChange={(saveShortcutEnabled) => updateSettings({ saveShortcutEnabled })} /></SettingRow></div></>;
}

function NotificationSettings({ settings, updateSettings, zh }: PreferenceProps) {
  return <><SettingHeader title={zh ? "通知" : "Notifications"} detail={zh ? "決定哪些狀態會在工作區顯示提示。" : "Choose which statuses show a workspace notification."} /><div className="mt-2"><SettingRow title={zh ? "成功編譯" : "Successful build"}><Switch label="Successful build notifications" checked={settings.notifySuccess} onChange={(notifySuccess) => updateSettings({ notifySuccess })} /></SettingRow><SettingRow title={zh ? "編譯或執行錯誤" : "Build or runtime errors"}><Switch label="Error notifications" checked={settings.notifyError} onChange={(notifyError) => updateSettings({ notifyError })} /></SettingRow><SettingRow title={zh ? "系統通知" : "System notifications"}><Switch label="System notifications" checked={settings.notifySystem} onChange={(notifySystem) => updateSettings({ notifySystem })} /></SettingRow></div></>;
}

function LanguageSettings({ language, setLanguage, zh }: { language: "zh-Hant" | "en"; setLanguage: (value: "zh-Hant" | "en") => void; zh: boolean }) {
  return <><SettingHeader title={zh ? "語言" : "Language"} detail={zh ? "設定 Code Tutor 的介面語言。" : "Choose the Code Tutor interface language."} /><div className="mt-6 space-y-3"><LanguageOption label="繁體中文" selected={language === "zh-Hant"} onClick={() => setLanguage("zh-Hant")} /><LanguageOption label="简体中文" selected={false} disabled badge={zh ? "翻譯準備中" : "Translation planned"} onClick={() => undefined} /><LanguageOption label="English" selected={language === "en"} onClick={() => setLanguage("en")} /></div></>;
}

function LanguageOption({ label, selected, disabled = false, badge, onClick }: { label: string; selected: boolean; disabled?: boolean; badge?: string; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-cyan-300/30 bg-cyan-300/[0.06] text-cyan-100" : "border-white/8 bg-white/[0.02] text-slate-400"}`}><span>{label}</span>{badge ? <span className="rounded-full border border-white/8 px-2 py-1 text-[9px] text-slate-600">{badge}</span> : selected ? <span className="text-cyan-300">✓</span> : null}</button>;
}

function GroqSettings({ user, busy, setBusy, setConfirmAction, showResult, setError, zh }: { user: AccountUser; busy: boolean; setBusy: (value: boolean) => void; setConfirmAction: (value: "remove-groq" | "signout-all" | null) => void; showResult: ResultFunction; setError: (value: string | null) => void; zh: boolean }) {
  const [connection, setConnection] = useState<AiConnectionStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (!user) return; let cancelled = false; const loadTimer = window.setTimeout(() => { setLoading(true); void getAiConnection().then((status) => { if (!cancelled) setConnection(status); }).catch((requestError: unknown) => { if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Could not load Groq."); }).finally(() => { if (!cancelled) setLoading(false); }); }, 0); return () => { cancelled = true; window.clearTimeout(loadTimer); }; }, [setError, user]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!apiKey.trim() || busy) return; setBusy(true); try { const status = await connectAi(apiKey.trim()); setConnection(status); setApiKey(""); showResult({ error: null }, zh ? "Groq 已安全連接。" : "Groq connected securely."); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not connect Groq."); } finally { setBusy(false); } };
  return <><SettingHeader title="AI / Groq" detail={zh ? "連接自己的 Groq API Key，供 AI Tutor 使用。完整 Key 只會送到後端驗證與加密。" : "Connect your own Groq API key for AI Tutor. The full key is only sent to the backend for validation and encryption."} />{!user ? <SignInNotice zh={zh} /> : <div className="mt-6"><div className={cardClass}><div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-white">Groq</p><p className="mt-1 text-[10px] text-slate-500">{loading ? (zh ? "正在檢查…" : "Checking…") : connection?.connected ? `${zh ? "已連接" : "Connected"} · •••• ${connection.key_last_four}` : (zh ? "尚未連接" : "Not connected")}</p></div><span className={`size-2 rounded-full ${connection?.connected ? "bg-emerald-400" : "bg-slate-700"}`} /></div></div><form onSubmit={(event) => void submit(event)} className="mt-5" autoComplete="off"><label className="text-[11px] text-slate-400">Groq API Key<input type="password" autoComplete="off" data-1p-ignore value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="gsk_••••••••" className={inputClass} /></label><div className="mt-5 flex justify-end gap-2">{connection?.connected ? <button type="button" onClick={() => setConfirmAction("remove-groq")} className="h-10 rounded-xl border border-rose-300/15 px-4 text-xs text-rose-300">{zh ? "移除" : "Remove"}</button> : null}<button disabled={busy || loading || !apiKey.trim()} className="h-10 rounded-xl bg-cyan-400 px-4 text-xs font-bold text-slate-950 disabled:opacity-50">{connection?.connected ? (zh ? "更換 Key" : "Replace key") : (zh ? "連接" : "Connect")}</button></div></form></div>}</>;
}

function SecuritySettings({ user, busy, setBusy, updateEmail, updatePassword, showResult, zh }: { user: AccountUser; busy: boolean; setBusy: (value: boolean) => void; updateEmail: ReturnType<typeof useAuth>["updateEmail"]; updatePassword: ReturnType<typeof useAuth>["updatePassword"]; showResult: ResultFunction; zh: boolean }) {
  const [email, setEmail] = useState(user?.email ?? ""); const [password, setPassword] = useState("");
  return <><SettingHeader title={zh ? "帳號安全" : "Account security"} detail={zh ? "修改 Email、密碼並查看目前登入裝置。" : "Update your email and password and review the current session."} />{!user ? <SignInNotice zh={zh} /> : <div className="mt-6 space-y-5"><form className={cardClass} onSubmit={async (event) => { event.preventDefault(); setBusy(true); showResult(await updateEmail(email.trim()), zh ? "驗證信已寄到新的 Email。" : "A confirmation message was sent to the new email."); setBusy(false); }}><label className="text-[11px] text-slate-400">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></label><div className="mt-4 flex justify-end"><button disabled={busy || email === user.email} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-slate-300 disabled:opacity-40">{zh ? "修改 Email" : "Update email"}</button></div></form><form className={cardClass} onSubmit={async (event) => { event.preventDefault(); if (password.length < 8) { showResult({ error: zh ? "密碼至少需要 8 個字元。" : "Password must contain at least 8 characters." }, ""); return; } setBusy(true); showResult(await updatePassword(password), zh ? "密碼已更新。" : "Password updated."); setPassword(""); setBusy(false); }}><label className="text-[11px] text-slate-400">{zh ? "新密碼" : "New password"}<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} /></label><div className="mt-4 flex justify-end"><button disabled={busy || password.length < 8} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-slate-300 disabled:opacity-40">{zh ? "修改密碼" : "Update password"}</button></div></form><div className={cardClass}><p className="text-xs font-semibold text-white">{zh ? "登入裝置" : "Signed-in devices"}</p><div className="mt-4 flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] p-3"><div><p className="text-xs text-slate-300">{zh ? "目前瀏覽器" : "Current browser"}</p><p className="mt-1 text-[10px] text-slate-600">{zh ? "這個工作階段目前有效" : "This session is currently active"}</p></div><span className="size-2 rounded-full bg-emerald-400" /></div><p className="mt-3 text-[10px] leading-5 text-slate-600">{zh ? "Supabase 用戶端不提供其他裝置的詳細清單；可以在危險區域一次撤銷所有工作階段。" : "The Supabase client does not expose a detailed device list. Revoke every session from Danger zone."}</p></div></div>}</>;
}

function DangerSettings({ user, setConfirmAction, zh }: { user: AccountUser; setConfirmAction: (value: "remove-groq" | "signout-all" | null) => void; zh: boolean }) {
  return <><SettingHeader title={zh ? "危險區域" : "Danger zone"} detail={zh ? "這些操作會影響帳號存取或永久資料。" : "These actions affect account access or permanent data."} />{!user ? <SignInNotice zh={zh} /> : <div className="mt-6 space-y-4"><div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.025] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-rose-200">{zh ? "登出所有裝置" : "Sign out every device"}</p><p className="mt-2 text-[11px] leading-5 text-slate-600">{zh ? "撤銷目前帳號的所有登入工作階段。" : "Revoke every active session for this account."}</p></div><button type="button" onClick={() => setConfirmAction("signout-all")} className="shrink-0 rounded-lg border border-rose-300/20 px-4 py-2 text-xs text-rose-300">{zh ? "全部登出" : "Sign out all"}</button></div></div><div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.025] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-rose-200">{zh ? "刪除帳號" : "Delete account"}</p><p className="mt-2 text-[11px] leading-5 text-slate-600">{zh ? "需要正式部署後端的管理權限與再次登入驗證，目前不提供不安全的前端刪除。" : "This requires a trusted deployed backend and recent authentication. Unsafe client-side deletion is not offered."}</p></div><button type="button" disabled className="shrink-0 rounded-lg border border-rose-300/10 px-4 py-2 text-xs text-rose-300/35">{zh ? "部署後開放" : "Available after deploy"}</button></div></div></div>}</>;
}

function SignInNotice({ zh }: { zh: boolean }) {
  return <div className="mt-6 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-xs leading-6 text-amber-100/75">{zh ? "請先登入 Code Tutor，才能修改這個帳號設定。" : "Sign in to Code Tutor to change this account setting."}</div>;
}
