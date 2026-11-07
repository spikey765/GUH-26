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
  { label: "Boiler repair", amount: 300 },
  { label: "Car repair", amount: 250 },
  { label: "School shoes", amount: 60 },
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
  confirm: (s: Simulation) => Promise<void>;
}) {
  const [label, setLabel] = useState("Boiler repair");
  const [amount, setAmount] = useState("300");
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

  async function yes() {
    if (!sim) return;
    setBusy(true);
    try {
      await confirm(sim);
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
            <ForecastChart forecast={sim.forecast} ghost={forecast} height={170} extraMarker={{ date: sim.shock.date, label: sim.shock.label }} />
            <p className="text-[15px] leading-relaxed">
              A {pounds(sim.shock.amount_gbp)} {sim.shock.label.toLowerCase()} on {longDate(sim.shock.date)} takes your lowest day from{" "}
              <strong>{pounds(sim.before.worst_day.balance)}</strong> to{" "}
              <strong className={sim.forecast.worst_day.balance < 50 ? "text-tight" : ""}>{pounds(sim.forecast.worst_day.balance)}</strong> on {longDate(sim.forecast.worst_day.date)}.
            </p>
            {weekly > 0 ? (
              <div className="rounded-lg border-2 border-ink p-4">
                <p className="font-display text-lg font-bold">Put £{weekly} a week aside</p>
                <p className="mt-1 text-sm">
                  Start now and keep going for {sim.suggestion.weeks} weeks. Your lowest day would be {pounds(sim.suggestion.worst_after_saving.balance)}.
                </p>
              </div>
            ) : (
              <p className="rounded-md bg-safe-soft px-3 py-2 text-sm">You would stay above £50. No need to change anything.</p>
            )}
            {err && <p role="alert" className="text-sm text-tight">{err}</p>}
            <div className="space-y-2">
              <Button className="h-12 w-full text-base" disabled={busy} onClick={yes}>
                {busy ? "Saving" : weekly > 0 ? `Yes, put £${weekly} a week aside` : "Add it to my 60 days"}
              </Button>
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
