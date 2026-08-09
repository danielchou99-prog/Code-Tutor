"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";

type AuthMode = "signin" | "signup" | "forgot";

export function AccountControl({
  onBeforeSignOut,
}: {
  onBeforeSignOut?: (signOut: () => Promise<void>) => void;
}) {
  const { configured, loading, user, signIn, signOut, signUp, sendPasswordReset } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const resetForm = useCallback(() => {
    setMode("signin");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setDisplayName("");
    setMessage(null);
    setError(null);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    resetForm();
  }, [resetForm]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [closePanel, open]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setMessage(null);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (mode !== "forgot" && password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setSubmitting(true);
    const result =
      mode === "signin"
        ? await signIn(email, password)
        : mode === "signup"
          ? await signUp(displayName, email, password)
          : await sendPasswordReset(email);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (mode === "signin") {
      closePanel();
    } else {
      setPassword("");
      setConfirmPassword("");
      setMessage(mode === "signup" ? t("confirmationEmailSent") : t("resetEmailSent"));
    }
  };

  const handleSignOut = async () => {
    const result = await signOut();
    resetForm();
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
  };

  const label = user?.user_metadata.display_name || user?.email || t("guest");
  const initial = label.trim().charAt(0).toUpperCase();

  return (
    <div className="relative" ref={panelRef}>
      <button
        className={
          user
            ? "grid size-9 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:border-cyan-300/30 hover:text-cyan-200"
            : "flex h-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.025] px-3 text-[11px] font-medium text-slate-300 transition-colors hover:border-cyan-300/30 hover:text-cyan-200"
        }
        type="button"
        aria-label={t("accountMenu")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (open) closePanel();
          else setOpen(true);
        }}
      >
        {loading ? (
          <span className="h-2.5 w-10 animate-pulse rounded bg-slate-600" />
        ) : user ? (
          <span className="text-xs font-semibold text-cyan-200">{initial}</span>
        ) : (
          <span>Sign in</span>
        )}
      </button>

      {open && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default bg-black/35"
            type="button"
            aria-label={t("closeDialog")}
            onClick={closePanel}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("account")}
            className="fixed inset-x-4 top-20 z-50 mx-auto max-w-sm rounded-2xl border border-white/10 bg-[#111824] p-5 shadow-2xl shadow-black/50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.75rem)] sm:w-80"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white">{t("account")}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {user ? t("signedInAs") : t("guest")}
                </p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="text-sm text-slate-600 hover:text-slate-300"
                aria-label={t("closeDialog")}
              >
                ×
              </button>
            </div>

            {!configured ? (
              <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3">
                <p className="text-xs text-amber-200">{t("accountConfiguredMissing")}</p>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">{t("accountConfiguredHint")}</p>
              </div>
            ) : user ? (
              <div>
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <p className="truncate text-xs font-medium text-slate-200">{label}</p>
                  {user.email && label !== user.email && (
                    <p className="mt-1 truncate text-[10px] text-slate-500">{user.email}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (onBeforeSignOut) onBeforeSignOut(handleSignOut);
                    else void handleSignOut();
                  }}
                  className="mt-3 w-full rounded-lg border border-white/8 px-3 py-2 text-xs text-slate-400 transition-colors hover:border-rose-300/20 hover:text-rose-300"
                >
                  {t("signOut")}
                </button>
                {error && <p role="alert" className="mt-3 text-[11px] leading-5 text-rose-300">{error}</p>}
              </div>
            ) : (
              <form className="space-y-3" autoComplete="off" onSubmit={submit}>
                {mode === "signup" && (
                  <label className="block text-[11px] text-slate-400">
                    {t("displayName")}
                    <input
                      required
                      minLength={2}
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-white/8 bg-[#0b111a] px-3 text-xs text-slate-200 outline-none focus:border-cyan-300/30"
                    />
                  </label>
                )}
                <label className="block text-[11px] text-slate-400">
                  {t("email")}
                  <input
                    required
                    type="email"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/8 bg-[#0b111a] px-3 text-xs text-slate-200 outline-none focus:border-cyan-300/30"
                  />
                </label>
                {mode !== "forgot" && (
                  <label className="block text-[11px] text-slate-400">
                    {t("password")}
                    <input
                      required
                      minLength={8}
                      type="password"
                      autoComplete={mode === "signin" ? "off" : "new-password"}
                      data-1p-ignore
                      data-lpignore="true"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-white/8 bg-[#0b111a] px-3 text-xs text-slate-200 outline-none focus:border-cyan-300/30"
                    />
                  </label>
                )}
                {mode === "signup" && (
                  <label className="block text-[11px] text-slate-400">
                    {t("confirmPassword")}
                    <input
                      required
                      minLength={8}
                      type="password"
                      autoComplete="new-password"
                      data-1p-ignore
                      data-lpignore="true"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-white/8 bg-[#0b111a] px-3 text-xs text-slate-200 outline-none focus:border-cyan-300/30"
                    />
                  </label>
                )}

                {error && <p role="alert" className="text-[11px] leading-5 text-rose-300">{error}</p>}
                {message && <p role="status" className="text-[11px] leading-5 text-emerald-300">{message}</p>}

                <button
                  disabled={submitting}
                  type="submit"
                  className="h-10 w-full rounded-lg bg-cyan-400 text-xs font-semibold text-slate-950 transition-opacity disabled:cursor-wait disabled:opacity-60"
                >
                  {submitting
                    ? t(mode === "signin" ? "signingIn" : mode === "signup" ? "creatingAccount" : "sendingReset")
                    : t(mode === "signin" ? "signIn" : mode === "signup" ? "signUp" : "resetPasswordAction")}
                </button>

                <div className="flex items-center justify-between text-[10px]">
                  {mode === "signin" ? (
                    <>
                      <button type="button" onClick={() => switchMode("signup")} className="text-cyan-300/80 hover:text-cyan-200">
                        {t("signUp")}
                      </button>
                      <button type="button" onClick={() => switchMode("forgot")} className="text-slate-500 hover:text-slate-300">
                        {t("forgotPassword")}
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => switchMode("signin")} className="text-cyan-300/80 hover:text-cyan-200">
                      {t("backToSignIn")}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
