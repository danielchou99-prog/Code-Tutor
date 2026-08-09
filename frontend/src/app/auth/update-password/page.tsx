"use client";

import { UpdatePasswordForm } from "@/app/auth/update-password/update-password-form";
import { AuthProvider } from "@/lib/auth-context";
import { LanguageProvider, useLanguage } from "@/lib/language-context";

function UpdatePasswordContent() {
  const { t } = useLanguage();
  return (
    <main className="grid min-h-screen place-items-center bg-[#090d14] px-5 text-slate-200">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111824] p-6 shadow-2xl shadow-black/40">
        <span className="block size-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.65)]" />
        <h1 className="mt-5 text-xl font-semibold text-white">{t("updatePasswordTitle")}</h1>
        <p className="mb-6 mt-2 text-xs leading-5 text-slate-500">{t("updatePasswordDetail")}</p>
        <UpdatePasswordForm />
      </section>
    </main>
  );
}

export default function UpdatePasswordPage() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <UpdatePasswordContent />
      </AuthProvider>
    </LanguageProvider>
  );
}
