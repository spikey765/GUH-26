"use client";

import { useState } from "react";
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

export function WhatIf({
  open,
  onOpenChange,
  forecast,
  simulate,
  confirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  forecast: Forecast;
  simulate: (b: { amount_gbp: number; date: string; label: string }) => Promise<Simulation>;
  confirm: (s: Simulation, withSaving: boolean) => Promise<void>;
}) {
  const [label, setLabel] = useState(PRESETS[0].label);
  const [amount, setAmount] = useState(String(PRESETS[0].amount));
  const [date, setDate] = useState(addDays(forecast.today, 33));
  const [sim, setSim] = useState<Simulation | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const min = forecast.today;
  const max = forecast.days[forecast.days.length - 1].date;

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const n = Number(amount);
    if (!n || n <= 0) return setErr("Enter how much it would cost.");
    setBusy(true);
    try {
      setSim(await simulate({ amount_gbp: n, date, label: label.trim() || "Unexpected cost" }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
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
