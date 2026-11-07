"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";

type AuthState = {
  ready: boolean;
  token: string | null;
  email: string | null;
  demo: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signInDemo: () => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);
const DEMO_KEY = "headsup-demo";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      try {
        if (localStorage.getItem(DEMO_KEY)) {
          setToken("demo");
          setEmail("Demo account");
        }
      } catch {}
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token ?? null);
      setEmail(session?.user.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (e: string, p: string) => {
    if (!supabase) return "Sign-in is not set up. Use the demo account.";
    const { error } = await supabase.auth.signInWithPassword({ email: e, password: p });
    return error ? error.message : null;
  }, []);

  const signUp = useCallback(async (e: string, p: string) => {
    if (!supabase) return "Sign-in is not set up. Use the demo account.";
    const { data, error } = await supabase.auth.signUp({ email: e, password: p });
    if (error) return error.message;
    if (!data.session) return "Check your email for a link to finish signing up.";
    return null;
  }, []);

  const signInDemo = useCallback(() => {
    try {
      localStorage.setItem(DEMO_KEY, "1");
    } catch {}
    setToken("demo");
    setEmail("Demo account");
  }, []);

  const signOut = useCallback(async () => {
    try {
      localStorage.removeItem(DEMO_KEY);
    } catch {}
    if (supabase) await supabase.auth.signOut();
    setToken(null);
    setEmail(null);
  }, []);

  const value = useMemo(
    () => ({ ready, token, email, demo: !supabaseConfigured, signIn, signUp, signInDemo, signOut }),
    [ready, token, email, signIn, signUp, signInDemo, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
