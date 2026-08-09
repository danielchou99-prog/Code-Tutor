"use client";

import { useEffect, useRef } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  busy?: boolean;
  tone?: "default" | "danger";
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  busy = false,
  tone = "default",
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label={closeLabel}
        className="fixed inset-0 z-[80] cursor-default bg-black/65"
        disabled={busy}
        onClick={onClose}
      />
      <div className="pointer-events-none fixed inset-0 z-[81] grid place-items-center px-4">
        <section
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-description"
          className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#111824] p-5 shadow-2xl shadow-black/60"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="confirm-dialog-title" className="text-sm font-semibold text-white">{title}</h2>
              <p id="confirm-dialog-description" className="mt-3 text-xs leading-5 text-slate-400">{description}</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="shrink-0 text-sm text-slate-600 hover:text-slate-300 disabled:cursor-wait"
              aria-label={closeLabel}
            >
              ×
            </button>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="h-9 rounded-lg border border-white/8 px-4 text-xs text-slate-400 transition-colors hover:border-white/15 hover:text-slate-200 disabled:cursor-wait disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              disabled={busy}
              onClick={() => void onConfirm()}
              className={tone === "danger"
                ? "h-9 rounded-lg bg-rose-400 px-4 text-xs font-bold text-slate-950 transition-colors hover:bg-rose-300 disabled:cursor-wait disabled:opacity-50"
                : "h-9 rounded-lg bg-cyan-400 px-4 text-xs font-bold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-50"}
            >
              {confirmLabel}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
