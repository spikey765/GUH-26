"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Carousel({
  label,
  children,
  interval = 6000,
  paused = false,
  autoplay = true,
  onIndexChange,
  focus,
}: {
  label: string;
  children: React.ReactNode;
  interval?: number;
  paused?: boolean;
  autoplay?: boolean;
  onIndexChange?: (i: number) => void;
  focus?: number | null;
}) {
  const items = Children.toArray(children);
  const n = items.length;
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const stopped = !autoplay;
  const [hover, setHover] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const resume = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = useCallback(() => {
    const el = track.current;
    if (!el || el.children.length < 2) return el?.clientWidth || 1;
    return (el.children[1] as HTMLElement).offsetLeft - (el.children[0] as HTMLElement).offsetLeft;
  }, []);

  const go = useCallback(
    (k: number) => {
      const el = track.current;
      if (!el || !n) return;
      const t = ((k % n) + n) % n;
      el.scrollTo({ left: t * step(), behavior: reduced ? "auto" : "smooth" });
    },
    [n, step, reduced],
  );

  const hold = useCallback(() => {
    setHover(true);
    if (resume.current) clearTimeout(resume.current);
    resume.current = setTimeout(() => setHover(false), 10000);
  }, []);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const el = track.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.6 });
    io.observe(el);
    return () => {
      io.disconnect();
      if (resume.current) clearTimeout(resume.current);
    };
  }, []);

  useEffect(() => {
    onIndexChange?.(Math.min(index, n - 1));
  }, [index, n, onIndexChange]);

  useEffect(() => {
    if (focus != null && focus >= 0) go(focus);
  }, [focus, go]);

  const running = n > 1 && !stopped && !hover && !paused && visible && !reduced;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => go(index + 1), interval);
    return () => clearInterval(id);
  }, [running, index, interval, go]);

  if (!n) return null;

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocusCapture={hold} onPointerDown={hold}>
      <div
        ref={track}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / step()))}
        className="relative flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 no-scrollbar"
      >
        {items.map((c, i) => (
          <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${n}`} className="w-[calc(100%-44px)] shrink-0 snap-start">
            {c}
          </div>
        ))}
      </div>
      {n > 1 && (
        <div className="mt-3 flex items-center gap-2 px-5">
          <button type="button" aria-label="Previous" onClick={() => go(index - 1)} className="grid size-8 place-items-center rounded-full border bg-card text-ink hover:bg-mist">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <div className="flex flex-1 justify-center gap-1.5">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={cn("h-2 rounded-full transition-all", i === index ? "w-6 bg-primary" : "w-2 bg-line hover:bg-primary/40")}
              />
            ))}
          </div>
          <button type="button" aria-label="Next" onClick={() => go(index + 1)} className="grid size-8 place-items-center rounded-full border bg-card text-ink hover:bg-mist">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
