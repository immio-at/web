'use client';

// A single Gantt bar with a drag-resize handle for editing working-day
// duration (MGMT-MODULE-SPEC §8.2 — port attachResizeHandle). Geometry is
// computed by the parent; the bar reports a new duration as the user drags the
// right-edge handle. Critical bars use a distinct colour from slack bars.

import { useRef } from 'react';
import { parse } from '@/lib/mgmt/workdays';
import type { Computed } from '@/lib/mgmt/cpm';

// Working days contained in the `calDays` calendar days after startISO — the
// inverse of addWorkingDays, used to map a pixel drag back to a duration.
function calToWorkdays(startISO: string, calDays: number): number {
  if (calDays <= 0) return 0;
  const d = parse(startISO);
  let wd = 0;
  for (let i = 0; i < calDays; i++) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) wd++;
  }
  return wd;
}

export default function GanttBar({
  task,
  label,
  left,
  width,
  daypx,
  onResize,
  onOpen,
}: {
  task: Computed;
  label: string;
  left: number;
  width: number;
  daypx: number;
  onResize: (dur: number) => void;
  onOpen: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = Math.max(width, daypx);
    function onMove(ev: PointerEvent) {
      const newWidth = startWidth + (ev.clientX - startX);
      const calDays = Math.max(0, Math.round(newWidth / daypx));
      const dur = Math.max(0, calToWorkdays(task._start, calDays));
      onResize(dur);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const done = task.done;
  const color = task._crit ? 'bg-rose-500' : 'bg-slate-400';
  const doneCls = done ? 'opacity-50' : '';

  return (
    <div
      ref={barRef}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      title={`${task.name} · ${task.dur}d · slack ${task._slack}`}
      className={`group absolute top-1/2 -translate-y-1/2 h-5 rounded ${color} ${doneCls} cursor-pointer flex items-center shadow-sm`}
      style={{ left, width: Math.max(width, 10) }}
    >
      <span className="px-1.5 text-[10px] font-medium text-white truncate select-none">
        {label} {done ? '✓' : ''}
      </span>
      {/* Resize handle (right edge) */}
      <span
        onPointerDown={startResize}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-black/10 opacity-0 group-hover:opacity-100"
        title="Drag to change duration"
      />
    </div>
  );
}
