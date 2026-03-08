/**
 * calculators.ts
 *
 * Pure calculation functions for the IMMIO Property Analysis Calculator.
 * No side effects, no UI dependencies, no API calls.
 * All inputs are plain numbers. All outputs are plain numbers.
 *
 * Follows ADR-003 v1.2 calculation logic exactly.
 */

import { PropertyAnalysis, RehabCostItem } from './api';

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface YearlyDataPoint {
  year: number;
  propertyValue: number;
  loanRemaining: number;
  equity: number;
}

export interface RentalYearlyDataPoint {
  year: number;
  propertyValue: number;
  loanRemaining: number;
  yearlyRentIncome: number;
  yearlyOutgoings: number;
  cashflow: number;
}

export interface LoanResult {
  monthlyPayment: number;
  remainingAfterYear: (year: number) => number;
}

// ─── Shared: Purchase Cost Calculations ──────────────────────────────────────

/**
 * Resolves the effective loan1 amount.
 * Manual override (loan1Amount) always wins over the percentage suggestion.
 */
export function resolveL1Amount(a: PropertyAnalysis): number {
  if (!a.financing) return 0;
  if (a.loan1Amount !== null && a.loan1Amount !== undefined) return a.loan1Amount;
  return (a.desiredPrice ?? 0) * a.loan1AmountPct;
}

export function resolveL2Amount(a: PropertyAnalysis): number {
  if (!a.financing || !a.loan2Enabled) return 0;
  return a.loan2Amount ?? 0;
}

export function calcKaufnebenkosten(a: PropertyAnalysis): number {
  const price = a.desiredPrice ?? 0;
  return (
    price * (a.maklerPct + a.notarPct + a.grundbuchPct + a.grunderwerbsteuerPct) +
    a.otherPurchaseCosts
  );
}

export function calcTotalRehab(rehabCosts: RehabCostItem[]): number {
  return rehabCosts.reduce((sum, item) => sum + item.amount, 0);
}

export function calcTotalAbzugsfaehig(rehabCosts: RehabCostItem[]): number {
  return rehabCosts.reduce((sum, item) => sum + item.abzugsfaehig, 0);
}

export function calcTotalInvestment(a: PropertyAnalysis): number {
  return (a.desiredPrice ?? 0) + calcKaufnebenkosten(a) + calcTotalRehab(a.rehabCosts);
}

export function calcEigenkapital(a: PropertyAnalysis): number {
  return calcTotalInvestment(a) - resolveL1Amount(a) - resolveL2Amount(a);
}

export function calcPricePerSqm(desiredPrice: number | null | undefined, sizeSqm: number | null | undefined): number | null {
  if (!desiredPrice || !sizeSqm) return null;
  return desiredPrice / sizeSqm;
}

// ─── Shared: Loan Calculations (Standard Annuity) ─────────────────────────────

/**
 * Calculates the fixed monthly payment for an annuity loan.
 * Formula: P × (r(1+r)^n) / ((1+r)^n - 1)
 * where r = monthly rate, n = total months
 */
export function calcMonthlyPayment(loanAmount: number, annualRate: number, termYears: number): number {
  if (loanAmount <= 0 || annualRate <= 0 || termYears <= 0) return 0;
  const r = annualRate / 12;
  const n = termYears * 12;
  return loanAmount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/**
 * Calculates the remaining loan balance after a given number of months.
 * Iterates month-by-month through the amortisation schedule.
 */
export function calcRemainingBalance(
  loanAmount: number,
  annualRate: number,
  termYears: number,
  afterMonths: number,
): number {
  if (loanAmount <= 0 || annualRate <= 0 || termYears <= 0) return 0;
  const r = annualRate / 12;
  const monthlyPayment = calcMonthlyPayment(loanAmount, annualRate, termYears);
  let balance = loanAmount;
  const months = Math.min(afterMonths, termYears * 12);
  for (let m = 0; m < months; m++) {
    const interest = balance * r;
    const principal = monthlyPayment - interest;
    balance = Math.max(0, balance - principal);
  }
  return balance;
}

export function calcLoan1Monthly(a: PropertyAnalysis): number {
  if (!a.financing) return 0;
  const amount = resolveL1Amount(a);
  return calcMonthlyPayment(amount, a.loan1Rate ?? 0, a.loan1TermYears ?? 0);
}

export function calcLoan2Monthly(a: PropertyAnalysis): number {
  if (!a.financing || !a.loan2Enabled) return 0;
  return calcMonthlyPayment(a.loan2Amount ?? 0, a.loan2Rate ?? 0, a.loan2TermYears ?? 0);
}

export function calcTotalMonthlyLoan(a: PropertyAnalysis): number {
  return calcLoan1Monthly(a) + calcLoan2Monthly(a);
}

// ─── Owner Occupied Results ───────────────────────────────────────────────────

export interface OwnerResults {
  monthlyLoan: number;
  monthlyBetriebskosten: number;
  monthlyRepairs: number;
  monthlyOutgoings: number;
  yearlyData: YearlyDataPoint[];
}

export function calcOwnerResults(a: PropertyAnalysis): OwnerResults {
  const desiredPrice = a.desiredPrice ?? 0;
  const monthlyLoan = calcTotalMonthlyLoan(a);
  const monthlyBetriebskosten = a.ooBetriebskostenMonthly ?? 0;
  const monthlyRepairs = (desiredPrice * a.ooRepairsPct) / 12;
  const monthlyOutgoings = monthlyLoan + monthlyBetriebskosten + monthlyRepairs;

  const termYears = a.loan1TermYears ?? 20;
  const projectionYears = Math.max(termYears, 20);

  const yearlyData: YearlyDataPoint[] = [];
  for (let y = 1; y <= projectionYears; y++) {
    const propertyValue = desiredPrice * Math.pow(1 + a.ooAppreciationPct, y);
    const l1Remaining = calcRemainingBalance(resolveL1Amount(a), a.loan1Rate ?? 0, a.loan1TermYears ?? 0, y * 12);
    const l2Remaining = calcRemainingBalance(resolveL2Amount(a), a.loan2Rate ?? 0, a.loan2TermYears ?? 0, y * 12);
    const loanRemaining = l1Remaining + l2Remaining;
    yearlyData.push({
      year: y,
      propertyValue,
      loanRemaining,
      equity: propertyValue - loanRemaining,
    });
  }

  return { monthlyLoan, monthlyBetriebskosten, monthlyRepairs, monthlyOutgoings, yearlyData };
}

// ─── Rental Results ───────────────────────────────────────────────────────────

export interface RentalResults {
  kaltmieteMonthly: number;
  kaltmieteYearly: number;
  bruttomietrendite: number;
  nettomietrendite: number;
  faktor: number;
  monthlyRepairsReserve: number;
  monthlyOutgoings: number;
  cashflowMonthly: number;
  cashflowAfterTax: number; // deferred — same as cashflowMonthly for MVP
  eigenkapitalrendite_cashflow: number;  // cash-on-cash: annual cashflow / EK
  eigenkapitalrendite_total: number;     // total return: (cashflow + principal paydown + appreciation) / EK
  yearlyData: RentalYearlyDataPoint[];
}

export function calcRentalResults(a: PropertyAnalysis): RentalResults {
  const desiredPrice = a.desiredPrice ?? 0;

  // Derive Kaltmiete
  const rentMonthly = a.rentMonthly ?? 0;
  const bkUmlagefaehig = a.bkUmlagefaehig ?? 0;
  const kaltmieteMonthly =
    a.rentType === 'warm' ? rentMonthly - bkUmlagefaehig : rentMonthly;
  const kaltmieteYearly = kaltmieteMonthly * 12;

  // Yields
  const bkNichtUmlagefaehig = a.bkNichtUmlagefaehig ?? 0;
  const reparaturruecklageMon = a.reparaturruecklageMon ?? 0;
  const totalInvestment = calcTotalInvestment(a);

  const bruttomietrendite = desiredPrice > 0 ? kaltmieteYearly / desiredPrice : 0;
  const nettomietrendite =
    totalInvestment > 0
      ? (kaltmieteYearly - bkNichtUmlagefaehig * 12 - reparaturruecklageMon * 12) / totalInvestment
      : 0;

  // Faktor (Kaufpreisfaktor / Vervielfältiger)
  // How many years of annual Kaltmiete to recover purchase price. Lower = better.
  const faktor = kaltmieteYearly > 0 ? desiredPrice / kaltmieteYearly : 0;

  // Monthly cashflow
  const effectiveRent = kaltmieteMonthly * (1 - a.vacancyPct);
  // repairs_pct = personal in-unit capital reserve (appliances, fixtures)
  // Base is always fixed to desiredPrice — not current property value
  const monthlyRepairsReserve = (desiredPrice * a.repairsPct) / 12;
  const monthlyLoan = calcTotalMonthlyLoan(a);
  const monthlyOutgoings =
    monthlyLoan + bkNichtUmlagefaehig + reparaturruecklageMon + monthlyRepairsReserve;
  const cashflowMonthly = effectiveRent - monthlyOutgoings;
  const cashflowAfterTax = cashflowMonthly; // tax logic deferred to ADR-007

  // Eigenkapitalrendite — two metrics
  const eigenkapital = calcEigenkapital(a);
  const annualCashflow = cashflowMonthly * 12;

  // 1. Cash-on-cash (Cashflow-Rendite)
  const eigenkapitalrendite_cashflow = eigenkapital > 0 ? annualCashflow / eigenkapital : 0;

  // 2. Total return (Gesamtrendite EK) — matches Immocation model
  // Includes cashflow + principal paydown in year 1 + appreciation in year 1
  const l1AfterYear1 = calcRemainingBalance(resolveL1Amount(a), a.loan1Rate ?? 0, a.loan1TermYears ?? 0, 12);
  const l2AfterYear1 = calcRemainingBalance(resolveL2Amount(a), a.loan2Rate ?? 0, a.loan2TermYears ?? 0, 12);
  const principalPaydownYr1 = (resolveL1Amount(a) - l1AfterYear1) + (resolveL2Amount(a) - l2AfterYear1);
  const appreciationYr1 = desiredPrice * a.valueGrowthPct;
  const totalReturnYr1 = annualCashflow + principalPaydownYr1 + appreciationYr1;
  const eigenkapitalrendite_total = eigenkapital > 0 ? totalReturnYr1 / eigenkapital : 0;

  // Year-by-year projection
  const termYears = a.loan1TermYears ?? 20;
  const projectionYears = Math.max(termYears, 20);
  const yearlyData: RentalYearlyDataPoint[] = [];

  for (let y = 1; y <= projectionYears; y++) {
    const propertyValue = desiredPrice * Math.pow(1 + a.valueGrowthPct, y);
    const yearlyRentIncome = kaltmieteMonthly * 12 * Math.pow(1 + a.rentGrowthPct, y);
    const yearlyOutgoings = monthlyOutgoings * 12; // simplified: growth not applied to costs
    const cashflow = yearlyRentIncome * (1 - a.vacancyPct) - yearlyOutgoings;

    const l1Remaining = calcRemainingBalance(resolveL1Amount(a), a.loan1Rate ?? 0, a.loan1TermYears ?? 0, y * 12);
    const l2Remaining = calcRemainingBalance(resolveL2Amount(a), a.loan2Rate ?? 0, a.loan2TermYears ?? 0, y * 12);

    yearlyData.push({
      year: y,
      propertyValue,
      loanRemaining: l1Remaining + l2Remaining,
      yearlyRentIncome,
      yearlyOutgoings,
      cashflow,
    });
  }

  return {
    kaltmieteMonthly,
    kaltmieteYearly,
    bruttomietrendite,
    nettomietrendite,
    faktor,
    monthlyRepairsReserve,
    monthlyOutgoings,
    cashflowMonthly,
    cashflowAfterTax,
    eigenkapitalrendite_cashflow,
    eigenkapitalrendite_total,
    yearlyData,
  };
}

// ─── Flip Results ─────────────────────────────────────────────────────────────

export interface FlipResults {
  kaufnebenkosten: number;
  totalRehab: number;
  holdingCosts: number;
  totalCost: number;
  grossProfit: number;
  totalAbzugsfaehig: number;
  taxableProfit: number;
  tax: number;
  netProfit: number;
}

export function calcFlipResults(a: PropertyAnalysis): FlipResults {
  const desiredPrice = a.desiredPrice ?? 0;
  const flipResalePrice = a.flipResalePrice ?? 0;
  const holdingMonths = a.flipDurationMonths ?? 0;

  const kaufnebenkosten = calcKaufnebenkosten(a);
  const totalRehab = calcTotalRehab(a.rehabCosts);
  const totalAbzugsfaehig = calcTotalAbzugsfaehig(a.rehabCosts);

  const monthlyLoan = calcTotalMonthlyLoan(a);
  const bkNichtUmlagefaehig = a.bkNichtUmlagefaehig ?? 0;
  const monthlyHoldingCost = monthlyLoan + bkNichtUmlagefaehig;
  const holdingCosts = monthlyHoldingCost * holdingMonths;

  const totalCost = desiredPrice + kaufnebenkosten + totalRehab + holdingCosts;
  const grossProfit = flipResalePrice - totalCost;

  // Austrian Immobilienertragsteuer — 30% flat rate (MVP approximation)
  // Tax is only applied if there is a positive taxable profit
  const taxableProfit = grossProfit - totalAbzugsfaehig;
  const tax = Math.max(taxableProfit * 0.30, 0);
  const netProfit = grossProfit - tax;

  return {
    kaufnebenkosten,
    totalRehab,
    holdingCosts,
    totalCost,
    grossProfit,
    totalAbzugsfaehig,
    taxableProfit,
    tax,
    netProfit,
  };
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

/**
 * Formats a number as Euro currency: € 1.234,56
 * Austrian locale formatting (de-AT).
 */
export function formatEuro(value: number): string {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Formats a decimal as a percentage: 0.0371 → "3.71%"
 */
export function formatPct(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Formats a Faktor value: 27.3 → "27.3x"
 */
export function formatFaktor(value: number): string {
  return `${value.toFixed(1)}x`;
}
