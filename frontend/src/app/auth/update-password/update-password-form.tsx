"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";

export function UpdatePasswordForm() {
  const { loading, user, updatePassword } = useAuth();
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }
    if (password !== confirmation) {
      setError(t("passwordMismatch"));
      return;
    }

    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (result.error) setError(result.error);
    else setComplete(true);
  };

  if (loading) {
    return <p className="animate-pulse text-sm text-slate-500">{t("loadingAccount")}</p>;
  }

  if (!user) {
    return (
      <div>
        <p className="text-sm leading-6 text-rose-300">{t("invalidRecovery")}</p>
        <Link href="/" className="mt-5 inline-block text-xs text-cyan-300">{t("backHome")}</Link>
      </div>
    );
  }

  if (complete) {
    return (
      <div>
        <p role="status" className="text-sm leading-6 text-emerald-300">{t("passwordUpdated")}</p>
        <Link href="/" className="mt-5 inline-block text-xs text-cyan-300">{t("backHome")}</Link>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-xs text-slate-400">
        {t("newPassword")}
        <input
          required
          minLength={8}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#090e16] px-3 text-sm text-slate-200 outline-none focus:border-cyan-300/30"
        />
      </label>
      <label className="block text-xs text-slate-400">
        {t("confirmPassword")}
        <input
          required
          minLength={8}
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#090e16] px-3 text-sm text-slate-200 outline-none focus:border-cyan-300/30"
        />
      </label>
      {error && <p role="alert" className="text-xs leading-5 text-rose-300">{error}</p>}
      <button
        disabled={submitting}
        className="h-11 w-full rounded-lg bg-cyan-400 text-xs font-semibold text-slate-950 disabled:cursor-wait disabled:opacity-60"
        type="submit"
      >
        {submitting ? t("savingPassword") : t("savePassword")}
      </button>
    </form>
  );
}
