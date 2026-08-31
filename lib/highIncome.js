/**
 * Estimativa gerencial da tributação mínima de altas rendas — ano-calendário 2026.
 * Base legal: Lei 15.270/2025, art. 16-A.
 * Não substitui o cálculo oficial da DIRPF.
 */

import { calculateMonthlyDividends } from './dividends';

export const HIGH_INCOME_THRESHOLD = 600000;
export const HIGH_INCOME_FULL_RATE_THRESHOLD = 1200000;
export const HIGH_INCOME_MAX_RATE = 0.10;
export const ANNUAL_SIMPLIFIED_DEDUCTION_2026 = 17640;
function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? Math.max(0, x) : 0;
}

function dateOf(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameYear(tx, year) {
  const d = dateOf(tx?.data);
  return d && d.getFullYear() === Number(year);
}

function isDividend(tx) {
  return tx?.tipo === 'distribuicao' && n(tx?.valor) > 0;
}

function isTransitionalExempt(tx) {
  if ((tx?.origemLucro || 'apurados_2026') !== 'anteriores_2025') return false;
  const approved = String(tx?.aprovacaoDistribuicao || '');
  const scheduled = String(tx?.pagamentoPrevistoOriginal || '');
  return approved !== '' && approved <= '2025-12-31'
    && scheduled !== '' && scheduled >= '2026-01-01' && scheduled <= '2028-12-31';
}

export function annualProgressiveTax(base) {
  const value = n(base);
  let tax = 0;
  if (value <= 29145.60) tax = 0;
  else if (value <= 33919.80) tax = value * 0.075 - 2185.92;
  else if (value <= 45012.60) tax = value * 0.15 - 4729.91;
  else if (value <= 55976.16) tax = value * 0.225 - 8105.85;
  else tax = value * 0.275 - 10904.66;
  return Math.max(0, tax);
}

export function annualTaxableIncomeEstimate(proLabore, inss, otherTaxable = 0) {
  const gross = n(proLabore) + n(otherTaxable);
  const legalDeduction = n(inss);
  const deduction = Math.max(legalDeduction, Math.min(ANNUAL_SIMPLIFIED_DEDUCTION_2026, gross));
  return Math.max(0, gross - deduction);
}

export function annualRegularIrpfEstimate(proLabore, inss, otherTaxable = 0) {
  const base = annualTaxableIncomeEstimate(proLabore, inss, otherTaxable);
  const normal = annualProgressiveTax(base);
  const gross = n(proLabore) + n(otherTaxable);
  let reduction = 0;
  if (gross <= 60000) reduction = Math.min(normal, 2694.15);
  else if (gross <= 88200) reduction = Math.min(normal, Math.max(0, 8429.73 - 0.095575 * gross));
  return {
    gross,
    base,
    normal,
    reduction,
    tax: Math.max(0, normal - reduction),
  };
}

export function calculateHighIncomeEstimate({
  transactions = [],
  plMap = {},
  year,
  otherIncome = {},
  calcINSS,
  irrfPf = 0,
} = {}) {
  const y = Number(year);
  let proLabore = 0;
  let inss = 0;
  let distributions = 0;
  let priorExempt = 0;
  let irrfPj = 0;

  for (let month = 0; month < 12; month += 1) {
    const key = `${y}-${String(month + 1).padStart(2, '0')}`;
    const pl = n(plMap?.[key]);
    proLabore += pl;
    inss += typeof calcINSS === 'function' ? n(calcINSS(pl)) : Math.min(pl * 0.11, 932.31);
  }

  for (const tx of Array.isArray(transactions) ? transactions : []) {
    if (!sameYear(tx, y) || !isDividend(tx)) continue;
    const value = n(tx.valor);
    if (isTransitionalExempt(tx)) priorExempt += value;
    else distributions += value;
  }

  for (let month = 0; month < 12; month += 1) {
    irrfPj += calculateMonthlyDividends(transactions, y, month)
      .reduce((sum, group) => sum + n(group.irrf), 0);
  }

  const other = n(otherIncome?.valor);
  const otherIncluded = otherIncome?.incluirBase !== false ? other : 0;
  const otherTaxable = otherIncome?.tributavel !== false ? other : 0;
  const otherIrrf = n(otherIncome?.irrf);

  const annualIncome = proLabore + distributions + priorExempt + other;
  const minimumBase = proLabore + distributions + otherIncluded;
  const rate = annualIncome <= HIGH_INCOME_THRESHOLD
    ? 0
    : minimumBase >= HIGH_INCOME_FULL_RATE_THRESHOLD
      ? HIGH_INCOME_MAX_RATE
      : minimumBase <= HIGH_INCOME_THRESHOLD
        ? 0
        : Math.max(0, (minimumBase / 60000) - 10) / 100;

  const minimumTax = minimumBase * rate;
  const regular = annualRegularIrpfEstimate(proLabore, inss, otherTaxable);
  const deductibleExclusiveTax = irrfPj + n(otherIncome?.irrfExclusive);
  const difference = Math.max(0, minimumTax - regular.tax - deductibleExclusiveTax);

  let status = 'fora';
  if (annualIncome > HIGH_INCOME_THRESHOLD) status = difference > 0 ? 'sujeito' : 'compensado';
  else if (annualIncome >= 540000) status = 'proximo';

  return {
    annualIncome,
    proLabore,
    distributions,
    priorExempt,
    otherIncome: other,
    otherIncluded,
    inss,
    irrfPf: n(irrfPf),
    irrfPj,
    otherIrrf,
    minimumBase,
    rate,
    minimumTax,
    regularIrpf: regular.tax,
    regularIrpfBase: regular.base,
    deductibleExclusiveTax,
    difference,
    status,
    thresholdRemaining: Math.max(0, HIGH_INCOME_THRESHOLD - annualIncome),
  };
}
