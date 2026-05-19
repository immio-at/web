'use client';

/**
 * AnalysisCharts — the two recharts visualisations from PropertyAnalysisModal,
 * pulled into their own module so the (heavy) recharts bundle becomes a
 * separate chunk loaded on demand. PropertyAnalysisModal `next/dynamic`-imports
 * these, so a dossier-mode modal open — the common case — never downloads
 * recharts at all, and Analysen-mode opens only fetch it once an Owner /
 * Rental result section with chart data actually renders.
 */

import { useTranslations } from 'next-intl';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import {
  formatEuro,
  type YearlyDataPoint,
  type RentalYearlyDataPoint,
} from '@/lib/calculators';

/** Owner-occupier wealth build-up — stacked equity vs. remaining loan. */
export function OwnerWealthChart({ data }: { data: YearlyDataPoint[] }) {
  const t = useTranslations('analysis');
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={v => t('owner.chartYearShort', { year: v })} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
        <Tooltip formatter={(v) => formatEuro(Number(v ?? 0))} labelFormatter={l => t('owner.chartYear', { year: l })} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="equity" name={t('owner.chartEquity')} stackId="a" fill="#16a34a" radius={[0, 0, 0, 0]} />
        <Bar dataKey="loanRemaining" name={t('owner.chartLoanRemaining')} stackId="a" fill="#e2e6ed" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Rental projection — property value, loan, rent, outgoings, cashflow. */
export function RentalProjectionChart({ data }: { data: RentalYearlyDataPoint[] }) {
  const t = useTranslations('analysis');
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={v => t('rental.chartYearShort', { year: v })} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
        <Tooltip formatter={(v) => formatEuro(Number(v ?? 0))} labelFormatter={l => t('rental.chartYear', { year: l })} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line dataKey="propertyValue" name={t('rental.chartPropertyValue')} stroke="#0F1F3D" strokeWidth={2} dot={false} />
        <Line dataKey="loanRemaining" name={t('rental.chartLoanRemaining')} stroke="#6b7a99" strokeWidth={2} dot={false} strokeDasharray="4 2" />
        <Line dataKey="yearlyRentIncome" name={t('rental.chartYearlyRent')} stroke="#16a34a" strokeWidth={2} dot={false} />
        <Line dataKey="yearlyOutgoings" name={t('rental.chartYearlyOutgoings')} stroke="#dc2626" strokeWidth={2} dot={false} />
        <Line dataKey="cashflow" name={t('rental.chartCashflow')} stroke="#F5A623" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
