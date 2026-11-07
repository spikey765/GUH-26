"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Menu } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Login } from "@/components/login";
import { AboutForm } from "@/components/about-form";
import { ForecastChart } from "@/components/forecast-chart";
import { WarningCarousel, WarningSheet } from "@/components/warnings";
import { NewsCarousel } from "@/components/news";
import { WhatIf } from "@/components/what-if";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, ApiError } from "@/lib/api";
import type { AgentEvent, Forecast, NewsItem, Profile, Warning } from "@/lib/types";
import { longDate, pounds } from "@/lib/format";
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

function App({ token, signOut }: { token: string; signOut: () => Promise<void> }) {
  const client = useMemo(() => api(token), [token]);
  const [view, setView] = useState<View>("loading");
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
    const [f, w, n] = await Promise.all([client.forecast(), client.warnings(), client.news()]);
    setForecast(f);
    setWarnings(w.warnings);
    setNews(n.news);
  }, [client]);

  useEffect(() => {
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
        <header className="px-5 pb-4 pt-6">
          {forecast ? (
            <Button variant="ghost" className="-ml-3 mb-1 gap-1 px-3 text-ink" onClick={() => history.back()}>
              <ArrowLeft className="size-4" aria-hidden /> Back to your 60 days
            </Button>
          ) : (
            <p className="pt-2 font-display text-sm font-bold text-ink/60">Heads Up</p>
          )}
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
  const hold = !!open || whatIf || menu || log !== null || pointId !== null;
  const plotted = warnings.filter((w) => w.in_window && !w.good_news);

  return (
    <main className="pb-28">
      <header className="flex items-center justify-between px-5 pt-6">
        <p className="font-display text-lg font-extrabold tracking-tight">Heads Up</p>
        <Button variant="ghost" size="icon" aria-label="Menu" onClick={() => setMenu(true)}>
          <Menu className="size-5" />
        </Button>
      </header>

      <section className="px-5 pt-4">
        <h1 className="font-display text-[28px] font-bold leading-[1.1]">Your current account forecast</h1>
        <p className="mt-1 text-sm text-muted-foreground">What we expect your balance to be each day for the next 60 days.</p>
        {tight.length ? (
          <h2 className="mt-4 font-display text-xl font-bold leading-tight">
            Money gets tight from <span className="text-tight">{longDate(tight[0].start)}</span>
          </h2>
        ) : (
          <h2 className="mt-4 font-display text-xl font-bold leading-tight text-safe">You stay above £50 for the next 60 days</h2>
        )}
        <p className="mt-1 text-[15px] text-muted-foreground">
          You have {pounds(forecast.start_balance)} today. Lowest point:{" "}
          <span className={cn("font-semibold", forecast.worst_day.balance < 50 ? "text-tight" : "text-ink")}>
            {pounds(forecast.worst_day.balance)} on {longDate(forecast.worst_day.date)}
          </span>
          .
        </p>
      </section>

      <div className="mt-4 flex gap-1 overflow-x-auto px-5 no-scrollbar" role="tablist" aria-label="Show changes on the graph">
        {TABS.map((t) => {
          const on = t.id === highlight;
          const count = t.id ? plotted.filter((w) => w.label === t.id).length : plotted.length;
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
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", on ? "bg-white/20" : "bg-mist")}>{count}</span>
            </button>
          );
        })}
      </div>

      <section className="mt-2 px-2">
        <ForecastChart forecast={forecast} warnings={warnings} highlight={highlight} onMarker={setOpenId} onMarkerHover={setPointId} activeId={activeId} height={260} />
        <p className="px-3 pt-1 text-xs text-muted-foreground">
          The line is your expected balance. Dots are the changes in Coming up. Tap one to open it.
        </p>
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
          <WarningCarousel label="Later this year" warnings={later} tight={[]} onOpen={setOpenId} paused={hold} interval={6500} />
        </section>
      )}

      <section className="mt-7">
        <h2 className="px-5 font-display text-xl font-bold">Other news for you</h2>
        <p className="px-5 pb-3 text-sm text-muted-foreground">Advice and forecasts picked because they match your answers.</p>
        <NewsCarousel news={news} paused={hold} />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[440px] glass border-t border-white/60 px-5 py-3 shadow-[0_-8px_24px_-16px_rgba(20,33,61,0.25)] sm:bottom-6 sm:rounded-b-[28px]">
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
            <Button variant="ghost" className="justify-start" onClick={() => { setMenu(false); history.pushState({ view: "about" }, ""); setView("about"); }}>
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
        <SheetContent side="bottom" className="mx-auto max-h-[80dvh] max-w-[440px] overflow-y-auto rounded-t-[22px] no-scrollbar">
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
