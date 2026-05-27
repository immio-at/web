/**
 * calculators.ts
 *
 * Pure calculation functions for the IMMIO UserListing Analysis Calculator.
 * No side effects, no UI dependencies, no API calls.
 * All inputs are plain numbers. All outputs are plain numbers.
 *
 * Follows ADR-003 v1.2 calculation logic exactly.
 */

import { Analysis, RehabCostItem } from './api';

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
export function resolveL1Amount(a: Analysis): number {
  if (!a.financing) return 0;
  if (a.loan1Amount !== null && a.loan1Amount !== undefined) return a.loan1Amount;
  return (a.desiredPrice ?? 0) * a.loan1AmountPct;
}

export function resolveL2Amount(a: Analysis): number {
  if (!a.financing || !a.loan2Enabled) return 0;
  return a.loan2Amount ?? 0;
}

export function calcKaufnebenkosten(a: Analysis): number {
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

export function calcTotalInvestment(a: Analysis): number {
  return (a.desiredPrice ?? 0) + calcKaufnebenkosten(a) + calcTotalRehab(a.rehabCosts);
}

export function calcEigenkapital(a: Analysis): number {
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

export function calcLoan1Monthly(a: Analysis): number {
  if (!a.financing) return 0;
  const amount = resolveL1Amount(a);
  return calcMonthlyPayment(amount, a.loan1Rate ?? 0, a.loan1TermYears ?? 0);
}

export function calcLoan2Monthly(a: Analysis): number {
  if (!a.financing || !a.loan2Enabled) return 0;
  return calcMonthlyPayment(a.loan2Amount ?? 0, a.loan2Rate ?? 0, a.loan2TermYears ?? 0);
}

export function calcTotalMonthlyLoan(a: Analysis): number {
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

export function calcOwnerResults(a: Analysis): OwnerResults {
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
  cashflowAfterTax: number; // pre-tax value — use calcRentalTaxPrivate/GmbH for actual after-tax
  eigenkapitalrendite_cashflow: number;  // cash-on-cash: annual cashflow / EK
  eigenkapitalrendite_total: number;     // total return: (cashflow + principal paydown + appreciation) / EK
  yearlyData: RentalYearlyDataPoint[];
}

export function calcRentalResults(a: Analysis): RentalResults {
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

// ─── AfA Calculation (§ 8 EStG) ─────────────────────────────────────────────

export interface AfAResult {
  buildingBasis: number;
  afaYr1: number;
  afaYr2: number;
  afaStd: number;
  isAccelerated: boolean;
  afaForYear: (year: number) => number;
}

export function calcAfA(
  acquisitionBasis: number,
  gebaeudeAnteilPct: number,
  purchaseDate: string | null,
  legalStructure: 'private' | 'gmbh' = 'private',
): AfAResult {
  const buildingBasis = acquisitionBasis * gebaeudeAnteilPct;

  // GmbH uses flat 2.5% (business asset classification)
  if (legalStructure === 'gmbh') {
    const afaGmbh = buildingBasis * 0.025;
    return {
      buildingBasis,
      afaYr1: afaGmbh,
      afaYr2: afaGmbh,
      afaStd: afaGmbh,
      isAccelerated: false,
      afaForYear: () => afaGmbh,
    };
  }

  // Private: accelerated AfA for purchases after 2020-06-30
  const isAccelerated = purchaseDate ? new Date(purchaseDate) > new Date('2020-06-30') : true;

  const afaYr1 = buildingBasis * (isAccelerated ? 0.045 : 0.015);
  const afaYr2 = buildingBasis * (isAccelerated ? 0.030 : 0.015);
  const afaStd = buildingBasis * 0.015;

  return {
    buildingBasis,
    afaYr1,
    afaYr2,
    afaStd,
    isAccelerated,
    afaForYear: (year: number) => {
      if (year === 1) return afaYr1;
      if (year === 2) return afaYr2;
      return afaStd;
    },
  };
}

// ─── Annual interest from loan amortisation ──────────────────────────────────

function calcAnnualInterest(
  loanAmount: number,
  annualRate: number,
  termYears: number,
  year: number,
): number {
  if (loanAmount <= 0 || annualRate <= 0 || termYears <= 0) return 0;
  const r = annualRate / 12;
  const monthly = calcMonthlyPayment(loanAmount, annualRate, termYears);
  let balance = loanAmount;
  let totalInterest = 0;
  const startMonth = (year - 1) * 12;
  const endMonth = year * 12;
  for (let m = 0; m < endMonth && m < termYears * 12; m++) {
    const interest = balance * r;
    const principal = monthly - interest;
    if (m >= startMonth) totalInterest += interest;
    balance = Math.max(0, balance - principal);
  }
  return totalInterest;
}

// ─── Rental Tax — Private ────────────────────────────────────────────────────

export interface RentalTaxPrivateResult {
  interestAnnual: number;
  maintenanceAnnual: number;
  afaAnnual: number;
  werbungskostenAnnual: number;
  grossRentalAnnual: number;
  taxableIncomeAnnual: number;
  taxAnnual: number;
  cashflowAfterTaxMonthly: number;
  eigenkapitalrendite_total_aftertax: number;
}

export function calcRentalTaxPrivate(a: Analysis, rentalResults: RentalResults): RentalTaxPrivateResult {
  const grenzsteuersatz = a.grenzsteuersatzPct ?? 0;
  const acquisitionBasis = (a.desiredPrice ?? 0) + calcKaufnebenkosten(a);
  const afa = calcAfA(acquisitionBasis, a.gebaeudeAnteilPct, a.purchaseDate, 'private');

  const interestAnnual =
    calcAnnualInterest(resolveL1Amount(a), a.loan1Rate ?? 0, a.loan1TermYears ?? 0, 1) +
    calcAnnualInterest(resolveL2Amount(a), a.loan2Rate ?? 0, a.loan2TermYears ?? 0, 1);

  const maintenanceAnnual =
    (a.bkNichtUmlagefaehig ?? 0) * 12 +
    (a.reparaturruecklageMon ?? 0) * 12;

  const afaAnnual = afa.afaYr1; // year 1
  const werbungskostenAnnual = interestAnnual + maintenanceAnnual + afaAnnual;

  const grossRentalAnnual = rentalResults.kaltmieteYearly;
  const taxableIncomeAnnual = grossRentalAnnual - werbungskostenAnnual;
  const taxAnnual = taxableIncomeAnnual * grenzsteuersatz;

  const cashflowAfterTaxMonthly = rentalResults.cashflowMonthly - (taxAnnual / 12);

  // After-tax EK-Rendite (total return)
  const eigenkapital = calcEigenkapital(a);
  const desiredPrice = a.desiredPrice ?? 0;
  const l1AfterYear1 = calcRemainingBalance(resolveL1Amount(a), a.loan1Rate ?? 0, a.loan1TermYears ?? 0, 12);
  const l2AfterYear1 = calcRemainingBalance(resolveL2Amount(a), a.loan2Rate ?? 0, a.loan2TermYears ?? 0, 12);
  const principalPaydownYr1 = (resolveL1Amount(a) - l1AfterYear1) + (resolveL2Amount(a) - l2AfterYear1);
  const appreciationYr1 = desiredPrice * a.valueGrowthPct;
  const totalReturnAfterTax = (cashflowAfterTaxMonthly * 12) + principalPaydownYr1 + appreciationYr1;
  const eigenkapitalrendite_total_aftertax = eigenkapital > 0 ? totalReturnAfterTax / eigenkapital : 0;

  return {
    interestAnnual,
    maintenanceAnnual,
    afaAnnual,
    werbungskostenAnnual,
    grossRentalAnnual,
    taxableIncomeAnnual,
    taxAnnual,
    cashflowAfterTaxMonthly,
    eigenkapitalrendite_total_aftertax,
  };
}

// ─── Rental Tax — GmbH ──────────────────────────────────────────────────────

export interface RentalTaxGmbHResult {
  werbungskostenGmbH: number;
  taxableProfitGmbH: number;
  koest: number;
  profitAfterKoest: number;
  kest: number;
  totalTaxDistributed: number;
  cashflowRetainedMonthly: number;
  cashflowDistributedMonthly: number;
  effectiveRateRetained: number;
  effectiveRateDistributed: number;
}

export function calcRentalTaxGmbH(a: Analysis, rentalResults: RentalResults): RentalTaxGmbHResult {
  const acquisitionBasis = (a.desiredPrice ?? 0) + calcKaufnebenkosten(a);
  const afa = calcAfA(acquisitionBasis, a.gebaeudeAnteilPct, a.purchaseDate, 'gmbh');

  const interestAnnual =
    calcAnnualInterest(resolveL1Amount(a), a.loan1Rate ?? 0, a.loan1TermYears ?? 0, 1) +
    calcAnnualInterest(resolveL2Amount(a), a.loan2Rate ?? 0, a.loan2TermYears ?? 0, 1);

  const maintenanceAnnual =
    (a.bkNichtUmlagefaehig ?? 0) * 12 +
    (a.reparaturruecklageMon ?? 0) * 12;

  const gmbhAccounting = a.gmbhAccountingCostsAnnual ?? 0;
  const werbungskostenGmbH = interestAnnual + maintenanceAnnual + afa.afaStd + gmbhAccounting;

  const taxableProfitGmbH = rentalResults.kaltmieteYearly - werbungskostenGmbH;

  // KÖSt 23%
  const koest = Math.max(taxableProfitGmbH * 0.23, 0);
  const profitAfterKoest = taxableProfitGmbH - koest;

  // KESt 27.5% on distributed profits
  const kest = Math.max(profitAfterKoest * 0.275, 0);
  const totalTaxDistributed = koest + kest;

  const cashflowRetainedMonthly = rentalResults.cashflowMonthly - (koest / 12);
  const cashflowDistributedMonthly = rentalResults.cashflowMonthly - (totalTaxDistributed / 12);

  const effectiveRateRetained = taxableProfitGmbH > 0 ? koest / taxableProfitGmbH : 0;
  const effectiveRateDistributed = taxableProfitGmbH > 0 ? totalTaxDistributed / taxableProfitGmbH : 0;

  return {
    werbungskostenGmbH,
    taxableProfitGmbH,
    koest,
    profitAfterKoest,
    kest,
    totalTaxDistributed,
    cashflowRetainedMonthly,
    cashflowDistributedMonthly,
    effectiveRateRetained,
    effectiveRateDistributed,
  };
}

// ─── Flip Results — Private ──────────────────────────────────────────────────

export interface FlipResults {
  kaufnebenkosten: number;
  totalRehab: number;
  totalAbzugsfaehig: number;
  holdingCosts: number;
  holdingMonths: number;
  totalCost: number;
  grossProfit: number;
  deductibleCosts: number;
  taxableGain: number;
  immoest: number;
  netProfit: number;
  hauptwohnsitzApplied: boolean;
  // ADR-003 v2.3 — informational tax-block lines + ROI metrics
  /** total_abzugsfaehig × 0.30 — what the deductible rehab portion is worth
   *  in ImmoESt saved at the flat 30% private rate. Informational. */
  taxSavingFromRehab: number;
  /** total_abzugsfaehig / max(total_rehab, 1) — displayed as "€X von €Y". */
  deductibleRehabRatio: number;
  roiTotalInvestment: number;
  /** When eigenkapital <= 0 (cash purchase or fully-financed edge case) we
   *  collapse to roiTotalInvestment so the UI can footnote it as the
   *  unlevered figure rather than rendering a divide-by-zero ∞. */
  roiEquity: number;
  /** null when holding_months is 0 (annualisation is meaningless). */
  roiAnnualisedSimple: number | null;
  roiAnnualisedCompound: number | null;
}

const IMMOEST_RATE = 0.30;
const KOEST_RATE = 0.23;
const KEST_RATE = 0.275;

function annualiseSimple(roi: number, holdingMonths: number): number | null {
  if (holdingMonths <= 0) return null;
  return roi * (12 / holdingMonths);
}

function annualiseCompound(roi: number, holdingMonths: number): number | null {
  if (holdingMonths <= 0) return null;
  // 1 + roi can be < 0 on a deeply unprofitable deal; clamp at small positive
  // to keep the geometric formula real-valued. The simple variant is the
  // honest read in that case anyway.
  const base = Math.max(1 + roi, 0);
  return Math.pow(base, 12 / holdingMonths) - 1;
}

export function calcFlipPrivate(
  a: Analysis,
  hauptwohnsitzBefreiung = false,
): FlipResults {
  const desiredPrice = a.desiredPrice ?? 0;
  const flipResalePrice = a.flipResalePrice ?? 0;
  const holdingMonths = a.flipDurationMonths ?? 0;

  const kaufnebenkosten = calcKaufnebenkosten(a);
  const totalRehab = calcTotalRehab(a.rehabCosts);
  const totalAbzugsfaehig = calcTotalAbzugsfaehig(a.rehabCosts);

  // ADR-003 v2.3 §2.8: monthly_holding_bk = bk_nicht_umlagefaehig only.
  // No tenant during a flip — the umlagefähig/nicht-umlagefähig split does
  // not apply, and reparaturrücklage is not modelled separately on flips.
  const monthlyLoan = calcTotalMonthlyLoan(a);
  const monthlyHoldingBk = a.bkNichtUmlagefaehig ?? 0;
  const monthlyHoldingCost = monthlyLoan + monthlyHoldingBk;
  const holdingCosts = monthlyHoldingCost * holdingMonths;

  const totalCost = desiredPrice + kaufnebenkosten + totalRehab + holdingCosts;
  const grossProfit = flipResalePrice - totalCost;

  // ImmoESt (§ 30 EStG — 30% flat rate for private individuals)
  const deductibleCosts = kaufnebenkosten + totalAbzugsfaehig;
  const taxableGain = flipResalePrice - desiredPrice - deductibleCosts;
  const immoest = hauptwohnsitzBefreiung ? 0 : Math.max(taxableGain * IMMOEST_RATE, 0);
  const netProfit = grossProfit - immoest;

  // Tax-block informational lines (FX3)
  const taxSavingFromRehab = totalAbzugsfaehig * IMMOEST_RATE;
  const deductibleRehabRatio = totalAbzugsfaehig / Math.max(totalRehab, 1);

  // Rendite (ROI). Equity-base collapse when EK <= 0 (cash buy or edge case)
  // matches the §2.8 spec — render with a "unlevered" tooltip on the UI side.
  const eigenkapital = calcEigenkapital(a);
  const roiTotalInvestment = totalCost > 0 ? netProfit / totalCost : 0;
  const roiEquity = eigenkapital > 0 ? netProfit / eigenkapital : roiTotalInvestment;
  const roiAnnualisedSimple = annualiseSimple(roiEquity, holdingMonths);
  const roiAnnualisedCompound = annualiseCompound(roiEquity, holdingMonths);

  return {
    kaufnebenkosten,
    totalRehab,
    totalAbzugsfaehig,
    holdingCosts,
    holdingMonths,
    totalCost,
    grossProfit,
    deductibleCosts,
    taxableGain,
    immoest,
    netProfit,
    hauptwohnsitzApplied: hauptwohnsitzBefreiung,
    taxSavingFromRehab,
    deductibleRehabRatio,
    roiTotalInvestment,
    roiEquity,
    roiAnnualisedSimple,
    roiAnnualisedCompound,
  };
}

// ─── Flip Results — GmbH ─────────────────────────────────────────────────────

export interface FlipGmbHResults {
  kaufnebenkosten: number;
  totalRehab: number;
  totalAbzugsfaehig: number;
  holdingCosts: number;
  holdingMonths: number;
  totalCost: number;
  grossProfit: number;
  deductibleCosts: number;
  taxableGain: number;
  koest: number;
  netProfitRetained: number;
  kest: number;
  netProfitDistributed: number;
  // ADR-003 v2.3 — informational tax saving + ROI per side
  deductibleRehabRatio: number;
  /** Saving on the deductible rehab portion at the 23% KÖSt rate. */
  taxSavingFromRehabRetained: number;
  /** Saving at the combined effective rate for distributed profit
   *  ((1 - (1 - KÖSt)(1 - KESt)) ≈ 0.4418). */
  taxSavingFromRehabDistributed: number;
  roiTotalInvestmentRetained: number;
  roiEquityRetained: number;
  roiAnnualisedSimpleRetained: number | null;
  roiAnnualisedCompoundRetained: number | null;
  roiTotalInvestmentDistributed: number;
  roiEquityDistributed: number;
  roiAnnualisedSimpleDistributed: number | null;
  roiAnnualisedCompoundDistributed: number | null;
}

const COMBINED_GMBH_RATE = 1 - (1 - KOEST_RATE) * (1 - KEST_RATE);

export function calcFlipGmbH(a: Analysis): FlipGmbHResults {
  const desiredPrice = a.desiredPrice ?? 0;
  const flipResalePrice = a.flipResalePrice ?? 0;
  const holdingMonths = a.flipDurationMonths ?? 0;

  const kaufnebenkosten = calcKaufnebenkosten(a);
  const totalRehab = calcTotalRehab(a.rehabCosts);
  const totalAbzugsfaehig = calcTotalAbzugsfaehig(a.rehabCosts);

  // Same ADR-003 v2.3 §2.9 holding-cost rule as Private.
  const monthlyLoan = calcTotalMonthlyLoan(a);
  const monthlyHoldingBk = a.bkNichtUmlagefaehig ?? 0;
  const monthlyHoldingCost = monthlyLoan + monthlyHoldingBk;
  const holdingCosts = monthlyHoldingCost * holdingMonths;

  const totalCost = desiredPrice + kaufnebenkosten + totalRehab + holdingCosts;
  const grossProfit = flipResalePrice - totalCost;

  const deductibleCosts = kaufnebenkosten + totalAbzugsfaehig;
  const taxableGain = flipResalePrice - desiredPrice - deductibleCosts;

  // KÖSt 23% (no ImmoESt for GmbH)
  const koest = Math.max(taxableGain * KOEST_RATE, 0);
  const netProfitRetained = grossProfit - koest;

  // Distributed: additional KESt 27.5% on profit-after-KÖSt
  const kest = Math.max((taxableGain - koest) * KEST_RATE, 0);
  const netProfitDistributed = grossProfit - koest - kest;

  const deductibleRehabRatio = totalAbzugsfaehig / Math.max(totalRehab, 1);
  const taxSavingFromRehabRetained = totalAbzugsfaehig * KOEST_RATE;
  const taxSavingFromRehabDistributed = totalAbzugsfaehig * COMBINED_GMBH_RATE;

  const eigenkapital = calcEigenkapital(a);
  const roiTotalInvestmentRetained = totalCost > 0 ? netProfitRetained / totalCost : 0;
  const roiEquityRetained = eigenkapital > 0
    ? netProfitRetained / eigenkapital
    : roiTotalInvestmentRetained;
  const roiAnnualisedSimpleRetained = annualiseSimple(roiEquityRetained, holdingMonths);
  const roiAnnualisedCompoundRetained = annualiseCompound(roiEquityRetained, holdingMonths);

  const roiTotalInvestmentDistributed = totalCost > 0 ? netProfitDistributed / totalCost : 0;
  const roiEquityDistributed = eigenkapital > 0
    ? netProfitDistributed / eigenkapital
    : roiTotalInvestmentDistributed;
  const roiAnnualisedSimpleDistributed = annualiseSimple(roiEquityDistributed, holdingMonths);
  const roiAnnualisedCompoundDistributed = annualiseCompound(roiEquityDistributed, holdingMonths);

  return {
    kaufnebenkosten,
    totalRehab,
    totalAbzugsfaehig,
    holdingCosts,
    holdingMonths,
    totalCost,
    grossProfit,
    deductibleCosts,
    taxableGain,
    koest,
    netProfitRetained,
    kest,
    netProfitDistributed,
    deductibleRehabRatio,
    taxSavingFromRehabRetained,
    taxSavingFromRehabDistributed,
    roiTotalInvestmentRetained,
    roiEquityRetained,
    roiAnnualisedSimpleRetained,
    roiAnnualisedCompoundRetained,
    roiTotalInvestmentDistributed,
    roiEquityDistributed,
    roiAnnualisedSimpleDistributed,
    roiAnnualisedCompoundDistributed,
  };
}

// ─── Liebhaberei Warning ─────────────────────────────────────────────────────

/**
 * Returns true if cumulative pre-tax cashflow over 25 years remains negative.
 * In Austria, the tax office (Finanzamt) may classify the rental as
 * Liebhaberei (hobby) and retroactively disallow all tax deductions.
 */
export function calcLiebhabereiWarning(yearlyData: RentalYearlyDataPoint[]): boolean {
  let cumulative = 0;
  const years = Math.min(yearlyData.length, 25);
  for (let i = 0; i < years; i++) {
    cumulative += yearlyData[i].cashflow;
  }
  return cumulative < 0;
}

// ─── Year-by-Year Rental Projection with Tax ─────────────────────────────────

export interface RentalYearlyTaxDataPoint extends RentalYearlyDataPoint {
  afaForYear: number;
  interestForYear: number;
  werbungskostenForYear: number;
  taxableForYear: number;
  taxForYear: number;
  cashflowAfterTax: number;
}

export function calcYearlyRentalProjection(
  a: Analysis,
  rentalResults: RentalResults,
  years?: number,
): RentalYearlyTaxDataPoint[] {
  const desiredPrice = a.desiredPrice ?? 0;
  const grenzsteuersatz = a.grenzsteuersatzPct ?? 0;
  const acquisitionBasis = desiredPrice + calcKaufnebenkosten(a);
  const afa = calcAfA(acquisitionBasis, a.gebaeudeAnteilPct, a.purchaseDate, a.legalStructure);

  const maintenanceAnnual =
    (a.bkNichtUmlagefaehig ?? 0) * 12 +
    (a.reparaturruecklageMon ?? 0) * 12;

  const projectionYears = years ?? Math.max(a.loan1TermYears ?? 20, 20);
  const result: RentalYearlyTaxDataPoint[] = [];

  for (let y = 1; y <= projectionYears; y++) {
    const base = rentalResults.yearlyData[y - 1];
    if (!base) break;

    const afaForYear = afa.afaForYear(y);
    const interestForYear =
      calcAnnualInterest(resolveL1Amount(a), a.loan1Rate ?? 0, a.loan1TermYears ?? 0, y) +
      calcAnnualInterest(resolveL2Amount(a), a.loan2Rate ?? 0, a.loan2TermYears ?? 0, y);

    const werbungskostenForYear = interestForYear + maintenanceAnnual + afaForYear;
    const taxableForYear = base.yearlyRentIncome - werbungskostenForYear;

    const taxRate = a.legalStructure === 'gmbh' ? 0.23 : grenzsteuersatz;
    const taxForYear = taxableForYear * taxRate;
    const cashflowAfterTax = base.cashflow - taxForYear;

    result.push({
      ...base,
      afaForYear,
      interestForYear,
      werbungskostenForYear,
      taxableForYear,
      taxForYear,
      cashflowAfterTax,
    });
  }

  return result;
}

// ─── Legacy compatibility — calcFlipResults wraps calcFlipPrivate ────────────

export function calcFlipResults(a: Analysis): FlipResults {
  return calcFlipPrivate(a);
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
