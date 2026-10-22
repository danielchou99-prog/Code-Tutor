"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProblemAdminSettings } from "@/components/settings/problem-admin-settings";
import { connectAi, getAiConnection, type AiConnectionStatus, removeAiConnection } from "@/lib/ai-connection-api";
import { type AuthResult, useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { authErrorText } from "@/lib/supabase/auth-errors";
import { getProblemAdminStatus } from "@/lib/problem-admin-api";
import { loadPageState, pageStateKey, savePageState } from "@/lib/page-state";
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
  | "problem-admin"
  | "security"
  | "danger";

type ProblemAdminAccess = "checking" | "allowed" | "denied" | "error";

function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === "string" && sections.some((section) => section.id === value);
}

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
  { id: "problem-admin", icon: "◆", zh: "題目管理", en: "Problem Admin" },
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
  const [problemAdminAccess, setProblemAdminAccess] = useState<ProblemAdminAccess>("denied");
  const [problemAdminError, setProblemAdminError] = useState<string | null>(null);
  const [hydratedSectionStateKey, setHydratedSectionStateKey] = useState<string | null>(null);
  const sectionStateKey = pageStateKey("settings:section", user?.id);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = loadPageState(sectionStateKey, isSettingsSection);
      if (restored) setActiveSection(restored);
      setHydratedSectionStateKey(sectionStateKey);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sectionStateKey]);

  useEffect(() => {
    if (hydratedSectionStateKey === sectionStateKey) savePageState(sectionStateKey, activeSection);
  }, [activeSection, hydratedSectionStateKey, sectionStateKey]);

  const checkProblemAdminAccess = useCallback(async () => {
    if (!user) {
      setProblemAdminAccess("denied");
      setProblemAdminError(null);
      return;
    }
    setProblemAdminAccess("checking");
    setProblemAdminError(null);
    try {
      const isAdmin = await getProblemAdminStatus();
      setProblemAdminAccess(isAdmin ? "allowed" : "denied");
    } catch (requestError) {
      setProblemAdminAccess("error");
      setProblemAdminError(requestError instanceof Error ? requestError.message : "Unknown admin access error.");
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) void checkProblemAdminAccess();
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [checkProblemAdminAccess]);

  const clearFeedback = () => { setMessage(null); setError(null); };
  const showResult = (result: AuthResult, success: string) => {
    if (result.error) {
      setMessage(null);
      setError(authErrorText(result, t));
    } else {
      setError(null);
      setMessage(success);
    }
  };

  return (
    <section className="min-w-0 flex-1 px-4 py-8 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300">Dev Compass</p>
          <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">{t("settings")}</h1>
          <p className="mt-2 text-xs leading-6 text-slate-500">{t("manageYourProfileEditorRun")}</p>
        </div>

        <div className="mt-8 grid min-w-0 gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav aria-label={t("settingsCategories")} className="flex gap-2 overflow-x-auto pb-2 lg:block lg:overflow-visible lg:pb-0">
            {sections.map((section) => (
              <button key={section.id} type="button" onClick={() => { setActiveSection(section.id); savePageState(sectionStateKey, section.id); clearFeedback(); }} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition-colors lg:mb-1 lg:w-full ${activeSection === section.id ? "bg-cyan-300/8 text-cyan-200" : "text-slate-500 hover:bg-white/[0.025] hover:text-slate-300"}`}>
                <span className="grid w-5 place-items-center font-mono text-[11px] text-cyan-300/70" aria-hidden="true">{section.icon}</span>
                {zh ? section.zh : section.en}
                {section.id === "problem-admin" && problemAdminAccess === "checking" ? <span className="ml-auto text-[9px] text-slate-600">…</span> : null}
                {section.id === "problem-admin" && problemAdminAccess === "error" ? <span className="ml-auto text-[9px] text-amber-300">!</span> : null}
                {section.id === "problem-admin" && problemAdminAccess === "denied" ? <span className="ml-auto text-[9px] text-slate-600">{t("restricted")}</span> : null}
              </button>
            ))}
          </nav>

          <div className="min-w-0 rounded-2xl border border-white/8 bg-[#0b111a] p-5 sm:p-7">
            {activeSection === "profile" ? <ProfileSettings key={user?.id ?? "guest"} user={user} busy={busy} setBusy={setBusy} updateProfile={updateProfile} showResult={showResult} /> : null}
            {activeSection === "appearance" ? <AppearanceSettings settings={settings} updateSettings={updateSettings} /> : null}
            {activeSection === "editor" ? <EditorSettings settings={settings} updateSettings={updateSettings} /> : null}
            {activeSection === "layout" ? <LayoutSettings settings={settings} updateSettings={updateSettings} /> : null}
            {activeSection === "font" ? <FontSettings settings={settings} updateSettings={updateSettings} /> : null}
            {activeSection === "execution" ? <ExecutionSettings settings={settings} updateSettings={updateSettings} /> : null}
            {activeSection === "shortcuts" ? <ShortcutSettings settings={settings} updateSettings={updateSettings} /> : null}
            {activeSection === "notifications" ? <NotificationSettings settings={settings} updateSettings={updateSettings} /> : null}
            {activeSection === "language" ? <LanguageSettings language={language} setLanguage={setLanguage} /> : null}
            {activeSection === "ai" ? <GroqSettings key={`${user?.id ?? "guest"}-${groqRevision}`} user={user} busy={busy} setBusy={setBusy} setConfirmAction={setConfirmAction} showResult={showResult} setError={setError} /> : null}
            {activeSection === "problem-admin" && problemAdminAccess === "allowed" ? <ProblemAdminSettings zh={zh} /> : null}
            {activeSection === "problem-admin" && problemAdminAccess !== "allowed" ? (
              <section>
                <h2 className="text-lg font-semibold text-white">{t("problemAdminAccessCheck")}</h2>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  {problemAdminAccess === "checking"
                    ? (t("checkingYourAdministratorAccessWith"))
                    : problemAdminAccess === "denied"
                      ? (t("thisAccountCannotEditProblems"))
                      : (t("administratorStatusCouldNotBe"))}
                </p>
                {problemAdminError ? <p role="alert" className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-[11px] leading-5 text-amber-200">{problemAdminError}</p> : null}
              </section>
            ) : null}
            {activeSection === "security" ? <SecuritySettings key={user?.id ?? "guest"} user={user} busy={busy} setBusy={setBusy} updateEmail={updateEmail} updatePassword={updatePassword} showResult={showResult} /> : null}
            {activeSection === "danger" ? <DangerSettings user={user} setConfirmAction={setConfirmAction} /> : null}

            {error ? <p role="alert" className="mt-5 rounded-xl border border-rose-300/15 bg-rose-300/[0.04] p-3 text-[11px] leading-5 text-rose-300">{error}</p> : null}
            {message ? <p role="status" className="mt-5 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.04] p-3 text-[11px] leading-5 text-emerald-300">{message}</p> : null}

            {!(["profile", "ai", "problem-admin", "security", "danger"] as SettingsSection[]).includes(activeSection) ? (
              <div className="mt-7 flex justify-end">
                <button type="button" onClick={resetSettings} className="rounded-lg border border-white/8 px-4 py-2 text-[10px] text-slate-500 hover:text-slate-300">{t("restoreDefaults")}</button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === "remove-groq" ? (t("removeGroqConnection")) : (t("signOutEveryDevice"))}
        description={confirmAction === "remove-groq" ? (t("theEncryptedApiKeyWill")) : (t("thisBrowserAndEveryOther"))}
        confirmLabel={confirmAction === "remove-groq" ? (t("remove")) : (t("signOutAll"))}
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
              setMessage(t("groqConnectionRemoved"));
              setGroqRevision((current) => current + 1);
            } catch (requestError) {
              setError(requestError instanceof Error ? requestError.message : (t("couldNotRemoveGroq")));
            }
          } else {
            showResult(await signOutAll(), t("everyDeviceHasBeenSigned"));
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

function ProfileSettings({ user, busy, setBusy, updateProfile, showResult }: { user: AccountUser; busy: boolean; setBusy: (value: boolean) => void; updateProfile: ReturnType<typeof useAuth>["updateProfile"]; showResult: ResultFunction }) {
  const { t } = useLanguage();
  const [displayName, setDisplayName] = useState(user?.user_metadata.display_name ?? "");
  const [username, setUsername] = useState(user?.user_metadata.username ?? "");
  const [bio, setBio] = useState(user?.user_metadata.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata.avatar_url ?? "");
  const [hydratedDraftStateKey, setHydratedDraftStateKey] = useState<string | null>(null);
  const draftStateKey = pageStateKey("settings:profile-draft", user?.id);
  const initial = (displayName || username || user?.email || "?").trim().charAt(0).toUpperCase();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = loadPageState(draftStateKey, (value): value is { avatarUrl: string; bio: string; displayName: string; username: string } => {
        if (!value || typeof value !== "object") return false;
        const draft = value as Record<string, unknown>;
        return [draft.avatarUrl, draft.bio, draft.displayName, draft.username].every((item) => typeof item === "string");
      });
      if (restored) {
        setDisplayName(restored.displayName);
        setUsername(restored.username);
        setBio(restored.bio);
        setAvatarUrl(restored.avatarUrl);
      }
      setHydratedDraftStateKey(draftStateKey);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftStateKey]);

  useEffect(() => {
    if (hydratedDraftStateKey === draftStateKey) savePageState(draftStateKey, { avatarUrl, bio, displayName, username });
  }, [avatarUrl, bio, displayName, draftStateKey, hydratedDraftStateKey, username]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || busy) return;
    if (username && !/^[a-zA-Z0-9_]{3,24}$/u.test(username)) {
      showResult({ error: t("usernameMustContain324") }, "");
      return;
    }
    setBusy(true);
    showResult(await updateProfile({ display_name: displayName.trim(), username: username.trim(), bio: bio.trim(), avatar_url: avatarUrl.trim() }), t("profileUpdated"));
    setBusy(false);
  };

  return (
    <>
      <SettingHeader title={t("profile")} detail={t("setTheBasicInformationShown")} />
      {!user ? <SignInNotice /> : (
        <form onSubmit={(event) => void submit(event)} className="mt-6">
          <div className="flex items-center gap-4">
            <div className="grid size-14 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] text-lg font-semibold text-cyan-200">{initial}</div>
            <div><p className="text-xs font-semibold text-white">{displayName || user.email}</p><p className="mt-1 text-[10px] text-slate-600">{user.email}</p></div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-[11px] text-slate-400">{t("displayName2")}<input className={inputClass} value={displayName} maxLength={50} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <label className="text-[11px] text-slate-400">Username<input className={inputClass} value={username} maxLength={24} onChange={(event) => setUsername(event.target.value)} /></label>
          </div>
          <label className="mt-4 block text-[11px] text-slate-400">{t("avatarUrl")}<input className={inputClass} type="url" value={avatarUrl} placeholder="https://…" onChange={(event) => setAvatarUrl(event.target.value)} /></label>
          <label className="mt-4 block text-[11px] text-slate-400">{t("bio")}<textarea className="mt-2 min-h-24 w-full resize-y rounded-xl border border-white/8 bg-[#090f18] p-3 text-xs leading-6 text-slate-200 outline-none focus:border-cyan-300/30" value={bio} maxLength={240} onChange={(event) => setBio(event.target.value)} /></label>
          <div className="mt-5 flex justify-end"><button disabled={busy} className="h-10 rounded-xl bg-cyan-400 px-5 text-xs font-bold text-slate-950 disabled:opacity-50">{busy ? (t("saving")) : (t("saveProfile"))}</button></div>
        </form>
      )}
    </>
  );
}

function AppearanceSettings({ settings, updateSettings }: PreferenceProps) {
  const { t } = useLanguage();
  return <><SettingHeader title={t("appearance")} detail={t("adjustTheSiteColorsAnd")} /><div className="mt-2"><SettingRow title={t("colorMode")} detail={t("changesApplyImmediatelyAndAre")}><Segmented value={settings.theme} options={[{ value: "dark", label: t("dark") }, { value: "light", label: t("light") }]} onChange={(theme) => updateSettings({ theme })} /></SettingRow><SettingRow title={t("accentColor")}><Segmented value={settings.accent} options={[{ value: "cyan", label: t("cyan") }, { value: "violet", label: t("violet") }, { value: "emerald", label: t("emerald") }]} onChange={(accent) => updateSettings({ accent })} /></SettingRow><SettingRow title={t("background")}><Segmented value={settings.background} options={[{ value: "plain", label: t("plain") }, { value: "grid", label: t("grid") }, { value: "soft", label: t("softGlow") }]} onChange={(background) => updateSettings({ background })} /></SettingRow></div></>;
}

type PreferenceProps = { settings: AppSettings; updateSettings: (value: Partial<AppSettings>) => void };

function EditorSettings({ settings, updateSettings }: PreferenceProps) {
  const { t } = useLanguage();
  return <><SettingHeader title="Compiler / Editor" detail={t("configureTheDefaultLanguageAnd")} /><div className="mt-2"><SettingRow title={t("defaultLanguage")} detail={t("preselectThisLanguageWhenCreating")}><Segmented value={settings.defaultProgrammingLanguage} options={[{ value: "cpp" as const, label: "C++20" }, { value: "python" as const, label: "Python 3" }]} onChange={(defaultProgrammingLanguage) => updateSettings({ defaultProgrammingLanguage })} /></SettingRow><SettingRow title={t("fontSize")} detail={`${settings.editorFontSize}px`}><input aria-label={t("editorFontSize")} type="range" min="12" max="20" value={settings.editorFontSize} onChange={(event) => updateSettings({ editorFontSize: Number(event.target.value) })} className="w-44 accent-cyan-300" /></SettingRow><SettingRow title="Tab width"><Segmented value={settings.tabSize} options={[2, 4, 8].map((value) => ({ value: value as 2 | 4 | 8, label: String(value) }))} onChange={(tabSize) => updateSettings({ tabSize })} /></SettingRow><SettingRow title="Word Wrap" detail={t("wrapLongCodeInsideThe")}><Switch label="Word Wrap" checked={settings.wordWrap} onChange={(wordWrap) => updateSettings({ wordWrap })} /></SettingRow></div></>;
}

function LayoutSettings({ settings, updateSettings }: PreferenceProps) {
  const { t } = useLanguage();
  return <><SettingHeader title={t("layout")} detail={t("adjustTheSizeAndPlacement")} /><div className="mt-2"><SettingRow title={t("fileSidebarWidth")} detail={`${settings.sidebarWidth}px`}><input type="range" min="180" max="280" step="10" value={settings.sidebarWidth} onChange={(event) => updateSettings({ sidebarWidth: Number(event.target.value) })} className="w-44 accent-cyan-300" /></SettingRow><SettingRow title={t("aiPanelWidth")} detail={`${settings.aiPanelWidth}px`}><input type="range" min="280" max="420" step="10" value={settings.aiPanelWidth} onChange={(event) => updateSettings({ aiPanelWidth: Number(event.target.value) })} className="w-44 accent-cyan-300" /></SettingRow><SettingRow title={t("consoleHeight")} detail={`${settings.consoleHeight}px`}><input type="range" min="160" max="360" step="16" value={settings.consoleHeight} onChange={(event) => updateSettings({ consoleHeight: Number(event.target.value) })} className="w-44 accent-cyan-300" /></SettingRow><SettingRow title={t("aiPlacement")}><Segmented value={settings.panelPlacement} options={[{ value: "right", label: t("right") }, { value: "bottom", label: t("bottom") }]} onChange={(panelPlacement) => updateSettings({ panelPlacement })} /></SettingRow></div></>;
}

function FontSettings({ settings, updateSettings }: PreferenceProps) {
  const { t } = useLanguage();
  const fonts = ["JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas"] as const;
  return <><SettingHeader title={t("font")} detail={t("chooseAMonospaceFontFor")} /><div className="mt-6 grid gap-3 sm:grid-cols-2">{fonts.map((font) => <button key={font} type="button" onClick={() => updateSettings({ editorFont: font })} style={{ fontFamily: `${font}, monospace` }} className={`rounded-xl border p-4 text-left text-xs ${settings.editorFont === font ? "border-cyan-300/30 bg-cyan-300/[0.06] text-cyan-100" : "border-white/8 bg-white/[0.02] text-slate-400"}`}><span className="block font-semibold">{font}</span><span className="mt-2 block text-[10px] opacity-60">int main() {`{ return 0; }`}</span></button>)}</div></>;
}

function ExecutionSettings({ settings, updateSettings }: PreferenceProps) {
  const { t } = useLanguage();
  return <><SettingHeader title={t("runSettings")} detail={t("controlWhatHappensBeforeAnd")} /><div className="mt-2"><SettingRow title={t("saveBeforeRun")} detail={t("saveTheCurrentFileTo")}><Switch label="Save before Run" checked={settings.saveBeforeRun} onChange={(saveBeforeRun) => updateSettings({ saveBeforeRun })} /></SettingRow><SettingRow title={t("autoCompile")} detail={t("compileAfterTypingStopsNot")}><Switch label="Auto compile" checked={settings.autoCompile} disabled onChange={(autoCompile) => updateSettings({ autoCompile })} /></SettingRow><SettingRow title={t("clearConsoleOnRun")}><Switch label="Clear console on Run" checked={settings.clearConsoleOnRun} onChange={(clearConsoleOnRun) => updateSettings({ clearConsoleOnRun })} /></SettingRow></div></>;
}

function ShortcutSettings({ settings, updateSettings }: PreferenceProps) {
  const { t } = useLanguage();
  return <><SettingHeader title={t("shortcuts")} detail={t("enableOrDisableEditorShortcuts")} /><div className="mt-2"><SettingRow title="Ctrl + Enter" detail={t("buildAndRunTheCurrent")}><Switch label="Ctrl Enter" checked={settings.runShortcutEnabled} onChange={(runShortcutEnabled) => updateSettings({ runShortcutEnabled })} /></SettingRow><SettingRow title="Ctrl + S" detail={t("saveTheCurrentFile")}><Switch label="Ctrl S" checked={settings.saveShortcutEnabled} onChange={(saveShortcutEnabled) => updateSettings({ saveShortcutEnabled })} /></SettingRow></div></>;
}

function NotificationSettings({ settings, updateSettings }: PreferenceProps) {
  const { t } = useLanguage();
  return <><SettingHeader title={t("notifications")} detail={t("chooseWhichStatusesShowA")} /><div className="mt-2"><SettingRow title={t("successfulBuild")}><Switch label="Successful build notifications" checked={settings.notifySuccess} onChange={(notifySuccess) => updateSettings({ notifySuccess })} /></SettingRow><SettingRow title={t("buildOrRuntimeErrors")}><Switch label="Error notifications" checked={settings.notifyError} onChange={(notifyError) => updateSettings({ notifyError })} /></SettingRow><SettingRow title={t("systemNotifications")}><Switch label="System notifications" checked={settings.notifySystem} onChange={(notifySystem) => updateSettings({ notifySystem })} /></SettingRow></div></>;
}

function LanguageSettings({ language, setLanguage }: { language: "zh-Hant" | "en"; setLanguage: (value: "zh-Hant" | "en") => void; }) {
  const { t } = useLanguage();
  return <><SettingHeader title={t("languageLabel")} detail={t("chooseTheDevCompassInterface")} /><div className="mt-6 space-y-3"><LanguageOption label="繁體中文" selected={language === "zh-Hant"} onClick={() => setLanguage("zh-Hant")} /><LanguageOption label="简体中文" selected={false} disabled badge={t("translationPlanned")} onClick={() => undefined} /><LanguageOption label="English" selected={language === "en"} onClick={() => setLanguage("en")} /></div></>;
}

function LanguageOption({ label, selected, disabled = false, badge, onClick }: { label: string; selected: boolean; disabled?: boolean; badge?: string; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-cyan-300/30 bg-cyan-300/[0.06] text-cyan-100" : "border-white/8 bg-white/[0.02] text-slate-400"}`}><span>{label}</span>{badge ? <span className="rounded-full border border-white/8 px-2 py-1 text-[9px] text-slate-600">{badge}</span> : selected ? <span className="text-cyan-300">✓</span> : null}</button>;
}

function GroqSettings({ user, busy, setBusy, setConfirmAction, showResult, setError }: { user: AccountUser; busy: boolean; setBusy: (value: boolean) => void; setConfirmAction: (value: "remove-groq" | "signout-all" | null) => void; showResult: ResultFunction; setError: (value: string | null) => void }) {
  const { t } = useLanguage();
  const [connection, setConnection] = useState<AiConnectionStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (!user) return; let cancelled = false; const loadTimer = window.setTimeout(() => { setLoading(true); void getAiConnection().then((status) => { if (!cancelled) setConnection(status); }).catch((requestError: unknown) => { if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Could not load Groq."); }).finally(() => { if (!cancelled) setLoading(false); }); }, 0); return () => { cancelled = true; window.clearTimeout(loadTimer); }; }, [setError, user]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!apiKey.trim() || busy) return; setBusy(true); try { const status = await connectAi(apiKey.trim()); setConnection(status); setApiKey(""); showResult({ error: null }, t("groqConnectedSecurely")); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not connect Groq."); } finally { setBusy(false); } };
  return <><SettingHeader title="AI / Groq" detail={t("connectYourOwnGroqApi")} />{!user ? <SignInNotice /> : <div className="mt-6"><div className={cardClass}><div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-white">Groq</p><p className="mt-1 text-[10px] text-slate-500">{loading ? (t("checking")) : connection?.connected ? `${t("connected")} · •••• ${connection.key_last_four}` : (t("notConnected"))}</p></div><span className={`size-2 rounded-full ${connection?.connected ? "bg-emerald-400" : "bg-slate-700"}`} /></div></div><form onSubmit={(event) => void submit(event)} className="mt-5" autoComplete="off"><label className="text-[11px] text-slate-400">Groq API Key<input type="password" autoComplete="off" data-1p-ignore value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="gsk_••••••••" className={inputClass} /></label><div className="mt-5 flex justify-end gap-2">{connection?.connected ? <button type="button" onClick={() => setConfirmAction("remove-groq")} className="h-10 rounded-xl border border-rose-300/15 px-4 text-xs text-rose-300">{t("remove")}</button> : null}<button disabled={busy || loading || !apiKey.trim()} className="h-10 rounded-xl bg-cyan-400 px-4 text-xs font-bold text-slate-950 disabled:opacity-50">{connection?.connected ? (t("replaceKey")) : (t("connect"))}</button></div></form></div>}</>;
}

function SecuritySettings({ user, busy, setBusy, updateEmail, updatePassword, showResult }: { user: AccountUser; busy: boolean; setBusy: (value: boolean) => void; updateEmail: ReturnType<typeof useAuth>["updateEmail"]; updatePassword: ReturnType<typeof useAuth>["updatePassword"]; showResult: ResultFunction }) {
  const { t } = useLanguage();
  const [email, setEmail] = useState(user?.email ?? ""); const [password, setPassword] = useState("");
  return <><SettingHeader title={t("accountSecurity")} detail={t("updateYourEmailAndPassword")} />{!user ? <SignInNotice /> : <div className="mt-6 space-y-5"><form className={cardClass} onSubmit={async (event) => { event.preventDefault(); setBusy(true); showResult(await updateEmail(email.trim()), t("aConfirmationMessageWasSent")); setBusy(false); }}><label className="text-[11px] text-slate-400">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></label><div className="mt-4 flex justify-end"><button disabled={busy || email === user.email} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-slate-300 disabled:opacity-40">{t("updateEmail")}</button></div></form><form className={cardClass} onSubmit={async (event) => { event.preventDefault(); if (password.length < 8) { showResult({ error: t("passwordTooShort") }, ""); return; } setBusy(true); showResult(await updatePassword(password), t("passwordUpdated2")); setPassword(""); setBusy(false); }}><label className="text-[11px] text-slate-400">{t("newPassword")}<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} /></label><div className="mt-4 flex justify-end"><button disabled={busy || password.length < 8} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-slate-300 disabled:opacity-40">{t("updatePassword")}</button></div></form><div className={cardClass}><p className="text-xs font-semibold text-white">{t("signedInDevices")}</p><div className="mt-4 flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] p-3"><div><p className="text-xs text-slate-300">{t("currentBrowser")}</p><p className="mt-1 text-[10px] text-slate-600">{t("thisSessionIsCurrentlyActive")}</p></div><span className="size-2 rounded-full bg-emerald-400" /></div><p className="mt-3 text-[10px] leading-5 text-slate-600">{t("theSupabaseClientDoesNot")}</p></div></div>}</>;
}

function DangerSettings({ user, setConfirmAction }: { user: AccountUser; setConfirmAction: (value: "remove-groq" | "signout-all" | null) => void }) {
  const { t } = useLanguage();
  return <><SettingHeader title={t("dangerZone")} detail={t("theseActionsAffectAccountAccess")} />{!user ? <SignInNotice /> : <div className="mt-6 space-y-4"><div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.025] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-rose-200">{t("signOutEveryDevice2")}</p><p className="mt-2 text-[11px] leading-5 text-slate-600">{t("revokeEveryActiveSessionFor")}</p></div><button type="button" onClick={() => setConfirmAction("signout-all")} className="shrink-0 rounded-lg border border-rose-300/20 px-4 py-2 text-xs text-rose-300">{t("signOutAll")}</button></div></div><div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.025] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-rose-200">{t("deleteAccount")}</p><p className="mt-2 text-[11px] leading-5 text-slate-600">{t("thisRequiresATrustedDeployed")}</p></div><button type="button" disabled className="shrink-0 rounded-lg border border-rose-300/10 px-4 py-2 text-xs text-rose-300/35">{t("availableAfterDeploy")}</button></div></div></div>}</>;
}

function SignInNotice() {
  const { t } = useLanguage();
  return <div className="mt-6 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-xs leading-6 text-amber-100/75">{t("signInToDevCompass2")}</div>;
}
