import type { KeyboardEvent } from "react";
import { groupAriaLabel, mergeMarkers, type ChartEvent, type MarkerGroup } from "./chartEvents";

export type ActiveMarker = { group: MarkerGroup; x: number; y: number; align: "start" | "center" | "end" };

/** Tooltips this close to a plot edge anchor to that edge instead of centering. */
const TOOLTIP_EDGE_PX = 120;

type AxisLike = { scale?: (v: number) => number };

/** Props Recharts injects into a `<Customized>` element, plus our own. */
type EventMarkerLayerProps = {
  events: ChartEvent[];
  onActiveChange: (active: ActiveMarker | null) => void;
  xAxisMap?: Record<string, AxisLike>;
  offset?: { top: number; left: number; width: number; height: number };
};

const DIAMOND = "M0,-3 L3,0 L0,3 L-3,0 Z";

export function EventMarkerLayer({ events, onActiveChange, xAxisMap, offset }: EventMarkerLayerProps) {
  const scale = xAxisMap ? Object.values(xAxisMap)[0]?.scale : undefined;
  if (!scale || !offset || events.length === 0) return null;
  const baseline = offset.top + offset.height;
  const left = offset.left;
  const right = offset.left + offset.width;
  const groups = mergeMarkers(events, (t) => scale(t)).filter((g) => g.x >= left - 0.5 && g.x <= right + 0.5);

  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Escape") onActiveChange(null);
  };

  return (
    <g className="event-markers" role="group" aria-label="Dividends and splits">
      {groups.map((group) => {
        const align = group.x - left < TOOLTIP_EDGE_PX ? "start" : right - group.x < TOOLTIP_EDGE_PX ? "end" : "center";
        const activate = () => onActiveChange({ group, x: group.x, y: baseline, align });
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
            onKeyDown={onKeyDown}
          >
            <circle className="event-marker__hit" r={8} />
            <circle className="event-marker__ring" r={6} />
            {group.kind === "split" ? (
              <path className="event-marker__split" d={DIAMOND} />
            ) : (
              <circle className="event-marker__dividend" r={3} />
            )}
            {count > 1 ? (
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
