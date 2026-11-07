"use client";

import { useEffect, useState } from "react";
import { Check, Landmark, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export const SYNC_MS = 5000;

const STEPS = [
  { at: 0, label: "Connecting to Example Bank" },
  { at: 1200, label: "Reading 12 months of payments" },
  { at: 2600, label: "Finding your pay, bills and benefits" },
  { at: 3900, label: "Working out your next 60 days" },
];

export function BankSync({ onDone }: { onDone: () => void }) {
  const [ms, setMs] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => {
      const e = Date.now() - start;
      setMs(e);
      if (e >= SYNC_MS) {
        clearInterval(t);
        onDone();
      }
    }, 100);
    return () => clearInterval(t);
  }, [onDone]);

  const step = STEPS.filter((s) => ms >= s.at).length - 1;
  const pct = Math.min(100, (ms / SYNC_MS) * 100);

  return (
    <main className="flex min-h-dvh flex-col px-6 pb-10 pt-16 sm:min-h-[calc(100dvh-3rem)]" role="status" aria-live="polite">
      <p className="font-display text-lg font-extrabold tracking-tight">HeadsUp</p>

      <div className="mt-10 flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-xl bg-ink text-white">
          <Landmark className="size-6" aria-hidden />
        </span>
        <span className="h-0.5 flex-1 overflow-hidden rounded bg-mist">
          <span className="block h-full w-1/3 rounded bg-safe motion-safe:animate-[sync_1.2s_ease-in-out_infinite]" />
        </span>
        <span className="flex size-12 items-center justify-center rounded-xl bg-safe text-white font-display text-lg font-extrabold">H</span>
      </div>

      <h1 className="mt-8 font-display text-3xl font-bold leading-tight">Syncing with your bank</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        You allowed HeadsUp to read your Example Bank app. We can only read your payments. We can&apos;t move money.
      </p>

      <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-mist">
        <div className="h-full rounded-full bg-ink transition-[width] duration-100 ease-linear" style={{ width: `${pct}%` }} />
      </div>

      <ol className="mt-6 space-y-3">
        {STEPS.map((s, i) => {
          const state = i < step || ms >= SYNC_MS ? "done" : i === step ? "now" : "next";
          return (
            <li key={s.label} className={cn("flex items-center gap-3 text-[15px]", state === "next" ? "text-muted-foreground/60" : "text-ink")}>
              {state === "done" ? (
                <span className="flex size-5 items-center justify-center rounded-full bg-safe text-white animate-in zoom-in-50">
                  <Check className="size-3" aria-hidden />
                </span>
              ) : state === "now" ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <span className="size-5 rounded-full border-2 border-line" aria-hidden />
              )}
              <span className={state === "now" ? "font-semibold" : ""}>{s.label}</span>
            </li>
          );
        })}
      </ol>

      <p className="mt-auto flex items-center gap-2 pt-10 text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden /> Read-only access. You can turn it off in your banking app at any time.
      </p>
    </main>
  );
}
