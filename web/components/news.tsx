"use client";

import { useState } from "react";
import { Calculator, ChartLine, Clock, ExternalLink, Flame, Gift, HandHeart, Landmark, Lightbulb, Loader2, MapPin, School, Square, TrendingUp, Volume2, Zap } from "lucide-react";
import { stopAudio } from "@/lib/voice";
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

type Say = (n: NewsItem) => Promise<{ text: string; play: () => Promise<void> }>;

function NewsCard({ n, say }: { n: NewsItem; say?: Say }) {
  const k = KINDS[n.kind];
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [imgOk, setImgOk] = useState(true);

  async function listen() {
    if (!say) return;
    if (state === "playing") {
      stopAudio();
      setState("idle");
      return;
    }
    setErr(null);
    setState("loading");
    try {
      const [r] = await Promise.all([say(n), new Promise((ok) => setTimeout(ok, 800))]);
      setText(r.text);
      setState("playing");
      await r.play();
      setState("idle");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't play. Try again.");
      setState("idle");
    }
  }

  return (
    <article
      data-fit={n.fit}
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border border-black/10 bg-card transition-opacity",
        n.fit === "yours" && "border-2 border-safe bg-safe-soft",
        n.fit === "not_you" && "opacity-55 [&_img]:grayscale",
      )}
    >
      {n.image && imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={n.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} className="aspect-[2/1] w-full object-cover" />
      ) : (
        <div className={cn("grid aspect-[2/1] w-full place-items-center bg-gradient-to-br", k.tile)}>
          <Picture n={n} />
        </div>
      )}
      <div className="flex-1 px-4 pt-3">
        <p className="text-xs font-medium text-muted-foreground">
          {n.source_name}, {shortDate(n.date)}
        </p>
        <h3 className="mt-0.5 text-lg font-bold leading-tight">{n.title}</h3>
        {state === "loading" ? (
          <div className="mt-3 space-y-2" role="status" aria-label="Reading the page">
            <div className="h-3.5 w-full animate-pulse rounded bg-mist" />
            <div className="h-3.5 w-11/12 animate-pulse rounded bg-mist [animation-delay:120ms]" />
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-mist [animation-delay:240ms]" />
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-mist [animation-delay:360ms]" />
          </div>
        ) : (
          <p className="mt-2 text-[15px] leading-relaxed">{text ?? n.summary}</p>
        )}
        {err && <p role="alert" className="mt-1 text-sm text-tight">{err}</p>}
      </div>
      <div className="flex items-center gap-2 px-4 py-3">
        {say && (
          <button
            type="button"
            onClick={listen}
            disabled={state === "loading"}
            aria-label={state === "playing" ? "Stop" : `Listen to ${n.title}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-70"
          >
            {state === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : state === "playing" ? <Square className="size-3.5" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
            {state === "loading" ? "Reading" : state === "playing" ? "Stop" : "Listen"}
          </button>
        )}
        <a href={n.source_url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-ink">
          Read more <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
    </article>
  );
}

export function NewsCarousel({ news, paused, say }: { news: NewsItem[]; paused?: boolean; say?: Say }) {
  if (!news.length) return <p className="px-5 text-sm text-muted-foreground">No news that matches you right now.</p>;
  return (
    <Carousel label="News for you" paused={paused} autoplay={false} interval={7000}>
      {news.map((n) => (
        <NewsCard key={n.id} n={n} say={say} />
      ))}
    </Carousel>
  );
}
