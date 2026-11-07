"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Guess, Profile, ProfileField } from "@/lib/types";
import { pounds, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const OPTIONS = {
  contract_type: ["Permanent", "Zero-hours", "Agency", "Fixed-term", "Self-employed"],
  pay_frequency: ["Weekly", "Fortnightly", "Four-weekly", "Monthly"],
  benefits: ["Universal Credit", "Child Benefit", "PIP", "Carer's Allowance", "Pension Credit"],
  housing: ["Private renting", "Council or housing association", "Own with a mortgage", "Living with family"],
  energy_payment: ["Direct debit", "Prepayment meter", "Pay when the bill comes"],
};

const EMPTY: Profile = {
  job_type: null,
  contract_type: null,
  pay_frequency: null,
  pay_min_gbp: null,
  pay_max_gbp: null,
  adults: null,
  children_ages: [],
  benefits: [],
  housing: null,
  area: null,
  energy_payment: null,
};

type Guesses = Partial<Record<ProfileField, Guess>>;

function Evidence({ guess, accepted, onAccept }: { guess: Guess; accepted: boolean; onAccept: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("mt-2 rounded-md px-3 py-2 text-sm", accepted ? "bg-safe-soft" : "bg-maybe-soft")}>
      <p>
        <span className="font-semibold">{accepted ? "Checked. " : "Our guess. "}</span>
        {guess.reason}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        {guess.transactions.length > 0 && (
          <button type="button" className="underline underline-offset-4" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "Hide" : "Show"} {guess.transactions.length} payment{guess.transactions.length === 1 ? "" : "s"}
          </button>
        )}
        {!accepted && (
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-ink underline underline-offset-4" onClick={onAccept}>
            <Check className="size-3.5" aria-hidden /> This is right
          </button>
        )}
      </div>
      {open && (
        <ul className="mt-2 divide-y divide-ink/10 rounded bg-white/70">
          {guess.transactions.map((t) => (
            <li key={t.id} className="flex justify-between gap-2 px-2 py-1.5">
              <span className="truncate">
                {t.merchant} <span className="text-muted-foreground">{shortDate(t.date)}</span>
              </span>
              <span className="tabular-nums">{pounds(t.amount_gbp, { pence: true })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AboutForm({
  initial,
  onSave,
  onGuess,
}: {
  initial: Profile | null;
  onSave: (p: Profile) => Promise<void>;
  onGuess: () => Promise<{ guesses: Record<ProfileField, Guess>; source: string }>;
}) {
  const [p, setP] = useState<Profile>(initial ?? EMPTY);
  const [kids, setKids] = useState((initial?.children_ages ?? []).join(", "));
  const [guesses, setGuesses] = useState<Guesses>({});
  const [accepted, setAccepted] = useState<Set<ProfileField>>(new Set());
  const [busy, setBusy] = useState<"guess" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const pending = (Object.keys(guesses) as ProfileField[]).filter((k) => !accepted.has(k));

  function set<K extends ProfileField>(k: K, v: Profile[K]) {
    setP((x) => ({ ...x, [k]: v }));
    if (guesses[k]) setAccepted((a) => new Set(a).add(k));
  }

  async function fill() {
    setErr(null);
    setBusy("guess");
    try {
      const r = await onGuess();
      const next = { ...p };
      const g: Guesses = {};
      (Object.keys(r.guesses) as ProfileField[]).forEach((k) => {
        const guess = r.guesses[k];
        g[k] = guess;
        const v = guess.value;
        const empty = v === null || (Array.isArray(v) && v.length === 0);
        if (!empty) (next as Record<string, unknown>)[k] = v;
      });
      setP({ ...next, guessed_by_ai: true });
      setKids((next.children_ages ?? []).join(", "));
      setGuesses(g);
      setAccepted(new Set());
      setSource(r.source);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "We couldn't read your payments. Fill in the form yourself.");
    } finally {
      setBusy(null);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending.length) {
      setErr(`Check ${pending.length} more answer${pending.length === 1 ? "" : "s"} first. Tap "This is right" or change it.`);
      return;
    }
    setErr(null);
    setBusy("save");
    const ages = kids.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n < 25);
    try {
      await onSave({ ...p, children_ages: ages });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't save. Try again.");
      setBusy(null);
    }
  }

  const ev = (k: ProfileField) =>
    guesses[k] ? <Evidence guess={guesses[k]!} accepted={accepted.has(k)} onAccept={() => setAccepted((a) => new Set(a).add(k))} /> : null;

  const field = "h-11 bg-card text-base";

  return (
    <form onSubmit={save} className="space-y-7 px-5 pb-28 pt-2">
      <div className="rounded-lg bg-ink p-4 text-white">
        <p className="font-semibold">Short on time?</p>
        <p className="mt-1 text-sm text-white/80">We can guess your answers from your payments. You check each one before we use it.</p>
        <Button type="button" variant="secondary" className="mt-3 h-11 w-full gap-2 text-base" onClick={fill} disabled={busy !== null}>
          <Sparkles className="size-4" aria-hidden />
          {busy === "guess" ? "Reading your payments" : "Fill it in for me"}
        </Button>
        {source === "rules" && <p className="mt-2 text-xs text-white/70">Made by simple rules, not AI. No AI key is set up yet.</p>}
      </div>

      <fieldset className="space-y-4">
        <legend className="font-display text-lg font-bold">Your work</legend>
        <div>
          <Label htmlFor="job">Job</Label>
          <Input id="job" className={cn(field, "mt-1.5")} value={p.job_type ?? ""} onChange={(e) => set("job_type", e.target.value)} placeholder="For example, care worker" />
          {ev("job_type")}
        </div>
        <SelectField id="contract" label="Contract" value={p.contract_type} options={OPTIONS.contract_type} onChange={(v) => set("contract_type", v)} evidence={ev("contract_type")} />
        <SelectField id="freq" label="How often you're paid" value={p.pay_frequency} options={OPTIONS.pay_frequency} onChange={(v) => set("pay_frequency", v)} evidence={ev("pay_frequency")} />
        <div>
          <p className="text-sm font-medium">Usual weekly pay</p>
          <div className="mt-1.5 grid grid-cols-2 gap-3">
            <MoneyInput id="pmin" label="Lowest" value={p.pay_min_gbp} onChange={(v) => set("pay_min_gbp", v)} />
            <MoneyInput id="pmax" label="Highest" value={p.pay_max_gbp} onChange={(v) => set("pay_max_gbp", v)} />
          </div>
          {ev("pay_min_gbp")}
          {ev("pay_max_gbp")}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display text-lg font-bold">Your home</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="adults">Adults</Label>
            <Input id="adults" inputMode="numeric" className={cn(field, "mt-1.5")} value={p.adults ?? ""} onChange={(e) => set("adults", e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null)} />
          </div>
          <div>
            <Label htmlFor="kids">Children&apos;s ages</Label>
            <Input
              id="kids"
              className={cn(field, "mt-1.5")}
              value={kids}
              placeholder="e.g. 7, 11"
              onChange={(e) => {
                setKids(e.target.value);
                if (guesses.children_ages) setAccepted((a) => new Set(a).add("children_ages"));
              }}
            />
          </div>
        </div>
        {ev("adults")}
        {ev("children_ages")}
        <SelectField id="housing" label="Housing" value={p.housing} options={OPTIONS.housing} onChange={(v) => set("housing", v)} evidence={ev("housing")} />
        <div>
          <Label htmlFor="area">Town or city</Label>
          <Input id="area" className={cn(field, "mt-1.5")} value={p.area ?? ""} onChange={(e) => set("area", e.target.value)} />
          {ev("area")}
        </div>
        <SelectField id="energy" label="How you pay for energy" value={p.energy_payment} options={OPTIONS.energy_payment} onChange={(v) => set("energy_payment", v)} evidence={ev("energy_payment")} />
      </fieldset>

      <fieldset>
        <legend className="font-display text-lg font-bold">Benefits</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {OPTIONS.benefits.map((b) => {
            const on = p.benefits.includes(b);
            return (
              <button
                type="button"
                key={b}
                aria-pressed={on}
                onClick={() => set("benefits", on ? p.benefits.filter((x) => x !== b) : [...p.benefits, b])}
                className={cn("rounded-full border px-3.5 py-2 text-sm", on ? "border-ink bg-ink text-white" : "bg-card")}
              >
                {b}
              </button>
            );
          })}
        </div>
        {ev("benefits")}
      </fieldset>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[440px] glass border-t border-white/60 px-5 py-3 shadow-[0_-8px_24px_-16px_rgba(20,33,61,0.25)] sm:bottom-6 sm:rounded-b-[28px]">
        {err && <p role="alert" className="mb-2 text-sm text-tight">{err}</p>}
        <Button type="submit" className="h-12 w-full text-base" disabled={busy !== null}>
          {busy === "save" ? "Saving" : pending.length ? `Check ${pending.length} more` : "Save and see my 60 days"}
        </Button>
      </div>
    </form>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  evidence,
}: {
  id: string;
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string) => void;
  evidence: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className="mt-1.5 h-11 w-full bg-card text-base">
          <SelectValue placeholder="Choose one" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {evidence}
    </div>
  );
}

function MoneyInput({ id, label, value, onChange }: { id: string; label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
        <Input
          id={id}
          inputMode="decimal"
          className="h-11 bg-card pl-7 text-base"
          value={value ?? ""}
          onChange={(e) => {
            const s = e.target.value.replace(/[^\d.]/g, "");
            onChange(s ? Number(s) : null);
          }}
        />
      </div>
    </div>
  );
}
