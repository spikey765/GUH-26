"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Menu, Zap } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Login } from "@/components/login";
import { AboutForm } from "@/components/about-form";
import { BankSync } from "@/components/bank-sync";
import { ForecastChart } from "@/components/forecast-chart";
import { WarningCarousel, WarningSheet } from "@/components/warnings";
import { NewsCarousel } from "@/components/news";
import { playAudio } from "@/lib/voice";
import { WhatIf } from "@/components/what-if";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, ApiError } from "@/lib/api";
import type { AgentEvent, Forecast, NewsItem, Profile, Warning } from "@/lib/types";
import { longDate, pounds, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type View = "loading" | "about" | "home";
type Label = Warning["label"];

const TABS: { id: Label | null; text: string }[] = [
  { id: null, text: "All" },
  { id: "confirmed", text: "Confirmed" },
  { id: "likely", text: "Likely" },
  { id: "forecast", text: "Forecast" },
];

export default function Page() {
  const { ready, token, signOut } = useAuth();
  if (!ready) return null;
  if (!token) return <Login />;
  return <App token={token} signOut={signOut} />;
}

function Bone({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-mist", className)} />;
}

function HomeSkeleton() {
  return (
    <main className="pb-28" role="status" aria-label="Loading your 60 days">
      <div className="flex items-center justify-between px-5 pt-6">
        <p className="font-display text-lg font-extrabold tracking-tight">HeadsUp</p>
      </div>
      <div className="space-y-2.5 px-5 pt-4">
        <Bone className="h-8 w-4/5" />
        <Bone className="h-8 w-3/5" />
        <Bone className="mt-3 h-4 w-11/12" />
      </div>
      <div className="relative mx-2 mt-5 h-[230px] overflow-hidden rounded-lg bg-mist/60">
        <svg viewBox="0 0 400 230" preserveAspectRatio="none" className="absolute inset-0 h-full w-full animate-pulse" aria-hidden>
          <path d="M0 150 C 40 120, 70 60, 110 70 S 170 140, 210 120 S 280 50, 320 80 S 370 170, 400 160" fill="none" stroke="var(--line)" strokeWidth="5" strokeLinecap="round" />
        </svg>
        <p className="absolute inset-x-0 bottom-3 text-center text-sm text-muted-foreground">Working out your next 60 days...</p>
      </div>
      <div className="mt-8 px-5">
        <Bone className="h-6 w-32" />
      </div>
      <ul className="mt-3 divide-y border-y">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-4 px-5 py-4">
            <Bone className="h-12 w-12 shrink-0" />
            <div className="flex-1 space-y-2">
              <Bone className="h-4 w-3/4" />
              <Bone className="h-3.5 w-1/2" />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

const SYNC_KEY = "headsup-bank-synced";

const ACTION_NAMES: Record<string, string> = {
  profile_guess: "Filled in your answers",
  news_summary: "Explained a news story",
  voice_transcribe: "Listened to you",
  whatif_voice: "Set up a what-if",
};

function App({ token, signOut: rawSignOut }: { token: string; signOut: () => Promise<void> }) {
  const client = useMemo(() => api(token), [token]);
  const [synced, setSynced] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("loading");

  useEffect(() => {
    let done = false;
    try {
      done = sessionStorage.getItem(SYNC_KEY) === "1";
    } catch {}
    setSynced(done);
  }, []);

  const finishSync = useCallback(() => {
    try {
      sessionStorage.setItem(SYNC_KEY, "1");
    } catch {}
    setSynced(true);
  }, []);

  const signOut = useCallback(() => {
    try {
      sessionStorage.removeItem(SYNC_KEY);
    } catch {}
    return rawSignOut();
  }, [rawSignOut]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const forecastRef = useRef<Forecast | null>(null);
  useEffect(() => {
    forecastRef.current = forecast;
  }, [forecast]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pointId, setPointId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Label | null>(null);
  const [past, setPast] = useState<{ date: string; balance: number }[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const placed = useRef(false);
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
    const [f, w, n, h] = await Promise.all([client.forecast(), client.warnings(), client.news(), client.history().catch(() => null)]);
    setForecast(f);
    if (h) setPast(h.days);
    setWarnings(w.warnings);
    setNews(n.news);
  }, [client]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || placed.current || !past.length) return;
    el.scrollLeft = el.scrollWidth - el.clientWidth - 44;
    placed.current = true;
  });

  useEffect(() => {
    placed.current = false;
    window.scrollTo(0, 0);
  }, [view]);

  useEffect(() => {
    const back = () => setView((v) => (v === "about" && forecastRef.current ? "home" : v));
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

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

  async function removeShock(id: number) {
    setBusy(true);
    try {
      const r = await client.removeWhatIf(id);
      flash(forecast, r.forecast);
      setForecast(r.forecast);
      setWarnings(r.warnings);
    } catch (e) {
      handle(e);
    } finally {
      setBusy(false);
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

  if (synced === null) return null;
  if (!synced) return <BankSync onDone={finishSync} />;
  if (view === "loading") return <HomeSkeleton />;

  if (view === "about")
    return (
      <main>
        <header className="px-5 pb-4 pt-6">
          {forecast ? (
            <Button variant="ghost" className="-ml-3 mb-1 gap-1 px-3 text-ink" onClick={() => history.back()}>
              <ArrowLeft className="size-4" aria-hidden /> Back to your 60 days
            </Button>
          ) : (
            <p className="pt-2 font-display text-sm font-bold text-ink/60">HeadsUp</p>
          )}
          <h1 className="mt-1 font-display text-3xl font-bold">About you</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">This helps us show only the changes that affect you. You can change it any time.</p>
        </header>
        <AboutForm
          initial={profile}
          onGuess={(f) => client.guessProfile(f)}
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
  const shocks = forecast.shocks ?? [];
  const chartForecast: Forecast = past.length
    ? { ...forecast, days: [...past.map((d) => ({ date: d.date, balance: d.balance, low: d.balance, high: d.balance, items: [] })), ...forecast.days] }
    : forecast;
  const open = warnings.find((w) => w.id === openId) ?? null;
  const hold = !!open || whatIf || menu || log !== null || pointId !== null;

  return (
    <main className="pb-28">
      <header className="flex items-center justify-between px-5 pt-6">
        <p className="font-display text-lg font-extrabold tracking-tight">HeadsUp</p>
        <Button variant="ghost" size="icon" aria-label="Menu" onClick={() => setMenu(true)}>
          <Menu className="size-5" />
        </Button>
      </header>

      <section className="px-5 pt-5">
        <p className="text-sm font-medium text-muted-foreground">{forecast.account?.name ?? "Your account"}</p>
        <h1 className="mt-1 font-display font-extrabold leading-none tracking-tight tabular-nums" aria-label={`Balance ${pounds(forecast.start_balance, { pence: true })}`}>
          <span className="text-[56px]">{pounds(Math.trunc(forecast.start_balance))}</span>
          <span className="text-[28px] text-muted-foreground">.{Math.abs(Math.round((forecast.start_balance % 1) * 100)).toString().padStart(2, "0")}</span>
        </h1>
        <p className="mt-3 text-[15px]">
          {tight.length ? (
            <>
              Money gets tight from <span className="font-semibold text-tight">{longDate(tight[0].start)}</span>. Lowest{" "}
              <span className="whitespace-nowrap font-semibold text-tight">{pounds(forecast.worst_day.balance)}</span> on <span className="whitespace-nowrap">{shortDate(forecast.worst_day.date)}</span>.
            </>
          ) : (
            <>You stay above £50 for the next 60 days.</>
          )}
        </p>
        {shocks.map((s) => (
          <p key={s.id ?? s.date} className="mt-1 text-sm text-muted-foreground">
            <span className="mr-1.5 inline-block size-2 rounded-full bg-tight align-middle" aria-hidden />
            Includes your what-if: {s.label}, {pounds(s.amount_gbp)} on {shortDate(s.date)}.{" "}
            {s.id != null && (
              <button className="underline underline-offset-4" disabled={busy} onClick={() => removeShock(s.id!)}>
                Remove
              </button>
            )}
          </p>
        ))}
      </section>

      <div className="mt-4 flex gap-1 overflow-x-auto px-5 no-scrollbar" role="tablist" aria-label="Show changes on the graph">
        {TABS.map((t) => {
          const on = t.id === highlight;
          return (
            <button
              key={t.text}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setHighlight(t.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                on ? "bg-ink text-white" : "text-muted-foreground hover:bg-mist hover:text-ink",
              )}
            >
              {t.id && (
                <span
                  aria-hidden
                  className={cn("size-2.5 rounded-full ring-1 ring-white/60", t.id === "confirmed" ? "bg-confirmed" : t.id === "likely" ? "bg-likely" : "bg-forecast")}
                />
              )}
              {t.text}
            </button>
          );
        })}
      </div>

      <section className="mt-2">
        <div
          ref={scroller}
          className="no-scrollbar select-none overflow-x-auto overscroll-x-contain"
          aria-label="Balance chart. Scroll sideways to see the past."
          onPointerDown={(e) => {
            if (e.pointerType !== "mouse" || !scroller.current) return;
            drag.current = { x: e.clientX, left: scroller.current.scrollLeft, moved: false };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || !scroller.current) return;
            const dx = e.clientX - d.x;
            if (!d.moved && Math.abs(dx) > 4) {
              d.moved = true;
              e.currentTarget.setPointerCapture(e.pointerId);
            }
            scroller.current.scrollLeft = d.left - dx;
          }}
          onPointerUp={() => {
            setTimeout(() => (drag.current = null), 0);
          }}
          onClickCapture={(e) => {
            if (drag.current?.moved) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <div className="px-2" style={{ width: `${(chartForecast.days.length / Math.max(1, forecast.days.length)) * 100}%` }}>
            <ForecastChart
              forecast={chartForecast}
              warnings={warnings}
              highlight={highlight}
              onMarker={setOpenId}
              onMarkerHover={setPointId}
              activeId={activeId}
              height={260}
              shockDates={shocks.map((s) => s.date)}
              today={forecast.today}
            />
          </div>
        </div>
      </section>

      <div aria-live="polite">
        {note && <p className="mx-5 mt-4 rounded-md bg-safe-soft px-3 py-2 text-sm font-medium text-ink">{note}</p>}
      </div>

      <section className="mt-7">
        <h2 className="px-5 pb-3 font-display text-xl font-bold">Coming up</h2>
        <WarningCarousel label="Coming up" warnings={soon} tight={tight} onOpen={setOpenId} paused={hold} interval={6000} onActive={setActiveId} focusId={pointId} />
      </section>

      {later.length > 0 && (
        <section className="mt-7">
          <h2 className="px-5 pb-3 font-display text-xl font-bold">Later this year</h2>
          <WarningCarousel label="Later this year" warnings={later} tight={[]} onOpen={setOpenId} paused={hold} autoplay={false} />
        </section>
      )}

      <section className="mt-7">
        <h2 className="px-5 pb-3 font-display text-xl font-bold">News for you</h2>
        <NewsCarousel
          news={news}
          paused={hold}
          say={async (n) => {
            const r = await client.newsSummary(n.id);
            const blob = await client.speak(r.summary);
            return { text: r.summary, play: () => new Promise<void>((done) => void playAudio(blob, done).catch(() => done())) };
          }}
        />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[440px] glass border-t border-white/60 px-5 py-3 shadow-[0_-8px_24px_-16px_rgba(20,33,61,0.25)] sm:bottom-6 sm:rounded-b-[28px]">
        <Button className="h-12 w-full gap-2 text-base" onClick={() => setWhatIf(true)}>
          <Zap className="size-5" aria-hidden /> What if? Add a surprise cost
        </Button>
      </div>

      <WarningSheet warning={open} open={!!open} busy={busy} onOpenChange={(o) => !o && setOpenId(null)} onAnswer={answer} />

      <WhatIf
        open={whatIf}
        onOpenChange={setWhatIf}
        forecast={forecast}
        simulate={(b) => client.simulate(b)}
        parse={(text) => client.parseWhatIf(text)}
        transcribe={(audio) => client.transcribe(audio)}
        say={async (text) => {
          const blob = await client.speak(text);
          await playAudio(blob);
        }}
        confirm={async (s, withSaving) => {
          const r = await client.action({
            warning_id: "whatif",
            confirmed: true,
            amount_gbp: s.shock.amount_gbp,
            date: s.shock.date,
            label: s.shock.label,
            weekly_gbp: withSaving ? s.suggestion.weekly_gbp : 0,
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
            <Button variant="ghost" className="justify-start" onClick={() => { setMenu(false); history.pushState({ view: "about" }, ""); setView("about"); }}>
              About you
            </Button>
            <Button variant="ghost" className="justify-start" onClick={openLog}>
              Agent&apos;s Actions
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
        <SheetContent side="bottom" className="mx-auto max-h-[80dvh] max-w-[440px] overflow-y-auto rounded-t-[22px] no-scrollbar">
          <SheetHeader>
            <SheetTitle className="font-display text-xl">Agent&apos;s Actions</SheetTitle>
            <SheetDescription>What the agent did for you, newest first.</SheetDescription>
          </SheetHeader>
          <ul className="divide-y px-4 pb-6">
            {log?.length ? (
              log.map((e, i) => (
                <li key={i} className="py-3 text-sm">
                  <p className="font-semibold">{ACTION_NAMES[e.tool] ?? "Did something for you"}</p>
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
