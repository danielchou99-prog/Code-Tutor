"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { type AuthErrorCode, classifyAuthError } from "@/lib/supabase/auth-errors";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type AuthResult = { error: string | null; errorCode?: AuthErrorCode };

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  signOutAll: () => Promise<AuthResult>;
  updateEmail: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  updateProfile: (profile: { display_name: string; username: string; bio: string; avatar_url: string }) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function unavailableResult(): AuthResult {
  return { error: "Supabase public configuration is missing." };
}

async function runAuth(action: () => Promise<{ error: unknown }>): Promise<AuthResult> {
  try {
    const { error } = await action();
    if (!error) return { error: null };
    const message = (error as { message?: unknown }).message;
    return {
      error: typeof message === "string" && message ? message : "Authentication failed.",
      errorCode: classifyAuthError(error),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Authentication failed.",
      errorCode: classifyAuthError(error),
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(configured);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!configured) return;

    const supabase = getSupabaseBrowserClient();
    let mounted = true;
    const loadingTimeout = window.setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5_000);

    void supabase.auth.getUser()
      .then(({ data }) => {
        if (!mounted) return;
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      window.clearTimeout(loadingTimeout);
      data.subscription.unsubscribe();
    };
  }, [configured]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading,
      user,
      async signIn(email, password) {
        if (!configured) return unavailableResult();
        return runAuth(() => getSupabaseBrowserClient().auth.signInWithPassword({
          email,
          password,
        }));
      },
      async signUp(name, email, password) {
        if (!configured) return unavailableResult();
        return runAuth(() => getSupabaseBrowserClient().auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name },
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
          },
        }));
      },
      async sendPasswordReset(email) {
        if (!configured) return unavailableResult();
        return runAuth(() => getSupabaseBrowserClient().auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/confirm?next=/auth/update-password`,
        }));
      },
      async signOut() {
        if (!configured) return unavailableResult();
        return runAuth(() => getSupabaseBrowserClient().auth.signOut());
      },
      async signOutAll() {
        if (!configured) return unavailableResult();
        return runAuth(() => getSupabaseBrowserClient().auth.signOut({ scope: "global" }));
      },
      async updateEmail(email) {
        if (!configured) return unavailableResult();
        return runAuth(() => getSupabaseBrowserClient().auth.updateUser(
          { email },
          { emailRedirectTo: `${window.location.origin}/auth/confirm` },
        ));
      },
      async updatePassword(password) {
        if (!configured) return unavailableResult();
        return runAuth(() => getSupabaseBrowserClient().auth.updateUser({ password }));
      },
      async updateProfile(profile) {
        if (!configured) return unavailableResult();
        return runAuth(() => getSupabaseBrowserClient().auth.updateUser({ data: profile }));
      },
    }),
    [configured, loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
