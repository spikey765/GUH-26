"use client";

import { useId, useMemo } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
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

type Marker = { date: string; id: string; title: string };

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
}: {
  forecast: Forecast;
  ghost?: Forecast;
  warnings?: Warning[];
  extraMarker?: { date: string; label: string };
  height?: number;
  onMarker?: (id: string) => void;
}) {
  const gid = useId().replace(/:/g, "");
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

  const values = data.flatMap((d) => [d.band[0], d.band[1], d.ghost ?? d.balance]);
  const yMax = Math.max(...values, threshold) + 60;
  const yMin = Math.min(...values, 0) - 40;
  const balances = data.map((d) => d.balance);
  const bMax = Math.max(...balances);
  const bMin = Math.min(...balances);
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const split = bMax === bMin ? (bMax >= threshold ? 1 : 0) : clamp((bMax - threshold) / (bMax - bMin));
  const fillSplit = clamp((bMax - threshold) / (bMax - yMin));

  const markers: Marker[] = warnings
    .filter((w) => w.in_window && !w.good_news)
    .map((w) => ({ date: w.effective_date, id: w.id, title: w.title }));
  const byDate = new Map(data.map((d) => [d.date, d.balance]));
  const ticks = data.filter((_, i) => i % 14 === 0).map((d) => d.date);

  return (
    <div style={{ height }} className="w-full" role="img" aria-label={`Balance for the next 60 days. Lowest is ${pounds(forecast.worst_day.balance)} on ${longDate(forecast.worst_day.date)}.`}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`stroke-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={split} stopColor="var(--safe)" />
              <stop offset={split} stopColor="var(--tight)" />
            </linearGradient>
            <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="var(--safe)" stopOpacity={0.22} />
              <stop offset={fillSplit} stopColor="var(--safe)" stopOpacity={0.08} />
              <stop offset={fillSplit} stopColor="var(--tight)" stopOpacity={0.18} />
              <stop offset={1} stopColor="var(--tight)" stopOpacity={0.32} />
            </linearGradient>
          </defs>
          {forecast.tight_weeks.map((t) => (
            <ReferenceArea key={t.start} x1={t.start} x2={t.end} fill="var(--tight)" fillOpacity={0.07} strokeOpacity={0} ifOverflow="hidden" />
          ))}
          <XAxis dataKey="date" ticks={ticks} tickFormatter={shortDate} tick={{ fontSize: 12, fill: "#56627a" }} axisLine={false} tickLine={false} />
          <YAxis domain={[yMin, yMax]} hide />
          <ReferenceLine y={threshold} stroke="var(--tight)" strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "£50", position: "insideTopLeft", fontSize: 11, fill: "var(--tight)" }} />
          <ReferenceLine y={0} stroke="var(--line)" />
          <Area dataKey="band" stroke="none" fill="var(--ink)" fillOpacity={0.06} isAnimationActive={false} activeDot={false} />
          {ghost && <Line dataKey="ghost" stroke="#8a94a8" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} activeDot={false} />}
          <Area
            dataKey="balance"
            type="monotone"
            stroke={`url(#stroke-${gid})`}
            strokeWidth={3}
            fill={`url(#fill-${gid})`}
            baseValue={yMin}
            animationDuration={500}
            activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2, fill: "var(--ink)" }}
          />
          {markers.map((m) => (
            <ReferenceDot
              key={m.id}
              x={m.date}
              y={byDate.get(m.date) ?? 0}
              r={6}
              fill="var(--ink)"
              stroke="#fff"
              strokeWidth={2}
              onClick={() => onMarker?.(m.id)}
              style={{ cursor: onMarker ? "pointer" : "default" }}
            />
          ))}
          {extraMarker && byDate.has(extraMarker.date) && (
            <ReferenceDot x={extraMarker.date} y={byDate.get(extraMarker.date)!} r={7} fill="var(--tight)" stroke="#fff" strokeWidth={2} />
          )}
          <Tooltip content={<ChartTip />} cursor={{ stroke: "var(--ink)", strokeOpacity: 0.2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
