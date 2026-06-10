'use client';

// SVG overlay drawing a dependency arrow from each task to its successors
// (MGMT-MODULE-SPEC §8.2 — port drawDeps). A line runs from a predecessor's
// right edge to each successor's left edge; critical edges are coloured
// differently. Positions are supplied by GanttTab.

import type { MgmtTaskRow } from '@/lib/mgmt/types';

export interface BarPos {
  x0: number; // bar left edge
  x1: number; // bar right edge
  y: number; // bar vertical centre
  crit: boolean;
}

export default function DependencyArrows({
  tasks,
  positions,
  width,
  height,
}: {
  tasks: MgmtTaskRow[];
  positions: Record<string, BarPos>;
  width: number;
  height: number;
}) {
  const edges: { from: BarPos; to: BarPos; crit: boolean }[] = [];
  for (const t of tasks) {
    const to = positions[t.id];
    if (!to) continue;
    for (const depId of t.deps || []) {
      const from = positions[depId];
      if (!from) continue;
      // An edge is critical only when BOTH endpoints are on the critical path.
      edges.push({ from, to, crit: from.crit && to.crit });
    }
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <marker id="mgmt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="fill-slate-400" />
        </marker>
        <marker id="mgmt-arrow-crit" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="fill-rose-500" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const sx = e.from.x1;
        const sy = e.from.y;
        const tx = e.to.x0;
        const ty = e.to.y;
        const midX = sx + Math.max(12, (tx - sx) / 2);
        const d = `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            className={e.crit ? 'stroke-rose-500' : 'stroke-slate-300'}
            strokeWidth={1.5}
            markerEnd={`url(#${e.crit ? 'mgmt-arrow-crit' : 'mgmt-arrow'})`}
          />
        );
      })}
    </svg>
  );
}
