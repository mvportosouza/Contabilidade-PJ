/*
 * Motor tributário — 2026
 *
 * Simulador: não substitui a apuração do PGDAS-D/DCTFWeb nem a validação
 * da contabilidade. RBT12 e Fator R seguem a lógica dos 12 meses anteriores
 * ao período de apuração, com tratamento separado para início de atividade.
 */

export const TAX_YEAR = 2026;
export const SALARIO_MINIMO_2026 = 1621.00;
export const INSS_TETO_2026 = 8475.55;
export const INSS_PROLABORE_ALIQUOTA = 0.11;
export const IRRF_DEDUCAO_DEPENDENTE_2026 = 189.59;
export const IRRF_DESCONTO_SIMPLIFICADO_2026 = 607.20;
export const FATOR_R_MIN = 0.28;

export const SIMPLES_ANEXO_III = [
  { limite: 180000, aliquotaNominal: 0.06, deducao: 0 },
  { limite: 360000, aliquotaNominal: 0.112, deducao: 9360 },
  { limite: 720000, aliquotaNominal: 0.135, deducao: 17640 },
  { limite: 1800000, aliquotaNominal: 0.16, deducao: 35640 },
  { limite: 3600000, aliquotaNominal: 0.21, deducao: 125640 },
  { limite: 4800000, aliquotaNominal: 0.33, deducao: 648000 },
];

export const SIMPLES_ANEXO_V = [
  { limite: 180000, aliquotaNominal: 0.155, deducao: 0 },
  { limite: 360000, aliquotaNominal: 0.18, deducao: 4500 },
  { limite: 720000, aliquotaNominal: 0.195, deducao: 9900 },
  { limite: 1800000, aliquotaNominal: 0.205, deducao: 17100 },
  { limite: 3600000, aliquotaNominal: 0.23, deducao: 62100 },
  { limite: 4800000, aliquotaNominal: 0.305, deducao: 540000 },
];

export const IRRF_2026 = [
  { limite: 2428.80, aliquota: 0, deducao: 0 },
  { limite: 2826.65, aliquota: 0.075, deducao: 182.16 },
  { limite: 3751.05, aliquota: 0.15, deducao: 394.16 },
  { limite: 4664.68, aliquota: 0.225, deducao: 675.49 },
  { limite: Infinity, aliquota: 0.275, deducao: 908.73 },
];

export function clampNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function round2(value) {
  return Math.round((clampNumber(value) + Number.EPSILON) * 100) / 100;
}

export function calcINSS(proLabore) {
  const base = Math.min(Math.max(0, clampNumber(proLabore)), INSS_TETO_2026);
  return round2(base * INSS_PROLABORE_ALIQUOTA);
}

export function calcIRRF(proLabore, options = {}) {
  const rendimento = Math.max(0, clampNumber(proLabore));
  const inss = Math.min(Math.max(0, clampNumber(options.inss ?? calcINSS(rendimento))), INSS_TETO_2026 * INSS_PROLABORE_ALIQUOTA);
  const dependentes = Math.max(0, Math.floor(clampNumber(options.dependentes, 0)));
  const pensao = Math.max(0, clampNumber(options.pensao, 0));
  const deducoesLegais = inss + dependentes * IRRF_DEDUCAO_DEPENDENTE_2026 + pensao;
  const deducao = Math.max(deducoesLegais, IRRF_DESCONTO_SIMPLIFICADO_2026);
  const base = Math.max(0, rendimento - deducao);
  const faixa = IRRF_2026.find((item) => base <= item.limite) || IRRF_2026[IRRF_2026.length - 1];
  const impostoNormal = Math.max(0, base * faixa.aliquota - faixa.deducao);

  let reducao = 0;
  if (rendimento <= 5000) reducao = impostoNormal;
  else if (rendimento <= 7350) reducao = Math.max(0, 978.62 - 0.133145 * rendimento);

  const imposto = Math.max(0, impostoNormal - reducao);
  return {
    valor: round2(imposto),
    base: round2(base),
    inss: round2(inss),
    deducao: round2(deducao),
    impostoNormal: round2(impostoNormal),
    reducao: round2(Math.min(reducao, impostoNormal)),
    dependentes,
  };
}

function tableForAnexo(anexo = 'III') {
  return String(anexo).toUpperCase() === 'V' ? SIMPLES_ANEXO_V : SIMPLES_ANEXO_III;
}

export function calcDAS(rbt12, receitaMes, anexo = 'III') {
  const receita = Math.max(0, clampNumber(receitaMes));
  const rbt = Math.max(0, clampNumber(rbt12));
  const table = tableForAnexo(anexo);
  if (!receita) return { valor: 0, aliquota: 0, faixa: 0, rbt12: rbt, anexo: String(anexo).toUpperCase() };

  // O PGDAS usa R$ 1,00 apenas para determinar a alíquota quando RBT12 = 0.
  const baseRbt = rbt > 0 ? rbt : 1;
  const faixaIndex = table.findIndex((f) => baseRbt <= f.limite);
  const index = faixaIndex >= 0 ? faixaIndex : table.length - 1;
  const faixa = table[index];
  const aliquota = (baseRbt * faixa.aliquotaNominal - faixa.deducao) / baseRbt;

  return {
    valor: round2(receita * Math.max(0, aliquota)),
    aliquota: Math.max(0, aliquota),
    faixa: index + 1,
    nominal: faixa.aliquotaNominal,
    deducao: faixa.deducao,
    rbt12: rbt,
    anexo: String(anexo).toUpperCase(),
  };
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function monthDistance(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
}

function monthSums(transactions, tipo = 'receita') {
  const sums = {};
  for (const item of transactions || []) {
    if (item?.tipo !== tipo || !item?.data) continue;
    const d = new Date(`${item.data}T12:00:00`);
    if (Number.isNaN(d.getTime())) continue;
    const key = monthKey(d.getFullYear(), d.getMonth());
    sums[key] = (sums[key] || 0) + Math.max(0, clampNumber(item.valor));
  }
  return sums;
}

export function calcRBT12(transactions, year, month) {
  const receitas = (transactions || []).filter((t) => t?.tipo === 'receita' && t?.data);
  if (!receitas.length) return { rbt12: 0, rbt12Anualizado: 0, rbt12Base: 0, mesesAtividade: 0, inicio: null };

  const current = new Date(Number(year), Number(month), 1);
  const sums = monthSums(receitas, 'receita');
  const first = receitas.reduce((min, item) => {
    const d = new Date(`${item.data}T12:00:00`);
    return Number.isNaN(d.getTime()) ? min : (!min || d < min ? d : min);
  }, null);
  const firstMonth = first ? new Date(first.getFullYear(), first.getMonth(), 1) : null;
  const mesesAtividade = firstMonth ? Math.max(0, monthDistance(firstMonth, current)) : 0;

  // Regra normal: RBT12 = receita acumulada nos 12 meses anteriores ao PA.
  let rbt12 = 0;
  for (let i = 1; i <= 12; i += 1) {
    const d = new Date(current.getFullYear(), current.getMonth() - i, 1);
    rbt12 += sums[monthKey(d.getFullYear(), d.getMonth())] || 0;
  }
  rbt12 = round2(rbt12);

  // Em início de atividade, a base anualizada usa os meses desde a abertura
  // até o próprio PA. No primeiro mês, isso evita RBT12 artificialmente zero.
  let rbt12Anualizado = rbt12;
  if (firstMonth && mesesAtividade < 12) {
    let acumulada = 0;
    const cursor = new Date(firstMonth);
    const monthsElapsed = Math.max(1, mesesAtividade + 1);
    while (cursor <= current) {
      acumulada += sums[monthKey(cursor.getFullYear(), cursor.getMonth())] || 0;
      cursor.setMonth(cursor.getMonth() + 1);
    }
    rbt12Anualizado = round2((acumulada / monthsElapsed) * 12);
  }

  const rbt12Base = mesesAtividade < 12 ? rbt12Anualizado : rbt12;
  return {
    rbt12,
    rbt12Anualizado,
    rbt12Base,
    mesesAtividade,
    inicio: first ? first.toISOString().slice(0, 10) : null,
  };
}

export function calcFatorR(transactions, plMap, year, month) {
  const rbt = calcRBT12(transactions, year, month);
  const current = new Date(Number(year), Number(month), 1);
  const receitaSums = monthSums(transactions, 'receita');
  const firstMonth = rbt.inicio ? new Date(`${rbt.inicio.slice(0, 7)}-01T12:00:00`) : null;

  let rbt12r = 0;
  let fs12 = 0;

  if (firstMonth && rbt.mesesAtividade === 0) {
    // Mês de início: usa FSPA/RPA do próprio período.
    const key = monthKey(current.getFullYear(), current.getMonth());
    const receitaPA = receitaSums[key] || 0;
    const plPA = Math.max(0, clampNumber(plMap?.[key]));
    fs12 = plPA;
    rbt12r = receitaPA;
  } else {
    // Período posterior: FS12 e RBT12r dos 12 meses anteriores.
    const months = rbt.mesesAtividade < 12 && firstMonth ? rbt.mesesAtividade : 12;
    for (let i = 1; i <= months; i += 1) {
      const d = new Date(current.getFullYear(), current.getMonth() - i, 1);
      if (firstMonth && d < firstMonth) continue;
      const key = monthKey(d.getFullYear(), d.getMonth());
      rbt12r += receitaSums[key] || 0;
      const pl = Math.max(0, clampNumber(plMap?.[key]));
      fs12 += pl;
    }
  }

  let fatorR = 0.01;
  if (fs12 > 0 && rbt12r === 0) fatorR = 0.28;
  else if (fs12 > 0 && rbt12r > 0) fatorR = fs12 / rbt12r;

  const atingiu = fatorR >= FATOR_R_MIN;
  const meta = rbt12r * FATOR_R_MIN;
  return {
    fs12: round2(fs12),
    rbt12: round2(rbt12r),
    fatorR: round2(fatorR),
    atingiu,
    anexo: atingiu ? 'III' : 'V',
    faltante: round2(Math.max(0, meta - fs12)),
  };
}

export function calcRecommendedPL(transactions, plMap, year, month) {
  const fator = calcFatorR(transactions, plMap, year, month);
  if (!fator.rbt12) return SALARIO_MINIMO_2026;

  let previousFS = fator.fs12;
  const target = fator.rbt12 * FATOR_R_MIN;
  if (previousFS >= target) return SALARIO_MINIMO_2026;

  let lo = 0;
  let hi = Math.max(SALARIO_MINIMO_2026, target);
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    const fs = previousFS + mid;
    if (fs >= target) hi = mid;
    else lo = mid;
  }
  return round2(Math.max(SALARIO_MINIMO_2026, hi));
}
