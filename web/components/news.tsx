"use client";

import { Calculator, ChartLine, Clock, ExternalLink, Flame, Gift, HandHeart, Landmark, Lightbulb, MapPin, School, TrendingUp, Zap } from "lucide-react";
import { Carousel } from "@/components/carousel";
import type { NewsItem } from "@/lib/types";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const KINDS = {
  advice: { text: "Government advice", icon: Landmark, band: "bg-primary text-white", tile: "from-primary/20 to-primary/5 text-primary" },
  forecast: { text: "Money forecast", icon: TrendingUp, band: "bg-maybe text-white", tile: "from-maybe/25 to-maybe/5 text-maybe" },
  help: { text: "Help near you", icon: HandHeart, band: "bg-safe text-white", tile: "from-safe/25 to-safe/5 text-safe" },
  tip: { text: "Money tip", icon: Lightbulb, band: "bg-mist text-ink", tile: "from-ink/15 to-ink/5 text-ink" },
} as const;

const PICTURES = { school: School, zap: Zap, flame: Flame, chart: ChartLine, map: MapPin, clock: Clock, gift: Gift, calculator: Calculator };

function Picture({ n }: { n: NewsItem }) {
  const Icon = PICTURES[n.picture] ?? Lightbulb;
  return (
    <div aria-hidden className={cn("relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br", KINDS[n.kind].tile)}>
      <span className="absolute -right-3 -top-3 size-9 rounded-full bg-current opacity-10" />
      <span className="absolute -bottom-4 -left-2 size-10 rounded-full bg-current opacity-10" />
      <Icon className="relative size-7" strokeWidth={1.75} />
    </div>
  );
}

const SOURCES: Record<string, { mono: string; bg: string; fg: string; type: string }> = {
  "GOV.UK": { mono: "GOV", bg: "#0b0c0c", fg: "#ffffff", type: "Government" },
  Ofgem: { mono: "Of", bg: "#5a2d82", fg: "#ffffff", type: "Energy regulator" },
  "Bank of England": { mono: "BoE", bg: "#8c1c2c", fg: "#ffffff", type: "Central bank" },
  "Manchester City Council": { mono: "MCC", bg: "#1d4f91", fg: "#ffffff", type: "Your council" },
  MoneyHelper: { mono: "MH", bg: "#00788a", fg: "#ffffff", type: "Free money guidance" },
  "Citizens Advice": { mono: "CA", bg: "#004b88", fg: "#ffd200", type: "Free advice charity" },
  "The Guardian": { mono: "G", bg: "#052962", fg: "#ffffff", type: "Newspaper" },
  "BBC News": { mono: "BBC", bg: "#b80000", fg: "#ffffff", type: "News" },
  Ofwat: { mono: "Ow", bg: "#005a9c", fg: "#ffffff", type: "Water regulator" },
  Ofcom: { mono: "Oc", bg: "#2b2b6e", fg: "#ffffff", type: "Phone regulator" },
};

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function SourceBadge({ n }: { n: NewsItem }) {
  const s = SOURCES[n.source_name] ?? {
    mono: n.source_name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase(),
    bg: "var(--ink)",
    fg: "#ffffff",
    type: "Source",
  };
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span
        aria-hidden
        className="grid h-6 min-w-6 place-items-center rounded-md px-1 text-[10px] font-extrabold leading-none tracking-tight"
        style={{ background: s.bg, color: s.fg }}
      >
        {s.mono}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold">{n.source_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {s.type} · {host(n.source_url)}
        </p>
      </div>
    </div>
  );
}

function NewsCard({ n }: { n: NewsItem }) {
  const k = KINDS[n.kind];
  const Icon = k.icon;
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className={cn("flex items-center gap-2 px-4 py-2.5", k.band)}>
        <Icon className="size-5 shrink-0" aria-hidden />
        <p className="text-sm font-extrabold uppercase tracking-wider">{k.text}</p>
        <p className="ml-auto text-xs font-medium opacity-90">{shortDate(n.date)}</p>
      </div>
      <div className="flex-1 px-4 py-4">
        <div className="flex items-start gap-3">
          <Picture n={n} />
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-tight">{n.title}</h3>
            <SourceBadge n={n} />
          </div>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed">{n.summary}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-semibold text-ink">Why you&apos;re seeing this:</span> {n.why}
        </p>
      </div>
      <div className="border-t px-4 py-3">
        <a
          href={n.source_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/15"
        >
          <span className="truncate">Read it on {n.source_name}</span>
          <ExternalLink className="size-3.5 shrink-0" aria-hidden />
        </a>
      </div>
    </article>
  );
}

export function NewsCarousel({ news, paused }: { news: NewsItem[]; paused?: boolean }) {
  if (!news.length) return <p className="px-5 text-sm text-muted-foreground">No news that matches you right now.</p>;
  return (
    <Carousel label="Other news for you" paused={paused} interval={7000}>
      {news.map((n) => (
        <NewsCard key={n.id} n={n} />
      ))}
    </Carousel>
  );
}
