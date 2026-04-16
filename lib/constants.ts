// ─── Terminal stages ──────────────────────────────────────────────────────────
// Moving a property to one of these does NOT clear the expired flag.
// Must match TERMINAL_STAGES in properties.service.ts on the backend.
export const TERMINAL_STAGES = new Set(['not_relevant', 'delisted']);

// ─── Funnel stages ────────────────────────────────────────────────────────────
// Single source of truth. Import from here in DashboardClient, FunnelBoard,
// and any future component that needs stage definitions.

// Funnel stage definitions (single source of truth).
//
// Stage semantics — Session 38 (2026-04-16):
//   investigating — landing spot for anything slightly interesting
//   interested    — passed first check; brief analysis / gathering detail
//   due_diligence — in-depth analysis, property visit, scouring documents,
//                   talking to lawyer / coach / accountant (merged from the
//                   former `due_diligence_completed` and `visited` stages)
//   offer_made    — due diligence passed, offer submitted
//   parked        — due diligence didn't pass but user isn't ready to
//                   discard completely (side branch)
//   won           — purchase complete
//
// Column header colours — three-phase palette: orange for early scouting,
// blue for due-diligence, green for closing. Parked stays slate (side
// branch, not forward motion).
export const FUNNEL_STAGES = [
  { key: 'new',           label: 'New',           header: '',              parked: false },
  { key: 'investigating', label: 'Investigating',  header: 'bg-orange-100', parked: false },
  { key: 'interested',    label: 'Interested',     header: 'bg-orange-200', parked: false },
  { key: 'due_diligence', label: 'Due Diligence',  header: 'bg-blue-300', parked: false },
  { key: 'offer_made',    label: 'Offer Made',     header: 'bg-blue-400', parked: false },
  { key: 'won',           label: 'Won',            header: 'bg-green-600', parked: false },
  { key: 'parked',        label: 'Parked',         header: 'bg-slate-200', parked: true  },
  { key: 'not_relevant',  label: 'Not Relevant',   header: '',             parked: false },
];

export const FUNNEL_STAGES_DISPLAY = FUNNEL_STAGES.filter(
  s => s.key !== 'new' && s.key !== 'not_relevant'
);