// EUR money formatting for the /mgmt module (MGMT-MODULE-SPEC §8.4 — immio is
// an Austrian product). Ported from bimmorang's fmtMoney/fmtEUR.

const EUR = new Intl.NumberFormat('de-AT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const EUR_CENTS = new Intl.NumberFormat('de-AT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Whole-euro display (totals, budget cells). Coerces strings/Decimals safely.
export function fmtEUR(value: number | string | null | undefined): string {
  const n = Number(value);
  return EUR.format(Number.isFinite(n) ? n : 0);
}

export function fmtEURCents(value: number | string | null | undefined): string {
  const n = Number(value);
  return EUR_CENTS.format(Number.isFinite(n) ? n : 0);
}

// Percentage with one decimal, guarding ÷0.
export function fmtPct(numerator: number, denominator: number): string {
  if (!denominator) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}
