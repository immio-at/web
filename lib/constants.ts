// ─── Funnel stages ────────────────────────────────────────────────────────────
// Single source of truth. Import from here in DashboardClient, FunnelBoard,
// and any future component that needs stage definitions.

export const FUNNEL_STAGES = [
  { key: 'new',           label: 'New',           header: '',              parked: false },
  { key: 'investigating', label: 'Investigating',  header: 'bg-slate-300', parked: false },
  { key: 'interested',    label: 'Interested',     header: 'bg-slate-400', parked: false },
  { key: 'visit_booked',  label: 'Visit Booked',   header: 'bg-slate-500', parked: false },
  { key: 'visited',       label: 'Visited',        header: 'bg-slate-600', parked: false },
  { key: 'offer_made',    label: 'Offer Made',     header: 'bg-teal-500',  parked: false },
  { key: 'parked',        label: 'Parked',         header: 'bg-slate-200', parked: true  },
  { key: 'won',           label: 'Won',            header: 'bg-teal-600',  parked: false },
  { key: 'not_relevant',  label: 'Not Relevant',   header: '',             parked: false },
];

export const FUNNEL_STAGES_DISPLAY = FUNNEL_STAGES.filter(
  s => s.key !== 'new' && s.key !== 'not_relevant'
);