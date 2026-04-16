// ─── Terminal stages ──────────────────────────────────────────────────────────
// Moving a property to one of these does NOT clear the expired flag.
// Must match TERMINAL_STAGES in properties.service.ts on the backend.
export const TERMINAL_STAGES = new Set(['not_relevant', 'delisted']);

// ─── Funnel stages ────────────────────────────────────────────────────────────
// Single source of truth. Import from here in DashboardClient, FunnelBoard,
// and any future component that needs stage definitions.

// Column header colours — a softer three-phase palette chosen by
// the user: orange for the early scouting stages, blue for the
// middle investigation stages, green for closing. Parked stays slate
// (side-branch, not forward motion).
export const FUNNEL_STAGES = [
  { key: 'new',           label: 'New',           header: '',              parked: false },
  { key: 'investigating', label: 'Investigating',  header: 'bg-orange-100', parked: false },
  { key: 'interested',    label: 'Interested',     header: 'bg-orange-200', parked: false },
  { key: 'due_diligence_completed', label: 'Due Diligence Completed', header: 'bg-blue-300', parked: false },
  { key: 'visited',       label: 'Visited',        header: 'bg-blue-400', parked: false },
  { key: 'offer_made',    label: 'Offer Made',     header: 'bg-green-500', parked: false },
  { key: 'parked',        label: 'Parked',         header: 'bg-slate-200', parked: true  },
  { key: 'won',           label: 'Won',            header: 'bg-green-600', parked: false },
  { key: 'not_relevant',  label: 'Not Relevant',   header: '',             parked: false },
];

export const FUNNEL_STAGES_DISPLAY = FUNNEL_STAGES.filter(
  s => s.key !== 'new' && s.key !== 'not_relevant'
);