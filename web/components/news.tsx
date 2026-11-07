"use client";

import { ExternalLink, HandHeart, Landmark, Lightbulb, TrendingUp } from "lucide-react";
import { Carousel } from "@/components/carousel";
import type { NewsItem } from "@/lib/types";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const KINDS = {
  advice: { text: "Government advice", icon: Landmark, band: "bg-primary text-white" },
  forecast: { text: "Money forecast", icon: TrendingUp, band: "bg-maybe text-white" },
  help: { text: "Help near you", icon: HandHeart, band: "bg-safe text-white" },
  tip: { text: "Money tip", icon: Lightbulb, band: "bg-mist text-ink" },
} as const;

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
        <h3 className="text-lg font-bold leading-tight">{n.title}</h3>
        <p className="mt-1.5 text-[15px] leading-relaxed">{n.summary}</p>
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
