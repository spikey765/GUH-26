"use client";

import { useRef, useState } from "react";
import { Check, FileText, Landmark, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Guess, GuessResult, Profile, ProfileField } from "@/lib/types";
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

const SURE = { high: "We're sure", medium: "We're fairly sure", low: "We're not sure" } as const;

type Guesses = Partial<Record<ProfileField, Guess>>;

function isEmpty(v: Guess["value"]) {
  return v === null || (Array.isArray(v) && v.length === 0);
}

function FieldHead({ htmlFor, label, guess, open, onToggle }: { htmlFor?: string; label: string; guess?: Guess; open: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      {htmlFor ? <Label htmlFor={htmlFor}>{label}</Label> : <p className="text-sm font-medium">{label}</p>}
      {guess && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", guess.confidence === "low" ? "bg-maybe-soft text-maybe" : "bg-mist text-ink")}
        >
          Why?
        </button>
      )}
    </div>
  );
}

function Why({ guess }: { guess: Guess }) {
  return (
    <div className="mt-2 rounded-md bg-mist px-3 py-2.5 text-sm">
      <p>
        <span className="font-semibold">{SURE[guess.confidence]}. </span>
        {guess.reason}
      </p>
      {guess.evidence.length > 0 ? (
        <>
          <p className="mt-2 text-xs text-muted-foreground">From your statement:</p>
          <ul className="mt-1 divide-y divide-ink/10 rounded bg-white">
            {guess.evidence.map((e, i) => (
              <li key={i} className="flex justify-between gap-3 px-2 py-1.5">
                <span className="min-w-0">
                  <span className="text-muted-foreground">{shortDate(e.date)} </span>
                  <span className="break-words">{e.description}</span>
                </span>
                <span className="shrink-0 tabular-nums">{pounds(e.amount_gbp, { pence: true })}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

type Answer = "yes" | "no" | "edited";

function Decide({ id, answer, onDecide, blank }: { id: string; answer?: Answer; onDecide: (a: Answer | undefined) => void; blank: boolean }) {
  if (!answer)
    return (
      <div id={id} className="mt-2 flex items-center gap-2 rounded-md bg-maybe-soft px-3 py-2">
        <span className="flex-1 text-sm font-medium">Is this right?</span>
        <Button type="button" size="sm" className="h-9 gap-1 px-4" onClick={() => onDecide("yes")}>
          <Check className="size-4" aria-hidden /> Yes
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-9 gap-1 bg-card px-4" onClick={() => onDecide("no")}>
          <X className="size-4" aria-hidden /> No
        </Button>
      </div>
    );
  return (
    <div id={id} className="mt-1.5 flex items-center gap-3 text-sm">
      {answer === "yes" && (
        <span className="inline-flex items-center gap-1 font-medium text-safe">
          <Check className="size-4" aria-hidden /> You said this is right
        </span>
      )}
      {answer === "no" && <span className="font-medium text-maybe">{blank ? "Cleared. Please fill this in." : "Changed by you"}</span>}
      {answer === "edited" && <span className="font-medium text-ink">Changed by you</span>}
      <button type="button" className="text-muted-foreground underline underline-offset-4" onClick={() => onDecide(undefined)}>
        Undo
      </button>
    </div>
  );
}

function Missing() {
  return <p className="mt-1.5 text-sm text-maybe">Not on your statement. Please fill this in.</p>;
}

function FillDialog({
  open,
  onOpenChange,
  run,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  run: (file?: File | Blob) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"account" | "statement" | null>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function go(kind: "account" | "statement", file?: File | Blob) {
    setErr(null);
    if (file && file instanceof File && file.type && file.type !== "application/pdf") {
      setErr("That isn't a PDF. Choose a PDF statement.");
      return;
    }
    setBusy(kind);
    try {
      await run(file);
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work. Try again or fill in the form yourself.");
    } finally {
      setBusy(null);
    }
  }

  async function sample() {
    setErr(null);
    setBusy("statement");
    try {
      const res = await fetch("/demo_statement.pdf");
      if (!res.ok) throw new Error("We couldn't load the sample statement.");
      const blob = await res.blob();
      await run(new File([blob], "demo_statement.pdf", { type: "application/pdf" }));
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-[400px] rounded-[22px]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold">Fill it in for me</DialogTitle>
          <DialogDescription>We guess your answers from your payments. You check them before anything is saved.</DialogDescription>
        </DialogHeader>

        {busy ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center" role="status" aria-live="polite">
            <FileText className="size-10 animate-pulse text-ink" aria-hidden />
            <p className="font-display text-lg font-bold">{busy === "statement" ? "Reading your statement..." : "Reading your payments..."}</p>
            <p className="text-sm text-muted-foreground">This takes about 10 seconds.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => go("account")}
              className="flex w-full items-start gap-3 rounded-lg border bg-card p-4 text-left hover:border-ink"
            >
              <Landmark className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span>
                <span className="block font-semibold">Use my account</span>
                <span className="block text-sm text-muted-foreground">We read the last 12 months of payments in this account.</span>
              </span>
            </button>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files?.[0];
                if (f) go("statement", f);
              }}
              className={cn("rounded-lg border-2 border-dashed p-4 transition-colors", drag ? "border-ink bg-mist" : "border-line bg-card")}
            >
              <button type="button" onClick={() => input.current?.click()} className="flex w-full items-start gap-3 text-left">
                <Upload className="mt-0.5 size-5 shrink-0" aria-hidden />
                <span>
                  <span className="block font-semibold">Upload a statement (PDF)</span>
                  <span className="block text-sm text-muted-foreground">Drag your PDF here, or tap to choose one.</span>
                </span>
              </button>
              <input
                ref={input}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                aria-label="Choose a PDF statement"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) go("statement", f);
                }}
              />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 pl-8 text-sm">
                <button type="button" onClick={sample} className="font-semibold underline underline-offset-4">
                  Try our sample statement
                </button>
                <a href="/demo_statement.pdf" target="_blank" rel="noreferrer" className="text-muted-foreground underline underline-offset-4">
                  Open it
                </a>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">We don&apos;t save your statement. We only use it to fill in this form.</p>
            {err && (
              <p role="alert" className="text-sm text-tight">
                {err}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AboutForm({
  initial,
  onSave,
  onGuess,
}: {
  initial: Profile | null;
  onSave: (p: Profile) => Promise<void>;
  onGuess: (file?: File | Blob) => Promise<GuessResult>;
}) {
  const [p, setP] = useState<Profile>(initial ?? EMPTY);
  const [kids, setKids] = useState((initial?.children_ages ?? []).join(", "));
  const [guesses, setGuesses] = useState<Guesses>({});
  const [result, setResult] = useState<Omit<GuessResult, "guesses"> | null>(null);
  const [why, setWhy] = useState<Set<ProfileField>>(new Set());
  const [chooser, setChooser] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [answer, setAnswer] = useState<Partial<Record<ProfileField, Answer>>>({});

  const guessed = Object.keys(guesses).length > 0;
  const fields = Object.keys(guesses) as ProfileField[];
  const filled = fields.filter((k) => !isEmpty(guesses[k]!.value));
  const pending = filled.filter((k) => !answer[k]);

  function set<K extends ProfileField>(k: K, v: Profile[K]) {
    setP((x) => ({ ...x, [k]: v }));
    if (guesses[k] && !isEmpty(guesses[k]!.value)) setAnswer((a) => ({ ...a, [k]: a[k] === "no" ? "no" : "edited" }));
  }

  function decide(k: ProfileField, a: Answer | undefined) {
    setAnswer((s) => ({ ...s, [k]: a }));
    if (a === "no") setP((x) => ({ ...x, [k]: Array.isArray(x[k]) ? [] : null }));
    if (a === undefined && guesses[k]) setP((x) => ({ ...x, [k]: guesses[k]!.value }));
  }

  function toggle(k: ProfileField) {
    setWhy((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  async function run(file?: File | Blob) {
    const r = await onGuess(file);
    const next = { ...p };
    (Object.keys(r.guesses) as ProfileField[]).forEach((k) => {
      const v = r.guesses[k]?.value ?? null;
      if (!isEmpty(v)) (next as Record<string, unknown>)[k] = v;
    });
    setP({ ...next, guessed_by_ai: true });
    setGuesses(r.guesses);
    setAnswer({});
    setResult({ source: r.source, input: r.input, dropped_evidence: r.dropped_evidence });
    setWhy(new Set());
    window.scrollTo({ top: 0 });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending.length) {
      setErr(`Tap Yes or No on ${pending.length} more answer${pending.length === 1 ? "" : "s"} first.`);
      document.getElementById(`decide-${pending[0]}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setErr(null);
    setSaving(true);
    const ages = kids.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n < 25);
    try {
      await onSave({ ...p, children_ages: ages });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't save. Try again.");
      setSaving(false);
    }
  }

  const head = (k: ProfileField, label: string, htmlFor?: string) => (
    <FieldHead htmlFor={htmlFor} label={label} guess={guesses[k]} open={why.has(k)} onToggle={() => toggle(k)} />
  );
  const after = (k: ProfileField, current: unknown) => {
    const g = guesses[k];
    if (!g) return null;
    const blank = current === null || current === "" || (Array.isArray(current) && current.length === 0);
    return (
      <>
        {isEmpty(g.value) ? blank && <Missing /> : <Decide id={`decide-${k}`} answer={answer[k]} onDecide={(a) => decide(k, a)} blank={blank} />}
        {why.has(k) && <Why guess={g} />}
      </>
    );
  };

  const field = "h-11 bg-card text-base";

  return (
    <form onSubmit={save} className="space-y-7 px-5 pb-28 pt-2">
      {guessed && result ? (
        <div className="rounded-lg bg-safe-soft p-4">
          <p className="font-semibold">
            We filled in {filled.length} of {Object.keys(guesses).length} answers from your {result.input === "statement" ? "statement" : "payments"}.
          </p>
          <p className="mt-1 text-sm">Tap Yes or No on each one. Tap &quot;Why?&quot; to see the payments we used.</p>
          <p className="mt-1 text-sm">Add the adults and children yourself. A statement can&apos;t show these.</p>
          {result.source === "rules" && <p className="mt-2 text-xs text-muted-foreground">Filled in by simple rules. The AI isn&apos;t set up yet.</p>}
          <button type="button" className="mt-2 text-sm underline underline-offset-4" onClick={() => setChooser(true)}>
            Try a different statement
          </button>
        </div>
      ) : (
        <div className="rounded-lg bg-ink p-4 text-white">
          <p className="font-semibold">Short on time?</p>
          <p className="mt-1 text-sm text-white/80">We can guess your answers from your account or a bank statement. You check each one.</p>
          <Button type="button" variant="secondary" className="mt-3 h-11 w-full gap-2 text-base" onClick={() => setChooser(true)}>
            <Sparkles className="size-4" aria-hidden />
            Fill it in for me
          </Button>
        </div>
      )}

      <fieldset className="space-y-5">
        <legend className="font-display text-lg font-bold">Your work</legend>
        <div>
          {head("job_type", "Job", "job")}
          <Input id="job" className={cn(field, "mt-1.5")} value={p.job_type ?? ""} onChange={(e) => set("job_type", e.target.value)} placeholder="For example, care worker" />
          {after("job_type", p.job_type)}
        </div>
        <SelectField id="contract" head={head("contract_type", "Contract", "contract")} value={p.contract_type} options={OPTIONS.contract_type} onChange={(v) => set("contract_type", v)} after={after("contract_type", p.contract_type)} />
        <SelectField id="freq" head={head("pay_frequency", "How often you're paid", "freq")} value={p.pay_frequency} options={OPTIONS.pay_frequency} onChange={(v) => set("pay_frequency", v)} after={after("pay_frequency", p.pay_frequency)} />
        <div>
          <p className="text-sm font-medium">Usual weekly pay</p>
          <div className="mt-1.5 grid grid-cols-2 gap-3">
            <div>
              {head("pay_min_gbp", "Lowest", "pmin")}
              <MoneyInput id="pmin" value={p.pay_min_gbp} onChange={(v) => set("pay_min_gbp", v)} />
            </div>
            <div>
              {head("pay_max_gbp", "Highest", "pmax")}
              <MoneyInput id="pmax" value={p.pay_max_gbp} onChange={(v) => set("pay_max_gbp", v)} />
            </div>
          </div>
          {after("pay_min_gbp", p.pay_min_gbp)}
          {after("pay_max_gbp", p.pay_max_gbp)}
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-display text-lg font-bold">Your home</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            {head("adults", "Adults", "adults")}
            <Input id="adults" inputMode="numeric" className={cn(field, "mt-1.5")} value={p.adults ?? ""} onChange={(e) => set("adults", e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null)} />
          </div>
          <div>
            {head("children_ages", "Children's ages", "kids")}
            <Input id="kids" className={cn(field, "mt-1.5")} value={kids} placeholder="e.g. 7, 11" onChange={(e) => setKids(e.target.value)} />
          </div>
        </div>
        {after("adults", p.adults)}
        <SelectField id="housing" head={head("housing", "Housing", "housing")} value={p.housing} options={OPTIONS.housing} onChange={(v) => set("housing", v)} after={after("housing", p.housing)} />
        <div>
          {head("area", "Town or city", "area")}
          <Input id="area" className={cn(field, "mt-1.5")} value={p.area ?? ""} onChange={(e) => set("area", e.target.value)} />
          {after("area", p.area)}
        </div>
        <SelectField id="energy" head={head("energy_payment", "How you pay for energy", "energy")} value={p.energy_payment} options={OPTIONS.energy_payment} onChange={(v) => set("energy_payment", v)} after={after("energy_payment", p.energy_payment)} />
      </fieldset>

      <fieldset>
        <legend className="sr-only">Benefits</legend>
        {head("benefits", "Benefits")}
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
        {after("benefits", p.benefits)}
      </fieldset>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[440px] border-t bg-background/95 px-5 py-3 backdrop-blur sm:bottom-6 sm:rounded-b-[28px]">
        {err && <p role="alert" className="mb-2 text-sm text-tight">{err}</p>}
        <Button type="submit" className="h-12 w-full text-base" disabled={saving}>
          {saving ? "Saving" : pending.length ? `Check ${pending.length} more` : guessed ? "Looks right" : "Save and see my 60 days"}
        </Button>
      </div>

      <FillDialog open={chooser} onOpenChange={setChooser} run={run} />
    </form>
  );
}

function SelectField({
  id,
  head,
  value,
  options,
  onChange,
  after,
}: {
  id: string;
  head: React.ReactNode;
  value: string | null;
  options: string[];
  onChange: (v: string) => void;
  after: React.ReactNode;
}) {
  return (
    <div>
      {head}
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
      {after}
    </div>
  );
}

function MoneyInput({ id, value, onChange }: { id: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="relative mt-1.5">
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
  );
}
