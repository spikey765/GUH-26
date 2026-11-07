"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Menu } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Login } from "@/components/login";
import { AboutForm } from "@/components/about-form";
import { ForecastChart } from "@/components/forecast-chart";
import { WarningList, WarningSheet } from "@/components/warnings";
import { WhatIf } from "@/components/what-if";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, ApiError } from "@/lib/api";
import type { AgentEvent, Forecast, Profile, Warning } from "@/lib/types";
import { longDate, pounds } from "@/lib/format";
import { cn } from "@/lib/utils";

type View = "loading" | "about" | "home";

export default function Page() {
  const { ready, token, signOut } = useAuth();
  if (!ready) return null;
  if (!token) return <Login />;
  return <App token={token} signOut={signOut} />;
}

function App({ token, signOut }: { token: string; signOut: () => Promise<void> }) {
  const client = useMemo(() => api(token), [token]);
  const [view, setView] = useState<View>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [whatIf, setWhatIf] = useState(false);
  const [menu, setMenu] = useState(false);
  const [log, setLog] = useState<AgentEvent[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        signOut();
        return;
      }
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    },
    [signOut],
  );

  const loadHome = useCallback(async () => {
    const [f, w] = await Promise.all([client.forecast(), client.warnings()]);
    setForecast(f);
    setWarnings(w.warnings);
  }, [client]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  useEffect(() => {
    (async () => {
      try {
        const p = await client.getProfile();
        setProfile(p.profile);
        if (p.source === "default") {
          setProfile(null);
          setView("about");
        } else {
          await loadHome();
          setView("home");
        }
      } catch (e) {
        handle(e);
      }
    })();
  }, [client, loadHome, handle]);

  function flash(before: Forecast | null, after: Forecast) {
    if (!before) return;
    const was = before.worst_day.balance;
    const now = after.worst_day.balance;
    if (Math.round(was) === Math.round(now)) setNote("Saved.");
    else setNote(`Saved. Your lowest day was ${pounds(was)}. Now it's ${pounds(now)}.`);
    setTimeout(() => setNote(null), 6000);
  }

  async function answer(id: string, yes: boolean) {
    setBusy(true);
    try {
      const r = await client.action({ warning_id: id, confirmed: yes });
      flash(forecast, r.forecast);
      setForecast(r.forecast);
      setWarnings(r.warnings);
      setOpenId(null);
    } catch (e) {
      handle(e);
    } finally {
      setBusy(false);
    }
  }

  async function openLog() {
    setMenu(false);
    try {
      setLog((await client.agentLog()).events);
    } catch (e) {
      handle(e);
    }
  }

  async function reset() {
    setMenu(false);
    try {
      await client.resetActions();
      await loadHome();
      setNote("Your answers are cleared.");
      setTimeout(() => setNote(null), 4000);
    } catch (e) {
      handle(e);
    }
  }

  if (err)
    return (
      <main className="space-y-4 p-6 pt-16">
        <h1 className="font-display text-2xl font-bold">We can&apos;t load your 60 days</h1>
        <p className="text-muted-foreground">{err}</p>
        <Button onClick={() => location.reload()}>Try again</Button>
      </main>
    );

  if (view === "loading") return <p className="p-6 pt-16 text-muted-foreground">Loading your 60 days</p>;

  if (view === "about")
    return (
      <main>
        <header className="px-5 pb-4 pt-8">
          <p className="font-display text-sm font-bold text-ink/60">Heads Up</p>
          <h1 className="mt-1 font-display text-3xl font-bold">About you</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">This helps us show only the changes that affect you. You can change it any time.</p>
        </header>
        <AboutForm
          initial={profile}
          onGuess={() => client.guessProfile()}
          onSave={async (p) => {
            const r = await client.putProfile(p);
            setProfile(r.profile);
            await loadHome();
            setView("home");
          }}
        />
      </main>
    );

  if (!forecast) return null;
  const tight = forecast.tight_weeks;
  const soon = warnings.filter((w) => w.in_window);
  const later = warnings.filter((w) => !w.in_window);
  const open = warnings.find((w) => w.id === openId) ?? null;

  return (
    <main className="pb-28">
      <header className="flex items-center justify-between px-5 pt-6">
        <p className="font-display text-lg font-extrabold tracking-tight">Heads Up</p>
        <Button variant="ghost" size="icon" aria-label="Menu" onClick={() => setMenu(true)}>
          <Menu className="size-5" />
        </Button>
      </header>

      <section className="px-5 pt-4">
        {tight.length ? (
          <h1 className="font-display text-[34px] font-bold leading-[1.05]">
            Money gets tight from <span className="text-tight">{longDate(tight[0].start)}</span>
          </h1>
        ) : (
          <h1 className="font-display text-[34px] font-bold leading-[1.05]">You stay above £50 for the next 60 days</h1>
        )}
        <p className="mt-2 text-[15px] text-muted-foreground">
          You have {pounds(forecast.start_balance)} today. Lowest point:{" "}
          <span className={cn("font-semibold", forecast.worst_day.balance < 50 ? "text-tight" : "text-ink")}>
            {pounds(forecast.worst_day.balance)} on {longDate(forecast.worst_day.date)}
          </span>
          .
        </p>
      </section>

      <section className="mt-4 px-2">
        <ForecastChart forecast={forecast} warnings={warnings} onMarker={setOpenId} />
        <p className="px-3 pt-1 text-xs text-muted-foreground">
          The line is what we expect. The grey band shows good and bad weeks for pay. Dots are changes coming up. Tap one to see it.
        </p>
      </section>

      <div aria-live="polite">
        {note && <p className="mx-5 mt-4 rounded-md bg-safe-soft px-3 py-2 text-sm font-medium text-ink">{note}</p>}
      </div>

      <section className="mt-7">
        <h2 className="px-5 pb-2 font-display text-xl font-bold">Coming up</h2>
        <WarningList warnings={soon} tight={tight} onOpen={setOpenId} />
      </section>

      {later.length > 0 && (
        <section className="mt-7">
          <h2 className="px-5 pb-2 font-display text-xl font-bold">Later this year</h2>
          <WarningList warnings={later} tight={[]} onOpen={setOpenId} />
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[440px] border-t bg-background/95 px-5 py-3 backdrop-blur sm:bottom-6 sm:rounded-b-[28px]">
        <Button className="h-12 w-full text-base" onClick={() => setWhatIf(true)}>
          What if?
        </Button>
      </div>

      <WarningSheet warning={open} open={!!open} busy={busy} onOpenChange={(o) => !o && setOpenId(null)} onAnswer={answer} />

      <WhatIf
        open={whatIf}
        onOpenChange={setWhatIf}
        forecast={forecast}
        simulate={(b) => client.simulate(b)}
        confirm={async (s) => {
          const r = await client.action({
            warning_id: "whatif",
            confirmed: true,
            amount_gbp: s.shock.amount_gbp,
            date: s.shock.date,
            label: s.shock.label,
            weekly_gbp: s.suggestion.weekly_gbp,
          });
          flash(forecast, r.forecast);
          setForecast(r.forecast);
          setWarnings(r.warnings);
        }}
      />

      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="right" className="w-[300px]">
          <SheetHeader>
            <SheetTitle className="font-display">Menu</SheetTitle>
            <SheetDescription className="sr-only">Settings and account</SheetDescription>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-4">
            <Button variant="ghost" className="justify-start" onClick={() => { setMenu(false); setView("about"); }}>
              About you
            </Button>
            <Button variant="ghost" className="justify-start" onClick={openLog}>
              What the AI did
            </Button>
            <Button variant="ghost" className="justify-start" onClick={reset}>
              Clear my answers
            </Button>
            <Button variant="ghost" className="justify-start" onClick={() => signOut()}>
              Sign out
            </Button>
          </nav>
        </SheetContent>
      </Sheet>

      <Sheet open={log !== null} onOpenChange={(o) => !o && setLog(null)}>
        <SheetContent side="bottom" className="mx-auto max-h-[80dvh] max-w-[440px] overflow-y-auto rounded-t-[22px]">
          <SheetHeader>
            <SheetTitle className="font-display text-xl">What the AI did</SheetTitle>
            <SheetDescription>Every time the app asks the AI something, it shows here with the reason.</SheetDescription>
          </SheetHeader>
          <ul className="divide-y px-4 pb-6">
            {log?.length ? (
              log.map((e, i) => (
                <li key={i} className="py-3 text-sm">
                  <p className="font-semibold">{e.tool === "profile_guess" ? "Guessed your About you answers" : e.tool}</p>
                  <p className="text-muted-foreground">{e.reason}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("en-GB")}</p>
                </li>
              ))
            ) : (
              <li className="py-3 text-sm text-muted-foreground">Nothing yet. Try &quot;Fill it in for me&quot; on the About you page.</li>
            )}
          </ul>
        </SheetContent>
      </Sheet>
    </main>
  );
}
