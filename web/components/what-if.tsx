"use client";

import { useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { canRecord, startRecording } from "@/lib/voice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ForecastChart } from "@/components/forecast-chart";
import type { Forecast, Simulation } from "@/lib/types";
import { longDate, pounds } from "@/lib/format";

const PRESETS = [
  { label: "Car fails its MOT", amount: 350 },
  { label: "School uniform", amount: 120 },
  { label: "NHS dentist", amount: 76 },
];

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function spoken(n: number) {
  const v = Math.round(Math.abs(n));
  return n < 0 ? `minus £${v}` : `£${v}`;
}

function resultSentence(s: Simulation) {
  const when = longDate(s.shock.date);
  const head = `On ${when} you'd have ${spoken(s.after.on_date)} instead of ${spoken(s.before.on_date)}.`;
  const tail = s.suggestion.weekly_gbp > 0 ? ` Put £${s.suggestion.weekly_gbp} a week aside for ${s.suggestion.weeks} weeks and it's covered.` : " It's less than a week away, so there's no time to save for it.";
  return head + tail;
}

export function WhatIf({
  open,
  onOpenChange,
  forecast,
  simulate,
  parse,
  say,
  transcribe,
  confirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  forecast: Forecast;
  simulate: (b: { amount_gbp: number; date: string; label: string }) => Promise<Simulation>;
  parse?: (text: string) => Promise<{ label: string; amount_gbp: number | null; date: string }>;
  say?: (text: string) => Promise<void>;
  transcribe?: (audio: Blob) => Promise<{ text: string }>;
  confirm: (s: Simulation, withSaving: boolean) => Promise<void>;
}) {
  const [label, setLabel] = useState(PRESETS[0].label);
  const [amount, setAmount] = useState(String(PRESETS[0].amount));
  const [date, setDate] = useState(addDays(forecast.today, 33));
  const [sim, setSim] = useState<Simulation | null>(null);
  const [mic, setMic] = useState<"idle" | "recording" | "thinking">("idle");
  const [heard, setHeard] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const recorder = useRef<{ stop: () => Promise<Blob> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const min = forecast.today;
  const max = forecast.days[forecast.days.length - 1].date;

  async function runWith(l: string, a: string, d: string, aloud = false) {
    setErr(null);
    const n = Number(a);
    if (!n || n <= 0) return setErr("Enter how much it would cost.");
    setBusy(true);
    try {
      const s = await simulate({ amount_gbp: n, date: d, label: l.trim() || "Unexpected cost" });
      setSim(s);
      if (aloud && say) void say(resultSentence(s)).catch(() => {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function run(e: React.FormEvent) {
    e.preventDefault();
    void runWith(label, amount, date);
  }

  async function handleWords(text: string) {
    if (!parse) return;
    setHeard(text);
    setMic("thinking");
    try {
      const r = await parse(text);
      setLabel(r.label);
      setDate(r.date);
      setMic("idle");
      if (r.amount_gbp) {
        setAmount(String(r.amount_gbp));
        await runWith(r.label, String(r.amount_gbp), r.date, true);
      } else {
        setAmount("");
        setErr("How much would it cost? Type the amount, then tap Show me.");
      }
    } catch (e) {
      setMic("idle");
      setErr(e instanceof Error ? e.message : "We didn't understand that. Try again.");
    }
  }

  async function voice() {
    if (!transcribe) return;
    setErr(null);
    if (mic === "recording" && recorder.current) {
      const r = recorder.current;
      recorder.current = null;
      setMic("thinking");
      try {
        const audio = await r.stop();
        const { text } = await transcribe(audio);
        await handleWords(text);
      } catch (e) {
        setMic("idle");
        setErr(e instanceof Error ? e.message : "We didn't catch that. Try again or type it.");
      }
      return;
    }
    setHeard(null);
    try {
      recorder.current = await startRecording();
      setMic("recording");
    } catch (e) {
      setMic("idle");
      setErr(e instanceof Error ? e.message : "The microphone didn't start. Type it instead.");
    }
  }

  async function yes(withSaving: boolean) {
    if (!sim) return;
    setBusy(true);
    try {
      await confirm(sim, withSaving);
      setSim(null);
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const weekly = sim?.suggestion.weekly_gbp ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setSim(null);
      }}
    >
      <DialogContent className="max-h-[92dvh] max-w-[400px] overflow-y-auto rounded-[22px] no-scrollbar">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold">What if?</DialogTitle>
          <DialogDescription>Add a cost that might happen and see if you would cope.</DialogDescription>
        </DialogHeader>

        {!sim ? (
          <form onSubmit={run} className="space-y-4">
            {parse && (
              <div className="space-y-2 rounded-lg bg-mist p-3">
                {transcribe && canRecord() && (
                  <button type="button" onClick={voice} disabled={mic === "thinking" || busy} className="flex w-full items-center gap-3 text-left disabled:opacity-80">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-full text-white ${mic === "recording" ? "bg-tight motion-safe:animate-pulse" : "bg-ink"}`}>
                      {mic === "thinking" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : mic === "recording" ? <Square className="size-4" aria-hidden /> : <Mic className="size-5" aria-hidden />}
                    </span>
                    <span>
                      <span className="block font-semibold">{mic === "recording" ? "Listening. Tap to stop" : mic === "thinking" ? "Working it out..." : "Say it"}</span>
                      <span className="block text-sm text-muted-foreground">{heard ? `"${heard}"` : "For example: my car fails its MOT on 10 December, about £350"}</span>
                    </span>
                  </button>
                )}
                <div className="flex gap-2">
                  <Input
                    aria-label="Or type it"
                    placeholder="Or type it"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && typed.trim().length > 1) {
                        e.preventDefault();
                        void handleWords(typed.trim());
                      }
                    }}
                    className="h-10 bg-card"
                  />
                  <Button type="button" variant="outline" className="h-10 bg-card" disabled={typed.trim().length < 2 || mic !== "idle" || busy} onClick={() => void handleWords(typed.trim())}>
                    Go
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.label}
                  onClick={() => {
                    setLabel(p.label);
                    setAmount(String(p.amount));
                  }}
                  className={`rounded-full border px-3 py-1 text-sm ${label === p.label ? "border-ink bg-ink text-white" : "bg-card"}`}
                >
                  {p.label} £{p.amount}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wi-label">What is it?</Label>
              <Input id="wi-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="wi-amount">How much?</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
                  <Input id="wi-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="h-11 pl-7" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-date">When?</Label>
                <Input id="wi-date" type="date" min={min} max={max} value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
              </div>
            </div>
            {err && <p role="alert" className="text-sm text-tight">{err}</p>}
            <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
              {busy ? "Working it out" : "Show me"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <ForecastChart forecast={sim.forecast} ghost={forecast} height={170} shockDates={[sim.shock.date]} />
            <p className="text-[15px] leading-relaxed">
              On {longDate(sim.shock.date)} you&apos;d have{" "}
              <strong className={sim.after.on_date < 50 ? "text-tight" : ""}>{pounds(sim.after.on_date)}</strong> instead of <strong>{pounds(sim.before.on_date)}</strong>.
              {Math.round(sim.after.worst_day.balance) !== Math.round(sim.before.worst_day.balance) && (
                <>
                  {" "}Your lowest day would be <strong className="text-tight">{pounds(sim.after.worst_day.balance)}</strong> on {longDate(sim.after.worst_day.date)}.
                </>
              )}
            </p>
            {weekly > 0 ? (
              <div className="rounded-lg border-2 border-ink p-4">
                <p className="font-display text-lg font-bold">Put £{weekly} a week aside</p>
                <p className="mt-1 text-sm">
                  {sim.suggestion.weeks} weeks of £{weekly} is {pounds(sim.suggestion.total_gbp)}. That covers the {pounds(sim.shock.amount_gbp)}.
                </p>
              </div>
            ) : (
              <p className="rounded-md bg-maybe-soft px-3 py-2 text-sm">This is less than a week away, so there&apos;s no time to save for it.</p>
            )}
            {err && <p role="alert" className="text-sm text-tight">{err}</p>}
            <div className="space-y-2">
              <Button className="h-12 w-full text-base" disabled={busy} onClick={() => yes(weekly > 0)}>
                {busy ? "Saving" : weekly > 0 ? `Yes, put £${weekly} a week aside` : "Add it to my 60 days"}
              </Button>
              {weekly > 0 && (
                <Button variant="outline" className="h-11 w-full" disabled={busy} onClick={() => yes(false)}>
                  Add it without saving
                </Button>
              )}
              <Button variant="ghost" className="h-11 w-full" disabled={busy} onClick={() => setSim(null)}>
                Try something else
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
