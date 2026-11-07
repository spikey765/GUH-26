"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth-provider";

function friendly(err: string) {
  const e = err.toLowerCase();
  if (e.includes("invalid login")) return "That email and password don't match. Check them and try again.";
  if (e.includes("already registered") || e.includes("already been registered")) return "There's already an account with that email. Sign in instead.";
  if (e.includes("password should be")) return "Use a password with at least 6 characters.";
  if (e.includes("rate limit") || e.includes("too many")) return "Too many tries. Wait a minute, then try again.";
  if (e.includes("fetch") || e.includes("network")) return "Can't connect right now. Check your internet and try again.";
  return err;
}

export function Login() {
  const { signIn, signUp, signInDemo, demo } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const err = mode === "in" ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    setBusy(false);
    if (err) setMsg(friendly(err));
  }

  const signingIn = mode === "in";

  return (
    <main className="flex min-h-dvh flex-col px-6 pb-8 pt-12 sm:min-h-[calc(100dvh-3rem)]">
      <p className="font-display text-xl font-extrabold tracking-tight text-ink">HeadsUp</p>

      <div className="mt-14">
        <h1 className="font-display text-[32px] font-bold leading-tight text-ink">{signingIn ? "Sign in" : "Create your account"}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">See money surprises before they hit.</p>
      </div>

      {demo ? (
        <div className="mt-8 space-y-3">
          <Button className="h-12 w-full text-base" onClick={signInDemo}>
            Use the demo account
          </Button>
          <p className="text-sm text-muted-foreground">Sign-in isn&apos;t set up on this computer, so this uses made-up data.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-5" noValidate={false}>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!msg}
              className="h-12 bg-card text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                autoComplete={signingIn ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!msg}
                aria-describedby={signingIn ? undefined : "password-hint"}
                className="h-12 bg-card pr-12 text-base"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
                className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-ink"
              >
                {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
              </button>
            </div>
            {!signingIn && (
              <p id="password-hint" className="text-sm text-muted-foreground">
                At least 6 characters.
              </p>
            )}
          </div>

          {msg && (
            <p role="alert" className="text-sm text-tight">
              {msg}
            </p>
          )}

          <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
            {busy ? (signingIn ? "Signing in" : "Creating account") : signingIn ? "Sign in" : "Create account"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {signingIn ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="font-semibold text-ink underline underline-offset-4"
              onClick={() => {
                setMode(signingIn ? "up" : "in");
                setMsg(null);
              }}
            >
              {signingIn ? "Create an account" : "Sign in"}
            </button>
          </p>
        </form>
      )}

      <p className="mt-auto flex items-center gap-2 pt-10 text-xs text-muted-foreground">
        <Lock className="size-3.5 shrink-0" aria-hidden /> HeadsUp only reads your payments. It can&apos;t move your money.
      </p>
    </main>
  );
}
