"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { SiteHeader } from "@/components/site-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { clearUserPageStates, loadPageState, pageStateKey, savePageState } from "@/lib/page-state";
import { sectionFromPathname, sectionPaths } from "@/lib/routes";
import { useSettings } from "@/lib/settings-context";
import type { PrimarySection } from "@/components/site-header";

type PendingAction = () => void | Promise<void>;

type SiteFrameContextValue = {
  /** Pages that hold unsaved code report it here so navigation and sign-out can warn first. */
  setUnsavedChanges: (dirty: boolean, discard?: (() => void) | null) => void;
  protectUnsavedCode: (action: PendingAction) => void;
  /** Increases when the user re-selects "Problems" while already on it. */
  problemsListRevision: number;
};

const SiteFrameContext = createContext<SiteFrameContextValue | null>(null);

const selectedProblemStorageKey = "code-tutor:selected-problem";

export function useSiteFrame(): SiteFrameContextValue {
  const context = useContext(SiteFrameContext);
  if (!context) throw new Error("useSiteFrame must be used inside SiteFrame.");
  return context;
}

export function SiteFrame({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const { settings } = useSettings();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const userId = user?.id ?? null;
  const activeSection = sectionFromPathname(pathname);

  const [hasUnsavedCode, setHasUnsavedCode] = useState(false);
  // Mirrors hasUnsavedCode so the callbacks shared through context keep a stable identity.
  // Pages put these callbacks in effect dependencies; a changing identity re-runs those
  // effects, which would reset the very flag being reported.
  const hasUnsavedCodeRef = useRef(false);
  const discardRef = useRef<(() => void) | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [problemsListRevision, setProblemsListRevision] = useState(0);

  const setUnsavedChanges = useCallback((dirty: boolean, discard?: (() => void) | null) => {
    hasUnsavedCodeRef.current = dirty;
    setHasUnsavedCode(dirty);
    discardRef.current = dirty ? (discard ?? null) : null;
  }, []);

  const protectUnsavedCode = useCallback((action: PendingAction) => {
    if (hasUnsavedCodeRef.current) {
      setPendingAction(() => action);
      return;
    }
    void action();
  }, []);

  useEffect(() => {
    const scrollStateKey = pageStateKey(`scroll:${activeSection}`, userId);
    let saveTimer: number | null = null;
    const restoreTimer = window.setTimeout(() => {
      const restored = loadPageState(scrollStateKey, (value): value is number => typeof value === "number" && value >= 0);
      if (restored !== null) window.scrollTo({ top: restored });
    }, 0);
    const rememberScroll = () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => savePageState(scrollStateKey, window.scrollY), 120);
    };
    window.addEventListener("scroll", rememberScroll, { passive: true });
    return () => {
      window.clearTimeout(restoreTimer);
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      savePageState(scrollStateKey, window.scrollY);
      window.removeEventListener("scroll", rememberScroll);
    };
  }, [activeSection, userId]);

  useEffect(() => {
    if (!hasUnsavedCode) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedCode]);

  const navigate = (section: PrimarySection, event: MouseEvent<HTMLAnchorElement>) => {
    // Let "open in new tab" style clicks behave like normal links.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const isCurrentSection = section === activeSection;
    if (section === "problems" && isCurrentSection) {
      window.localStorage.removeItem(selectedProblemStorageKey);
      setProblemsListRevision((current) => current + 1);
    }
    if (hasUnsavedCode && !isCurrentSection) {
      event.preventDefault();
      protectUnsavedCode(() => router.push(sectionPaths[section]));
    }
  };

  const value = useMemo<SiteFrameContextValue>(
    () => ({ setUnsavedChanges, protectUnsavedCode, problemsListRevision }),
    [setUnsavedChanges, protectUnsavedCode, problemsListRevision],
  );

  return (
    <SiteFrameContext.Provider value={value}>
      <main data-code-tutor-theme={settings.theme} className={`flex min-h-screen w-full min-w-0 max-w-full flex-col overflow-x-hidden text-slate-200 ${settings.theme === "light" ? settings.background === "grid" ? "bg-[#dbe8f3] bg-[linear-gradient(rgba(30,64,96,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(30,64,96,0.055)_1px,transparent_1px)] bg-[size:42px_42px]" : settings.background === "soft" ? "bg-[#dbe8f3] bg-[radial-gradient(circle_at_70%_20%,rgba(14,116,144,0.13),transparent_34%)]" : "bg-[#dbe8f3]" : settings.background === "grid" ? "bg-[#090d14] bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:42px_42px]" : settings.background === "soft" ? "bg-[#090d14] bg-[radial-gradient(circle_at_70%_20%,rgba(34,211,238,0.07),transparent_32%)]" : "bg-[#090d14]"}`}>
        <SiteHeader
          activeSection={activeSection}
          onBeforeSignOut={(signOut) => protectUnsavedCode(async () => {
            if (user) clearUserPageStates(user.id);
            await signOut();
          })}
          onNavigate={navigate}
        />
        {children}
        <ConfirmDialog
          open={pendingAction !== null}
          title={t("unsavedChanges")}
          description={t("yourUnsavedCodeChangesWill")}
          confirmLabel={t("leaveWithoutSaving")}
          cancelLabel={t("cancel")}
          closeLabel={t("closeDialog")}
          tone="danger"
          onClose={() => setPendingAction(null)}
          onConfirm={() => {
            const action = pendingAction;
            discardRef.current?.();
            setPendingAction(null);
            setUnsavedChanges(false);
            if (action) void action();
          }}
        />
      </main>
    </SiteFrameContext.Provider>
  );
}
