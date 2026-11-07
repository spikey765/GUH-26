"use client";

import { useId, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import type { Forecast, Warning } from "@/lib/types";
import { longDate, pounds, shortDate } from "@/lib/format";

function niceScale(min: number, max: number) {
  const span = Math.max(1, max - min);
  const step = [50, 100, 200, 250, 500, 1000].find((s) => span / s <= 5) ?? 1000;
  const lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (hi - max < step * 0.3) hi += step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return { lo, hi, ticks };
}

type Label = Warning["label"];

type Marker = { date: string; id: string; title: string; label: Label };

const LABEL_COLOUR: Record<Label, string> = { confirmed: "var(--confirmed)", likely: "var(--likely)", forecast: "var(--forecast)" };

type PinProps = {
  cx?: number;
  cy?: number;
  title: string;
  label: Label;
  active: boolean;
  hovered: boolean;
  picked: boolean;
  faded: boolean;
  onClick?: () => void;
  onHover: (on: boolean) => void;
};

function Pin({ cx = 0, cy = 0, title, label, active, hovered, picked, faded, onClick, onHover }: PinProps) {
  const filled = active || hovered || picked;
  const colour = picked ? LABEL_COLOUR[label] : "var(--ink)";
  return (
    <g
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{ cursor: onClick ? "pointer" : "default", opacity: faded && !hovered ? 0.25 : 1, transition: "opacity 180ms ease" }}
      role={onClick ? "button" : undefined}
      aria-label={title}
    >
      <circle cx={cx} cy={cy} r={16} fill="transparent" />
      <circle
        cx={cx}
        cy={cy}
        r={hovered ? 10 : picked ? 7.5 : active ? 6 : 4.5}
        fill={filled ? colour : "#fff"}
        stroke={filled ? "#fff" : "var(--ink)"}
        strokeWidth={filled ? 2.5 : 2}
        style={{ transition: "r 180ms ease, fill 180ms ease" }}
      />
    </g>
  );
}

function ChartTip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { date: string; balance: number; band: [number, number]; items: { label: string; gbp: number }[] };
  return (
    <div className="max-w-[220px] rounded-md border bg-card px-3 py-2 text-sm shadow-sm">
      <p className="font-semibold">{longDate(p.date)}</p>
      <p className={p.balance < 50 ? "text-tight" : "text-safe"}>{pounds(p.balance)} expected</p>
      <p className="text-xs text-muted-foreground">
        Between {pounds(p.band[0])} and {pounds(p.band[1])}
      </p>
      {p.items.length > 0 && (
        <ul className="mt-1 border-t pt-1 text-xs">
          {p.items.slice(0, 4).map((i, n) => (
            <li key={n} className="flex justify-between gap-3">
              <span className="truncate">{i.label}</span>
              <span>{i.gbp > 0 ? "+" : ""}{pounds(i.gbp)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ForecastChart({
  forecast,
  ghost,
  warnings = [],
  extraMarker,
  height = 230,
  onMarker,
  onMarkerHover,
  activeId,
  highlight = null,
}: {
  forecast: Forecast;
  ghost?: Forecast;
  warnings?: Warning[];
  extraMarker?: { date: string; label: string };
  height?: number;
  onMarker?: (id: string) => void;
  onMarkerHover?: (id: string | null) => void;
  activeId?: string | null;
  highlight?: Label | null;
}) {
  const gid = useId().replace(/:/g, "");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const threshold = forecast.tight_threshold_gbp;
  const data = useMemo(
    () =>
      forecast.days.map((d, i) => ({
        date: d.date,
        balance: d.balance,
        band: [d.low, d.high] as [number, number],
        ghost: ghost?.days[i]?.balance,
        items: d.items,
      })),
    [forecast, ghost],
  );

  const values = data.flatMap((d) => [d.balance, d.ghost ?? d.balance]);
  const { lo: yMin, hi: yMax, ticks: yTicks } = niceScale(Math.min(...values, 0), Math.max(...values, threshold));
  const balances = data.map((d) => d.balance);
  const bMax = Math.max(...balances);
  const bMin = Math.min(...balances);
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const split = bMax === bMin ? (bMax >= threshold ? 1 : 0) : clamp((bMax - threshold) / (bMax - bMin));

  const markers: Marker[] = warnings
    .filter((w) => w.in_window && !w.good_news)
    .map((w) => ({ date: w.effective_date, id: w.id, title: w.title, label: w.label }));
  const hover = (id: string | null) => {
    setHoverId(id);
    onMarkerHover?.(id);
  };
  const byDate = new Map(data.map((d) => [d.date, d.balance]));
  const ticks = data.filter((_, i) => i % 14 === 0).map((d) => d.date);

  return (
    <div style={{ height }} className="w-full" role="img" aria-label={`Balance for the next 60 days. Lowest is ${pounds(forecast.worst_day.balance)} on ${longDate(forecast.worst_day.date)}.`}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`stroke-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={split} stopColor="var(--safe)" />
              <stop offset={split} stopColor="var(--tight)" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeOpacity={0.7} />
          <XAxis dataKey="date" ticks={ticks} tickFormatter={shortDate} tick={{ fontSize: 11, fill: "#56627a" }} axisLine={false} tickLine={false} tickMargin={6} />
          <YAxis
            domain={[yMin, yMax]}
            ticks={yTicks}
            tickFormatter={(v: number) => pounds(v)}
            tick={{ fontSize: 11, fill: "#56627a" }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <ReferenceLine y={0} stroke="#56627a" strokeOpacity={0.5} />
          <ReferenceLine y={threshold} stroke="var(--tight)" strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: "£50 safety line", position: "insideBottomRight", fontSize: 10, fill: "var(--tight)" }} />
          {ghost && <Line dataKey="ghost" stroke="#8a94a8" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} activeDot={false} />}
          <Line
            dataKey="balance"
            type="monotone"
            stroke={`url(#stroke-${gid})`}
            strokeWidth={2.5}
            strokeLinecap="round"
            dot={false}
            animationDuration={500}
            activeDot={{ r: 4, stroke: "#56627a", strokeWidth: 1.5, fill: "#fff" }}
          />
          {markers.map((m) => (
            <ReferenceDot
              key={m.id}
              x={m.date}
              y={byDate.get(m.date) ?? 0}
              r={6}
              shape={(p: { cx?: number; cy?: number }) => (
                <Pin
                  cx={p.cx}
                  cy={p.cy}
                  title={m.title}
                  label={m.label}
                  picked={highlight === m.label}
                  faded={highlight !== null && highlight !== m.label}
                  active={m.id === activeId}
                  hovered={m.id === hoverId}
                  onClick={onMarker ? () => onMarker(m.id) : undefined}
                  onHover={(on) => hover(on ? m.id : null)}
                />
              )}
            />
          ))}
          {extraMarker && byDate.has(extraMarker.date) && (
            <ReferenceDot x={extraMarker.date} y={byDate.get(extraMarker.date)!} r={7} fill="var(--tight)" stroke="#fff" strokeWidth={2} />
          )}
          <Tooltip content={<ChartTip />} cursor={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
