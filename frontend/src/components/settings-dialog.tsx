"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth-context";
import {
  connectAi,
  getAiConnection,
  type AiConnectionStatus,
  removeAiConnection,
} from "@/lib/ai-connection-api";
import { useLanguage } from "@/lib/language-context";

type SettingsDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const zh = language === "zh-Hant";
  const [connection, setConnection] = useState<AiConnectionStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setApiKey("");
    setError(null);
    setMessage(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadTimer = window.setTimeout(() => {
      setApiKey("");
      setError(null);
      setMessage(null);
      if (!user) {
        setConnection(null);
        return;
      }

      setLoading(true);
      void getAiConnection()
        .then((status) => {
          if (!cancelled) setConnection(status);
        })
        .catch((requestError: unknown) => {
          if (!cancelled) setError(requestError instanceof Error ? requestError.message : (zh ? "無法取得 AI 連線狀態。" : "Could not load the AI connection status."));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(loadTimer);
    };
  }, [open, user, zh]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy && !removeConfirmOpen) handleClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, handleClose, open, removeConfirmOpen]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedKey = apiKey.trim();
    if (!normalizedKey || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const status = await connectAi(normalizedKey);
      setConnection(status);
      setMessage(zh ? "Groq 已安全連接。" : "Groq is securely connected.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (zh ? "Groq 連接失敗。" : "Could not connect Groq."));
    } finally {
      setApiKey("");
      setBusy(false);
    }
  };

  const removeConnection = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const status = await removeAiConnection();
      setConnection(status);
      setMessage(zh ? "Groq 連線已移除。" : "Groq connection removed.");
      setRemoveConfirmOpen(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (zh ? "無法移除 Groq 連線。" : "Could not remove the Groq connection."));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <button type="button" aria-label={t("closeDialog")} onClick={handleClose} className="fixed inset-0 z-[60] cursor-default bg-black/60" />
      <div className="pointer-events-none fixed inset-0 z-[61] grid place-items-center px-4">
        <section role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" className="pointer-events-auto w-full max-w-lg rounded-2xl border border-white/10 bg-[#111824] p-5 shadow-2xl shadow-black/60">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="settings-dialog-title" className="text-sm font-semibold text-white">{zh ? "設定" : "Settings"}</h2>
              <p className="mt-1 text-[11px] text-slate-500">{zh ? "管理帳號的 AI 連線" : "Manage AI connections for your account"}</p>
            </div>
            <button type="button" onClick={handleClose} disabled={busy} aria-label={t("closeDialog")} className="text-sm text-slate-600 hover:text-slate-300 disabled:cursor-wait">×</button>
          </div>

          {!user ? (
            <div className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-xs leading-5 text-amber-100/80">
              {zh ? "請先登入 Code Tutor，再連接自己的 Groq API Key。" : "Sign in to Code Tutor before connecting your Groq API key."}
            </div>
          ) : (
            <div className="mt-5">
              <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-200">Groq</p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {loading
                        ? (zh ? "正在檢查連線…" : "Checking connection…")
                        : connection?.connected
                          ? `${zh ? "已連接" : "Connected"} · •••• ${connection.key_last_four ?? "----"}`
                          : (zh ? "尚未連接" : "Not connected")}
                    </p>
                  </div>
                  <span className={`size-2 rounded-full ${connection?.connected ? "bg-emerald-400" : "bg-slate-700"}`} aria-hidden="true" />
                </div>
              </div>

              <form className="mt-5" onSubmit={(event) => void submit(event)} autoComplete="off">
                <label className="block text-[11px] text-slate-400">
                  Groq API Key
                  <input
                    required
                    minLength={8}
                    maxLength={256}
                    type="password"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="gsk_••••••••••••"
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/8 bg-[#0b111a] px-3 font-mono text-xs text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-300/30"
                  />
                </label>
                <p className="mt-2 text-[10px] leading-4 text-slate-600">
                  {zh ? "完整 Key 只會送到後端驗證與加密，之後不會再次顯示。" : "The full key is sent only to the backend for validation and encryption, and is never shown again."}
                </p>

                {error && <p role="alert" className="mt-3 text-[11px] leading-5 text-rose-300">{error}</p>}
                {message && <p role="status" className="mt-3 text-[11px] leading-5 text-emerald-300">{message}</p>}

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  {connection?.connected && (
                    <button type="button" disabled={busy} onClick={() => setRemoveConfirmOpen(true)} className="h-9 rounded-lg border border-rose-300/15 px-4 text-xs text-rose-300 transition-colors hover:border-rose-300/30 disabled:cursor-wait disabled:opacity-50">
                      {zh ? "移除" : "Remove"}
                    </button>
                  )}
                  <button type="submit" disabled={busy || loading || !apiKey.trim()} className="h-9 rounded-lg bg-cyan-400 px-4 text-xs font-bold text-slate-950 disabled:cursor-wait disabled:opacity-50">
                    {busy ? (zh ? "處理中…" : "Working…") : connection?.connected ? (zh ? "更換 Key" : "Replace key") : (zh ? "連接" : "Connect")}
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={removeConfirmOpen}
        title={zh ? "移除 Groq 連線？" : "Remove Groq connection?"}
        description={zh ? "加密保存的 API Key 將從 Code Tutor 刪除。" : "The encrypted API key will be deleted from Code Tutor."}
        confirmLabel={zh ? "移除" : "Remove"}
        cancelLabel={t("cancel")}
        closeLabel={t("closeDialog")}
        busy={busy}
        tone="danger"
        onClose={() => setRemoveConfirmOpen(false)}
        onConfirm={removeConnection}
      />
    </>
  );
}
