"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth-provider";

function Squiggle() {
  return (
    <svg viewBox="0 0 320 90" className="h-auto w-full" aria-hidden>
      <defs>
        <linearGradient id="sq" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0.62" stopColor="var(--safe)" />
          <stop offset="0.62" stopColor="var(--tight)" />
        </linearGradient>
      </defs>
      <line x1="0" x2="320" y1="56" y2="56" stroke="var(--line)" strokeDasharray="3 4" />
      <path
        d="M0 40 C 30 18, 50 22, 70 30 S 110 14, 140 24 S 180 40, 200 62 S 230 84, 250 70 S 290 30, 320 26"
        fill="none"
        stroke="url(#sq)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="232" cy="78" r="5" fill="var(--tight)" />
    </svg>
  );
}

export function Login() {
  const { signIn, signUp, signInDemo, demo } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const err = mode === "in" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (err) setMsg(err);
  }

  return (
    <main className="flex min-h-dvh flex-col px-6 pb-10 pt-14 sm:min-h-[calc(100dvh-3rem)]">
      <h1 className="font-display text-[56px] font-extrabold leading-[0.9] tracking-tight text-ink">
        Heads
        <br />
        Up
      </h1>
      <p className="mt-5 max-w-[30ch] text-lg leading-snug text-ink">See money surprises before they hit.</p>
      <p className="mt-2 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground">
        Bill rises, school holidays and winter heating. We tell you weeks early and help you get ready.
      </p>
      <div className="mt-8">
        <Squiggle />
      </div>

      <div className="mt-auto pt-10">
        {demo ? (
          <div className="space-y-3">
            <Button className="h-12 w-full text-base" onClick={signInDemo}>
              Use the demo account
            </Button>
            <p className="text-center text-sm text-muted-foreground">Sign-in isn&apos;t set up on this computer, so this uses made-up data.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 bg-card text-base" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 bg-card text-base"
              />
            </div>
            {msg && (
              <p role="alert" className="rounded-md bg-maybe-soft px-3 py-2 text-sm text-ink">
                {msg}
              </p>
            )}
            <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
              {busy ? "One moment" : mode === "in" ? "Sign in" : "Create account"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground underline underline-offset-4"
              onClick={() => {
                setMode(mode === "in" ? "up" : "in");
                setMsg(null);
              }}
            >
              {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
