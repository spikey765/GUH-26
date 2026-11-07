"use client";

import { useCallback } from "react";
import { BadgeCheck, Check, ChevronRight, ExternalLink, History, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Carousel } from "@/components/carousel";
import type { Warning } from "@/lib/types";
import { dayNum, longDate, monthShort, pounds, shortDate, whenText } from "@/lib/format";
import { cn } from "@/lib/utils";

const LABELS = {
  confirmed: { text: "Confirmed", short: "Officially announced", help: "The company or regulator has announced it.", icon: BadgeCheck, band: "bg-confirmed text-white" },
  likely: { text: "Likely", short: "Based on past years", help: "Based on what happened in past years.", icon: History, band: "bg-likely text-ink" },
  forecast: { text: "Forecast", short: "An expert's estimate", help: "A named expert's estimate. It could change.", icon: TrendingUp, band: "bg-forecast text-white" },
} as const;

export function StatusBand({ label, className, children }: { label: Warning["label"]; className?: string; children?: React.ReactNode }) {
  const l = LABELS[label];
  const Icon = l.icon;
  return (
    <div className={cn("flex items-center gap-2 px-4 py-2.5", l.band, className)}>
      <Icon className="size-5 shrink-0" aria-hidden />
      <p className="text-sm font-extrabold uppercase tracking-wider">{l.text}</p>
      <p className="ml-auto text-xs font-medium opacity-90">{l.short}</p>
      {children}
    </div>
  );
}

function inTight(w: Warning, tight: { start: string; end: string }[]) {
  const s = w.effective_date;
  const e = w.end_date ?? w.effective_date;
  return tight.some((t) => s <= t.end && e >= t.start);
}

function SourceLink({ w }: { w: Warning }) {
  if (!w.source_url)
    return (
      <p className="min-w-0 text-sm text-muted-foreground">
        <span className="font-semibold text-ink">Based on your payments.</span> {w.source_name}
      </p>
    );
  return (
    <a
      href={w.source_url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/15"
    >
      <span className="truncate">Read the source: {w.source_name}</span>
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
    </a>
  );
}

function WarningCard({ w, hot, onOpen }: { w: Warning; hot: boolean; onOpen: () => void }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <StatusBand label={w.label} />
      <button onClick={onOpen} className="flex flex-1 items-start gap-4 px-4 py-4 text-left transition-colors hover:bg-mist/50">
        <div className={cn("flex w-14 shrink-0 flex-col items-center rounded-md py-2", hot ? "bg-tight text-white" : "bg-mist text-ink")}>
          <span className="font-display text-2xl font-bold leading-none">{dayNum(w.effective_date)}</span>
          <span className="text-xs">{monthShort(w.effective_date)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold leading-tight">{w.title}</p>
          <p className={cn("mt-1 font-semibold", w.good_news ? "text-safe" : hot ? "text-tight" : "text-ink")}>{w.headline || whenText(w.days_away)}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{whenText(w.days_away)}</p>
          {w.confirmed && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-safe">
              <Check className="size-4" aria-hidden /> You said yes
            </p>
          )}
        </div>
      </button>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
        <SourceLink w={w} />
        <button onClick={onOpen} className="inline-flex shrink-0 items-center text-sm font-semibold text-ink underline-offset-4 hover:underline">
          Details <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </article>
  );
}

export function WarningCarousel({
  label,
  warnings,
  tight,
  onOpen,
  paused,
  interval,
  onActive,
  focusId,
}: {
  label: string;
  warnings: Warning[];
  tight: { start: string; end: string }[];
  onOpen: (id: string) => void;
  paused?: boolean;
  interval?: number;
  onActive?: (id: string) => void;
  focusId?: string | null;
}) {
  const report = useCallback((i: number) => warnings[i] && onActive?.(warnings[i].id), [warnings, onActive]);
  if (!warnings.length) return <p className="px-5 text-sm text-muted-foreground">Nothing coming up that matches you.</p>;
  return (
    <Carousel label={label} paused={paused} interval={interval} onIndexChange={onActive ? report : undefined} focus={focusId ? warnings.findIndex((w) => w.id === focusId) : null}>
      {warnings.map((w) => (
        <WarningCard key={w.id} w={w} hot={w.in_window && !w.good_news && inTight(w, tight)} onOpen={() => onOpen(w.id)} />
      ))}
    </Carousel>
  );
}

function yesText(w: Warning) {
  const s = w.suggestion;
  if (s.type === "weekly_save") return `Yes, put £${s.weekly_gbp} a week aside`;
  if (s.saves_gbp) return "Yes, I'll do this";
  return "Yes, remind me";
}

export function WarningSheet({
  warning,
  open,
  busy,
  onOpenChange,
  onAnswer,
}: {
  warning: Warning | null;
  open: boolean;
  busy: boolean;
  onOpenChange: (o: boolean) => void;
  onAnswer: (id: string, yes: boolean) => void;
}) {
  const w = warning;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="mx-auto max-h-[92dvh] max-w-[440px] overflow-y-auto rounded-t-[22px] p-0 no-scrollbar">
        {w && (
          <>
            <StatusBand label={w.label} className="sticky top-0 z-10 py-3 pl-5 pr-3">
              <SheetClose
                aria-label="Close"
                className="ml-2 grid size-8 shrink-0 place-items-center rounded-full bg-black/10 transition-colors hover:bg-black/20 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <X className="size-4" aria-hidden />
              </SheetClose>
            </StatusBand>
            <SheetHeader className="border-b px-5 pb-4 pt-4">
              <span className="text-sm text-muted-foreground">{whenText(w.days_away)}</span>
              <SheetTitle className="font-display text-2xl font-bold">{w.title}</SheetTitle>
              <SheetDescription className={cn("text-base", w.good_news ? "text-safe" : "text-ink")}>{w.headline}</SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-5 py-5 text-[15px] leading-relaxed">
              <section>
                <h3 className="mb-1 text-sm font-semibold text-muted-foreground">What changes</h3>
                <p>{w.explain}</p>
              </section>

              <section className="grid grid-cols-2 gap-3">
                <div className="rounded-md bg-mist px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">When</p>
                  <p className="font-semibold">
                    {w.end_date ? `${shortDate(w.effective_date)} to ${shortDate(w.end_date)}` : longDate(w.effective_date)}
                  </p>
                </div>
                <div className={cn("rounded-md px-3 py-2.5", w.good_news ? "bg-safe-soft" : "bg-tight-soft")}>
                  <p className="text-xs text-muted-foreground">{w.good_news ? "Extra for you" : "Cost to you"}</p>
                  <p className="font-semibold">
                    {w.cost.total_gbp != null ? pounds(w.cost.total_gbp) : w.cost.monthly_gbp != null ? `${pounds(w.cost.monthly_gbp, { pence: w.cost.monthly_gbp < 10 })} a month` : "Unknown"}
                  </p>
                  {w.cost.detail && <p className="text-xs text-muted-foreground">{w.cost.detail}</p>}
                </div>
              </section>

              <section>
                <h3 className="mb-1 text-sm font-semibold text-muted-foreground">Where this comes from</h3>
                <p className="mb-1">{LABELS[w.label].help}</p>
                <SourceLink w={w} />
              </section>

              {w.matched_transactions.length > 0 && (
                <section>
                  <h3 className="mb-1 text-sm font-semibold text-muted-foreground">Why this applies to you</h3>
                  <ul className="divide-y rounded-md border text-sm">
                    {w.matched_transactions.map((t) => (
                      <li key={t.id} className="flex justify-between gap-3 px-3 py-2">
                        <span>
                          {t.merchant} <span className="text-muted-foreground">{shortDate(t.date)}</span>
                        </span>
                        <span className="tabular-nums">{pounds(t.amount_gbp, { pence: true })}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {w.history.length > 0 && (
                <section>
                  <h3 className="mb-1 text-sm font-semibold text-muted-foreground">Past changes</h3>
                  <ul className="space-y-1 text-sm">
                    {w.history.map((h) => (
                      <li key={h.date + h.change} className="flex gap-3">
                        <span className="w-16 shrink-0 text-muted-foreground">{shortDate(h.date)} {h.date.slice(2, 4)}</span>
                        <span>{h.change}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="rounded-lg border-2 border-ink p-4">
                <h3 className="font-display text-lg font-bold">{w.suggestion.title}</h3>
                <p className="mt-1">{w.suggestion.text}</p>
                {w.suggestion.type === "weekly_save" && w.suggestion.weeks && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    £{w.suggestion.weekly_gbp} for {w.suggestion.weeks} weeks covers {pounds(w.suggestion.target_gbp ?? 0)}.
                  </p>
                )}
                {w.suggestion.saves_gbp != null && w.suggestion.saves_gbp > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">This could save you about {pounds(w.suggestion.saves_gbp)}.</p>
                )}
                {w.suggestion.link && (
                  <a href={w.suggestion.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4">
                    Open the page <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
                {w.suggestion.type !== "info" && (
                  <div className="mt-4 space-y-2">
                    {w.confirmed ? (
                      <>
                        <p className="flex items-center gap-2 font-medium text-safe">
                          <Check className="size-4" aria-hidden /> You said yes. Your 60 days include this.
                        </p>
                        <Button variant="outline" className="h-11 w-full" disabled={busy} onClick={() => onAnswer(w.id, false)}>
                          Change my mind
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button className="h-12 w-full text-base" disabled={busy} onClick={() => onAnswer(w.id, true)}>
                          {busy ? "Saving" : yesText(w)}
                        </Button>
                        <Button variant="ghost" className="h-11 w-full" disabled={busy} onClick={() => onOpenChange(false)}>
                          Not now
                        </Button>
                        <p className="text-center text-xs text-muted-foreground">Nothing happens unless you say yes.</p>
                      </>
                    )}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
