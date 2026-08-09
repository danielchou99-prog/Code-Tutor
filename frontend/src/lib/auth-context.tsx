"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type AuthResult = { error: string | null };

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function unavailableResult(): AuthResult {
  return { error: "Supabase public configuration is missing." };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(configured);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!configured) return;

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
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
        const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({
          email,
          password,
        });
        return { error: error?.message ?? null };
      },
      async signUp(name, email, password) {
        if (!configured) return unavailableResult();
        const { error } = await getSupabaseBrowserClient().auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name },
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
          },
        });
        return { error: error?.message ?? null };
      },
      async sendPasswordReset(email) {
        if (!configured) return unavailableResult();
        const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/confirm?next=/auth/update-password`,
        });
        return { error: error?.message ?? null };
      },
      async signOut() {
        if (!configured) return unavailableResult();
        const { error } = await getSupabaseBrowserClient().auth.signOut();
        return { error: error?.message ?? null };
      },
      async updatePassword(password) {
        if (!configured) return unavailableResult();
        const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
        return { error: error?.message ?? null };
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
