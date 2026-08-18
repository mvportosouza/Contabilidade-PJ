/*
 * Motor tributário — 2026
 *
 * Fontes oficiais consultadas em 17/08/2026:
 * - Receita Federal — Tributação de 2026
 * - INSS — tabela de contribuição mensal 2026
 * - Decreto 12.797/2025 — salário mínimo 2026
 *
 * O módulo mantém o Simples/Anexo III utilizado pelo app atual, mas
 * separa as regras do componente de interface para permitir testes.
 */

export const TAX_YEAR = 2026;
export const SALARIO_MINIMO_2026 = 1621.00;
export const INSS_TETO_2026 = 8475.55;
export const INSS_PROLABORE_ALIQUOTA = 0.11;
export const IRRF_DEDUCAO_DEPENDENTE_2026 = 189.59;
export const IRRF_DESCONTO_SIMPLIFICADO_2026 = 607.20;

export const SIMPLES_ANEXO_III = [
  { limite: 180000, aliquotaNominal: 0.06, deducao: 0 },
  { limite: 360000, aliquotaNominal: 0.112, deducao: 9360 },
  { limite: 720000, aliquotaNominal: 0.135, deducao: 17640 },
  { limite: 1800000, aliquotaNominal: 0.16, deducao: 35640 },
  { limite: 3600000, aliquotaNominal: 0.21, deducao: 125640 },
  { limite: 4800000, aliquotaNominal: 0.33, deducao: 557640 },
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

export function calcINSS(proLabore) {
  const base = Math.min(
    Math.max(0, clampNumber(proLabore)),
    INSS_TETO_2026,
  );

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
  if (rendimento <= 5000) {
    reducao = impostoNormal;
  } else if (rendimento <= 7350) {
    reducao = Math.max(0, 978.62 - 0.133145 * rendimento);
  }

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

export function calcDAS(rbt12, receitaMes) {
  const receita = Math.max(0, clampNumber(receitaMes));
  const rbt = Math.max(0, clampNumber(rbt12));
  if (!receita) {
    return {
      valor: 0,
      aliquota: 0,
      faixa: 0,
      rbt12: rbt,
    };
  }

  const faixaIndex = SIMPLES_ANEXO_III.findIndex((f) => rbt <= f.limite);
  const index = faixaIndex >= 0 ? faixaIndex : SIMPLES_ANEXO_III.length - 1;
  const faixa = SIMPLES_ANEXO_III[index];
  const aliquota = rbt > 0 ? (rbt * faixa.aliquotaNominal - faixa.deducao) / rbt : faixa.aliquotaNominal;
  return {
    valor: round2(receita * Math.max(0, aliquota)),
    aliquota: Math.max(0, aliquota),
    faixa: index + 1,
    nominal: faixa.aliquotaNominal,
    deducao: faixa.deducao,
    rbt12: rbt,
  };
}

export function calcRBT12(transactions, year, month) {
  const receitas = (transactions || []).filter((t) => t?.tipo === 'receita' && t?.data);
  if (!receitas.length) return { rbt12: 0, rbt12Anualizado: 0, mesesAtividade: 0, inicio: null };

  const current = new Date(Number(year), Number(month), 1);
  const months = [];
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(current.getFullYear(), current.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }

  const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const sums = {};
  for (const item of receitas) {
    const d = new Date(`${item.data}T12:00:00`);
    if (Number.isNaN(d.getTime())) continue;

    const key = monthKey(d.getFullYear(), d.getMonth());
    sums[key] = (sums[key] || 0) + clampNumber(item.valor);
  }

  const rbt12 = round2(months.reduce((sum, m) => sum + (sums[monthKey(m.year, m.month)] || 0), 0));
  const first = receitas.reduce((min, item) => {
    const d = new Date(`${item.data}T12:00:00`);
    return !min || d < min ? d : min;
  }, null);

  const firstMonth = first ? new Date(first.getFullYear(), first.getMonth(), 1) : null;
  let mesesAtividade = 0;
  if (firstMonth) {
    mesesAtividade = (current.getFullYear() - firstMonth.getFullYear()) * 12 + current.getMonth() - firstMonth.getMonth() + 1;
    mesesAtividade = Math.max(1, mesesAtividade);
  }

  const currentEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59);
  const receitaDesdeInicio = receitas.filter((t) => {
    const d = new Date(`${t.data}T12:00:00`);
    return d >= firstMonth && d <= currentEnd;
  }).reduce((s, t) => s + clampNumber(t.valor), 0);
  const anualizado = mesesAtividade > 0 && mesesAtividade < 12
    ? round2((receitaDesdeInicio / mesesAtividade) * 12)
    : rbt12;

  return { rbt12, rbt12Anualizado: anualizado, mesesAtividade, inicio: first ? first.toISOString().slice(0, 10) : null };
}

export function calcFatorR(transactions, plMap, year, month) {
  const { rbt12, rbt12Anualizado, mesesAtividade } = calcRBT12(transactions, year, month);
  const baseRBT = mesesAtividade > 0 && mesesAtividade < 12 ? rbt12Anualizado : rbt12;
  if (!baseRBT) return { fs12: 0, rbt12: 0, fatorR: 0, atingiu: false, faltante: 0 };

  let fs12 = 0;
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(Number(year), Number(month) - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const pl = Math.max(0, clampNumber(plMap?.[key]));
    fs12 += pl + calcINSS(pl);
  }
  fs12 = round2(fs12);
  const fatorR = baseRBT > 0 ? fs12 / baseRBT : 0;
  const meta = baseRBT * 0.28;
  return {
    fs12,
    rbt12: baseRBT,
    fatorR,
    atingiu: fatorR >= 0.28,
    faltante: round2(Math.max(0, meta - fs12)),
  };
}

export function calcRecommendedPL(transactions, plMap, year, month) {
  /*
   * Método utilizado pelo aplicativo:
   * pró-labore mínimo necessário no mês =
   * 28% da receita acumulada no período de atividade considerado
   * menos os pró-labores dos meses anteriores.
   *
   * O valor nunca fica abaixo do salário mínimo de 2026.
   * O cálculo não usa a receita anualizada para definir o pró-labore,
   * evitando um salto artificial no primeiro ano de atividade.
   */
  const receitas = (transactions || []).filter(
    (t) => t?.tipo === 'receita' && t?.data,
  )

  if (!receitas.length) return SALARIO_MINIMO_2026

  let totalReceita = 0
  let previousPL = 0

  for (let i = 0; i < 12; i += 1) {
    const d = new Date(Number(year), Number(month) - i, 1)
    const currentMonth = d.getMonth()
    const currentYear = d.getFullYear()

    const receitaMes = receitas
      .filter((t) => {
        const td = new Date(`${t.data}T12:00:00`)
        return (
          !Number.isNaN(td.getTime()) &&
          td.getMonth() === currentMonth &&
          td.getFullYear() === currentYear
        )
      })
      .reduce((sum, t) => sum + clampNumber(t.valor), 0)

    totalReceita += receitaMes

    if (i > 0) {
      const key = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`
      previousPL += Math.max(0, clampNumber(plMap?.[key]))
    }
  }

  return round2(
    Math.max(
      SALARIO_MINIMO_2026,
      totalReceita * 0.28 - previousPL,
    ),
  )
}

export function round2(value) {
  return Math.round((clampNumber(value) + Number.EPSILON) * 100) / 100;
}
