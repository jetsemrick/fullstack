import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { groupAriaLabel, mergeMarkers, nearestIndex, type ChartEvent, type MarkerGroup } from "./chartEvents";

/** "dot": every event is a marker, merged with count badges. "tick": dividends are thin ticks behind one focusable track. */
export type EventMarkerStyle = "dot" | "tick";

export type ActiveMarker = {
  group: MarkerGroup;
  x: number;
  y: number;
  align: "start" | "center" | "end";
  /** Screen reader text for the active marker */
  announcement: string;
};

/** Tooltips this close to a plot edge anchor to that edge instead of centering. */
const TOOLTIP_EDGE_PX = 120;
/** Half-height of the hover band over the baseline in tick mode. */
const TRACK_HALF_HEIGHT_PX = 8;

type AxisLike = { scale?: (v: number) => number };

/** Props Recharts injects into a `<Customized>` element, plus our own. */
type EventMarkerLayerProps = {
  events: ChartEvent[];
  markerStyle: EventMarkerStyle;
  onActiveChange: (active: ActiveMarker | null) => void;
  xAxisMap?: Record<string, AxisLike>;
  offset?: { top: number; left: number; width: number; height: number };
};

const DIAMOND = "M0,-3 L3,0 L0,3 L-3,0 Z";

export function EventMarkerLayer({ events, markerStyle, onActiveChange, xAxisMap, offset }: EventMarkerLayerProps) {
  const [trackIndex, setTrackIndex] = useState<number | null>(null);
  const scale = xAxisMap ? Object.values(xAxisMap)[0]?.scale : undefined;
  if (!scale || !offset || events.length === 0) return null;
  const baseline = offset.top + offset.height;
  const left = offset.left;
  const right = offset.left + offset.width;
  const inPlot = (x: number) => x >= left - 0.5 && x <= right + 0.5;
  const alignAt = (x: number) =>
    x - left < TOOLTIP_EDGE_PX ? "start" : right - x < TOOLTIP_EDGE_PX ? "end" : "center";
  const activeFor = (group: MarkerGroup): ActiveMarker => ({
    group,
    x: group.x,
    y: baseline,
    align: alignAt(group.x),
    announcement: groupAriaLabel(group),
  });

  const ticks = markerStyle === "tick";
  const dividends = ticks
    ? events
        .filter((e) => e.kind === "dividend")
        .map((e) => ({ event: e, x: scale(e.t) }))
        .filter((d) => Number.isFinite(d.x) && inPlot(d.x))
    : [];
  const groups = mergeMarkers(ticks ? events.filter((e) => e.kind === "split") : events, (t) => scale(t)).filter(
    (g) => inPlot(g.x),
  );

  const activateDividend = (i: number) => {
    const d = dividends[i];
    if (!d) return;
    setTrackIndex(i);
    onActiveChange(activeFor({ x: d.x, events: [d.event], kind: "dividend" }));
  };

  const onTrackMouseMove = (e: MouseEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const x = e.clientX - svg.getBoundingClientRect().left;
    activateDividend(nearestIndex(dividends.map((d) => d.x), x));
  };

  const onTrackKeyDown = (e: KeyboardEvent<SVGRectElement>) => {
    const current = trackIndex !== null && trackIndex < dividends.length ? trackIndex : dividends.length - 1;
    const next =
      e.key === "ArrowLeft" ? current - 1
      : e.key === "ArrowRight" ? current + 1
      : e.key === "Home" ? 0
      : e.key === "End" ? dividends.length - 1
      : null;
    if (e.key === "Escape") {
      onActiveChange(null);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    activateDividend(Math.max(0, Math.min(dividends.length - 1, next)));
  };

  const onMarkerKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Escape") onActiveChange(null);
  };

  const trackX = trackIndex !== null ? dividends[trackIndex]?.x : undefined;

  return (
    <g className="event-markers" role="group" aria-label="Dividends and splits">
      {ticks && dividends.length > 0 ? (
        <>
          <g aria-hidden="true">
            {dividends.map((d) => (
              <rect
                key={d.event.t}
                className="event-marker__tick"
                x={d.x - 0.5}
                y={baseline - 4}
                width={1}
                height={4}
              />
            ))}
          </g>
          <rect
            className="event-track"
            x={left}
            y={baseline - TRACK_HALF_HEIGHT_PX}
            width={right - left}
            height={TRACK_HALF_HEIGHT_PX * 2}
            role="img"
            tabIndex={0}
            aria-label={`Dividends, ${dividends.length} in range. Use left and right arrow keys to move between dividends.`}
            onMouseMove={onTrackMouseMove}
            onMouseLeave={() => onActiveChange(null)}
            onFocus={() => activateDividend(trackIndex !== null && trackIndex < dividends.length ? trackIndex : dividends.length - 1)}
            onBlur={() => onActiveChange(null)}
            onKeyDown={onTrackKeyDown}
          />
          {trackX !== undefined ? (
            <circle className="event-track__ring" cx={trackX} cy={baseline - 2} r={5} aria-hidden="true" />
          ) : null}
        </>
      ) : null}
      {groups.map((group) => {
        const activate = () => onActiveChange(activeFor(group));
        const count = group.events.length;
        return (
          <g
            key={`${group.events[0]!.t}-${count}`}
            className={`event-marker event-marker--${group.kind}`}
            transform={`translate(${group.x},${baseline})`}
            role="img"
            tabIndex={0}
            aria-label={groupAriaLabel(group)}
            onMouseEnter={activate}
            onMouseLeave={() => onActiveChange(null)}
            onFocus={activate}
            onBlur={() => onActiveChange(null)}
            onKeyDown={onMarkerKeyDown}
          >
            <circle className="event-marker__hit" r={8} />
            <circle className="event-marker__ring" r={6} />
            {group.kind === "split" ? (
              <path className="event-marker__split" d={DIAMOND} />
            ) : (
              <circle className="event-marker__dividend" r={3} />
            )}
            {count > 1 && !ticks ? (
              <text className="event-marker__count" x={6} y={-5}>
                {count}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

export function EventMarkerTooltip({ active }: { active: ActiveMarker }) {
  return (
    <div
      className={`event-tooltip event-tooltip--${active.align}`}
      role="tooltip"
      style={{ left: active.x, top: active.y }}
    >
      {active.group.events.map((e) => (
        <div key={`${e.kind}-${e.t}`} className="event-tooltip__row">
          <span className={`event-swatch event-swatch--${e.kind}`} aria-hidden="true" />
          {e.label}
        </div>
      ))}
    </div>
  );
}
