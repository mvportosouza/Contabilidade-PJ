/*
 * Motor tributário — Simples Nacional / 2026
 *
 * Regras-base:
 * - RBT12: receita bruta acumulada dos 12 meses anteriores ao PA.
 * - Início de atividade: RBT12 proporcional conforme art. 21 da Resolução
 *   CGSN 140/2018 (1º mês = receita do mês x 12; meses 2–12 =
 *   média dos meses anteriores x 12).
 * - Fator R = FS12 / RBT12; >= 28% => Anexo III; < 28% => Anexo V.
 * - FS12 considera remuneração/pró-labore e, quando disponível no próprio
 *   Simples, a parcela efetivamente recolhida de CPP; o aplicativo não
 *   possui dados de empregados/FGTS, portanto esses componentes não são
 *   inventados.
 *
 * Fontes normativas:
 * - LC 123/2006, art. 18.
 * - Resolução CGSN 140/2018, arts. 21 e 26.
 * - Tabelas dos Anexos III e V vigentes para 2026.
 */

export const TAX_YEAR = 2026;
export const SALARIO_MINIMO_2026 = 1621.00;
export const INSS_TETO_2026 = 8475.55;
export const INSS_PROLABORE_ALIQUOTA = 0.11;
export const IRRF_DEDUCAO_DEPENDENTE_2026 = 189.59;
export const IRRF_DESCONTO_SIMPLIFICADO_2026 = 607.20;
export const FATOR_R_MINIMO = 0.28;

export const SIMPLES_ANEXO_III = [
  { limite: 180000, aliquotaNominal: 0.06, deducao: 0, cppPartilha: 0.4340 },
  { limite: 360000, aliquotaNominal: 0.112, deducao: 9360, cppPartilha: 0.4340 },
  { limite: 720000, aliquotaNominal: 0.135, deducao: 17640, cppPartilha: 0.4340 },
  { limite: 1800000, aliquotaNominal: 0.16, deducao: 35640, cppPartilha: 0.4340 },
  { limite: 3600000, aliquotaNominal: 0.21, deducao: 125640, cppPartilha: 0.4340 },
  { limite: 4800000, aliquotaNominal: 0.33, deducao: 648000, cppPartilha: 0.3050 },
];

export const SIMPLES_ANEXO_V = [
  { limite: 180000, aliquotaNominal: 0.155, deducao: 0, cppPartilha: 0.2885 },
  { limite: 360000, aliquotaNominal: 0.18, deducao: 4500, cppPartilha: 0.2785 },
  { limite: 720000, aliquotaNominal: 0.195, deducao: 9900, cppPartilha: 0.2385 },
  { limite: 1800000, aliquotaNominal: 0.205, deducao: 17100, cppPartilha: 0.2385 },
  { limite: 3600000, aliquotaNominal: 0.23, deducao: 62100, cppPartilha: 0.2385 },
  { limite: 4800000, aliquotaNominal: 0.305, deducao: 540000, cppPartilha: 0.2950 },
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

function validDate(value) {
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function monthStart(year, monthIndex) {
  return new Date(Number(year), Number(monthIndex), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function monthDiff(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 +
    (b.getMonth() - a.getMonth());
}

function monthlyRevenueMap(transactions) {
  const map = {};
  for (const item of transactions || []) {
    if (item?.tipo !== 'receita' || !item?.data) continue;
    const d = validDate(item.data);
    if (!d) continue;
    const key = monthKey(d.getFullYear(), d.getMonth());
    map[key] = (map[key] || 0) + Math.max(0, clampNumber(item.valor));
  }
  return map;
}

function firstRevenueMonth(transactions) {
  let first = null;
  for (const item of transactions || []) {
    if (item?.tipo !== 'receita' || !item?.data) continue;
    const d = validDate(item.data);
    if (!d) continue;
    if (!first || d < first) first = d;
  }
  return first ? monthStart(first.getFullYear(), first.getMonth()) : null;
}

/**
 * RBT12 correto para o período de apuração (PA).
 *
 * Importante: o mês do PA NÃO entra no RBT12 da regra normal.
 * Nos 12 primeiros meses há a proporcionalização legal.
 */
export function calcRBT12(transactions, year, month) {
  const revenue = monthlyRevenueMap(transactions);
  const firstMonth = firstRevenueMonth(transactions);

  if (!firstMonth) {
    return {
      rbt12: 0,
      rbt12Anualizado: 0,
      receitaAcumulada: 0,
      mesesAtividade: 0,
      inicio: null,
      periodo: 'sem_atividade',
    };
  }

  const pa = monthStart(year, month);
  const monthsSinceStart = monthDiff(firstMonth, pa) + 1;

  // Ainda não iniciou a atividade no PA.
  if (monthsSinceStart <= 0) {
    return {
      rbt12: 0,
      rbt12Anualizado: 0,
      receitaAcumulada: 0,
      mesesAtividade: 0,
      inicio: firstMonth.toISOString().slice(0, 10),
      periodo: 'antes_da_atividade',
    };
  }

  const currentRevenue = revenue[monthKey(pa.getFullYear(), pa.getMonth())] || 0;

  // 1º mês de atividade: receita do próprio mês × 12.
  if (monthsSinceStart === 1) {
    const anualizado = round2(currentRevenue * 12);
    return {
      rbt12: anualizado,
      rbt12Anualizado: anualizado,
      receitaAcumulada: round2(currentRevenue),
      mesesAtividade: 1,
      inicio: firstMonth.toISOString().slice(0, 10),
      periodo: 'primeiro_mes',
    };
  }

  // Meses 2–12: média da receita dos meses anteriores ao PA × 12.
  if (monthsSinceStart <= 12) {
    let acumuladaAnterior = 0;
    for (let i = 1; i < monthsSinceStart; i += 1) {
      const d = addMonths(pa, -i);
      acumuladaAnterior += revenue[monthKey(d.getFullYear(), d.getMonth())] || 0;
    }

    const media = acumuladaAnterior / (monthsSinceStart - 1);
    const anualizado = round2(media * 12);

    return {
      rbt12: anualizado,
      rbt12Anualizado: anualizado,
      receitaAcumulada: round2(acumuladaAnterior + currentRevenue),
      mesesAtividade: monthsSinceStart,
      inicio: firstMonth.toISOString().slice(0, 10),
      periodo: 'inicio_atividade',
    };
  }

  // A partir do 13º mês: soma dos 12 meses anteriores ao PA.
  let rbt12 = 0;
  for (let i = 1; i <= 12; i += 1) {
    const d = addMonths(pa, -i);
    rbt12 += revenue[monthKey(d.getFullYear(), d.getMonth())] || 0;
  }

  return {
    rbt12: round2(rbt12),
    rbt12Anualizado: round2(rbt12),
    receitaAcumulada: round2(rbt12),
    mesesAtividade: monthsSinceStart,
    inicio: firstMonth.toISOString().slice(0, 10),
    periodo: 'normal',
  };
}

function getRbt12ForMonth(transactions, year, month) {
  return calcRBT12(transactions, year, month).rbt12;
}

function getPayrollForMonth(plMap, year, month) {
  const key = monthKey(year, month);
  return Math.max(0, clampNumber(plMap?.[key]));
}

function findFaixa(rbt12, table) {
  const rbt = Math.max(0, clampNumber(rbt12));
  const index = table.findIndex((f) => rbt <= f.limite);
  return {
    index: index >= 0 ? index : table.length - 1,
    faixa: index >= 0 ? index + 1 : table.length,
    faixaData: table[index >= 0 ? index : table.length - 1],
  };
}

function effectiveRate(rbt12, table) {
  const { index, faixa, faixaData } = findFaixa(rbt12, table);
  const rbt = Math.max(0, clampNumber(rbt12));

  if (!rbt) {
    return {
      aliquota: faixaData.aliquotaNominal,
      nominal: faixaData.aliquotaNominal,
      deducao: faixaData.deducao,
      faixa,
      index,
      cppPartilha: faixaData.cppPartilha,
    };
  }

  const aliquota = Math.max(
    0,
    (rbt * faixaData.aliquotaNominal - faixaData.deducao) / rbt,
  );

  return {
    aliquota,
    nominal: faixaData.aliquotaNominal,
    deducao: faixaData.deducao,
    faixa,
    index,
    cppPartilha: faixaData.cppPartilha,
  };
}

/**
 * Calcula o fator R do PA.
 *
 * FS12 é apurada sobre os 12 meses anteriores ao PA. Para este aplicativo,
 * a folha disponível é o pró-labore informado no pj_pl. A CPP do Simples
 * de cada mês é adicionada à FS12 quando ela puder ser derivada da própria
 * apuração. Não são inventados empregados, FGTS ou outros pagamentos.
 */
export function calcFatorR(transactions, plMap, year, month) {
  const revenue = monthlyRevenueMap(transactions);
  const firstMonth = firstRevenueMonth(transactions);
  const pa = monthStart(year, month);
  const rbtData = calcRBT12(transactions, year, month);

  if (!firstMonth || monthDiff(firstMonth, pa) < 0) {
    return {
      fs12: 0,
      rbt12: rbtData.rbt12,
      fatorR: 0,
      atingiu: false,
      faltante: 0,
      folhaProLabore12: 0,
      cpp12: 0,
      metaFolha: 0,
      aviso: 'Período anterior ao início da atividade.',
    };
  }

  /*
   * Para obter a CPP efetivamente recolhida nos 12 meses anteriores,
   * calculamos os PAs históricos em ordem cronológica. Isso evita tratar
   * a CPP como um percentual arbitrário do pró-labore: ela é a parcela do
   * DAS destinada à CPP, conforme a partilha do Anexo efetivamente aplicado.
   */
  const history = new Map();

  const endBeforePA = addMonths(pa, -1);
  const totalMonths = monthDiff(firstMonth, endBeforePA) + 1;

  for (let offset = 0; offset < totalMonths; offset += 1) {
    const d = addMonths(firstMonth, offset);
    const y = d.getFullYear();
    const m = d.getMonth();
    const key = monthKey(y, m);

    const rbt = calcRBT12(transactions, y, m).rbt12;
    const monthsSinceStart = offset + 1;
    const receitaMes = revenue[key] || 0;
    const proLaboreMes = getPayrollForMonth(plMap, y, m);

    let folha12 = 0;
    let cpp12 = 0;

    const monthsToLookBack = Math.min(12, Math.max(0, monthsSinceStart - 1));
    for (let i = 1; i <= monthsToLookBack; i += 1) {
      const prev = addMonths(d, -i);
      const prevKey = monthKey(prev.getFullYear(), prev.getMonth());
      folha12 += getPayrollForMonth(
        plMap,
        prev.getFullYear(),
        prev.getMonth(),
      );
      cpp12 += history.get(prevKey)?.cpp || 0;
    }

    let fs12 = folha12 + cpp12;

    /*
     * No próprio mês de abertura, o Fator R é calculado diretamente
     * pela folha/pró-labore do PA (FSPA) ÷ receita do PA (RPA).
     * Não anualizar a folha aqui é intencional e segue a regra específica
     * do primeiro PA.
     *
     * Do 2º ao 12º mês, a folha anualizada segue os mesmos critérios de
     * proporcionalização aplicados à receita bruta.
     */
    if (monthsSinceStart === 1) {
      fs12 = proLaboreMes;
    } else if (monthsSinceStart <= 12) {
      fs12 = (folha12 + cpp12) / Math.max(1, monthsSinceStart - 1) * 12;
    }

    let fatorR;
    if (monthsSinceStart === 1) {
      // No mês de abertura, a regra específica usa FSPA / RPA.
      if (proLaboreMes > 0 && receitaMes === 0) {
        fatorR = 0.28;
      } else if (proLaboreMes === 0 && receitaMes > 0) {
        fatorR = 0.01;
      } else if (proLaboreMes > 0 && receitaMes > 0) {
        fatorR = proLaboreMes / receitaMes;
      } else {
        fatorR = 0.01;
      }
    } else if (fs12 === 0 && rbt === 0) {
      fatorR = 0.01;
    } else if (fs12 > 0 && rbt === 0) {
      fatorR = 0.28;
    } else if (fs12 === 0 && rbt > 0) {
      fatorR = 0.01;
    } else {
      fatorR = fs12 / rbt;
    }

    const anexo = fatorR >= FATOR_R_MINIMO ? 'III' : 'V';
    const tabela = anexo === 'III'
      ? SIMPLES_ANEXO_III
      : SIMPLES_ANEXO_V;
    const rate = effectiveRate(rbt, tabela);

    const dasMes = receitaMes * rate.aliquota;
    const cppMes = dasMes * rate.cppPartilha;

    history.set(key, {
      fatorR,
      anexo,
      cpp: round2(cppMes),
      fs12: round2(fs12),
      rbt12: round2(rbt),
    });
  }

  let folhaProLabore12 = 0;
  let cpp12 = 0;

  for (let i = 1; i <= 12; i += 1) {
    const d = addMonths(pa, -i);
    folhaProLabore12 += getPayrollForMonth(
      plMap,
      d.getFullYear(),
      d.getMonth(),
    );
    cpp12 += history.get(
      monthKey(d.getFullYear(), d.getMonth()),
    )?.cpp || 0;
  }

  const monthsSinceStart = monthDiff(firstMonth, pa) + 1;
  let fs12 = folhaProLabore12 + cpp12;

  if (monthsSinceStart === 1) {
    // No primeiro PA, fs12 representa a FSPA do próprio mês.
    fs12 = getPayrollForMonth(plMap, year, month);
  } else if (monthsSinceStart > 1 && monthsSinceStart <= 12) {
    fs12 = (folhaProLabore12 + cpp12) /
      Math.max(1, monthsSinceStart - 1) * 12;
  }

  fs12 = round2(fs12);

  let fatorR;
  if (monthsSinceStart === 1) {
    const receitaPA = revenue[monthKey(year, month)] || 0;
    const folhaPA = getPayrollForMonth(plMap, year, month);

    // No primeiro PA, a regra específica usa FSPA / RPA.
    if (folhaPA > 0 && receitaPA === 0) {
      fatorR = 0.28;
    } else if (folhaPA === 0 && receitaPA > 0) {
      fatorR = 0.01;
    } else if (folhaPA > 0 && receitaPA > 0) {
      fatorR = folhaPA / receitaPA;
    } else {
      fatorR = 0.01;
    }
  } else if (fs12 === 0 && rbtData.rbt12 === 0) {
    fatorR = 0.01;
  } else if (fs12 > 0 && rbtData.rbt12 === 0) {
    fatorR = 0.28;
  } else if (fs12 === 0 && rbtData.rbt12 > 0) {
    fatorR = 0.01;
  } else {
    fatorR = fs12 / rbtData.rbt12;
  }

  const receitaPA = revenue[monthKey(year, month)] || 0;
  const meta = monthsSinceStart === 1
    ? Math.max(0, receitaPA * FATOR_R_MINIMO)
    : Math.max(0, rbtData.rbt12 * FATOR_R_MINIMO);

  return {
    fs12,
    rbt12: rbtData.rbt12,
    fatorR,
    atingiu: fatorR >= FATOR_R_MINIMO,
    faltante: round2(Math.max(0, meta - fs12)),
    folhaProLabore12: round2(
      monthsSinceStart === 1
        ? getPayrollForMonth(plMap, year, month)
        : folhaProLabore12,
    ),
    cpp12: round2(cpp12),
    metaFolha: round2(meta),
    aviso: 'FS12 considera pró-labore e a CPP efetivamente estimada pela partilha do DAS dos períodos anteriores. Empregados, FGTS e outros componentes de folha não são inventados pelo aplicativo.',
  };
}

/**
 * Retorna a tributação completa do PA.
 */
export function calcTributacao(transactions, plMap, year, month, receitaMes) {
  const rbt = calcRBT12(transactions, year, month);
  const fator = calcFatorR(transactions, plMap, year, month);

  const anexo = fator.fatorR >= FATOR_R_MINIMO ? 'III' : 'V';
  const tabela = anexo === 'III' ? SIMPLES_ANEXO_III : SIMPLES_ANEXO_V;
  const rate = effectiveRate(rbt.rbt12, tabela);
  const receita = Math.max(0, clampNumber(receitaMes));

  return {
    ...rbt,
    ...fator,
    anexo,
    aliquota: rate.aliquota,
    aliquotaNominal: rate.nominal,
    deducao: rate.deducao,
    faixa: rate.faixa,
    das: round2(receita * rate.aliquota),
    cppPartilha: rate.cppPartilha,
  };
}

/**
 * Compatibilidade com o App atual.
 * Se o chamador não fornecer contexto para o Fator R, o cálculo usa
 * explicitamente o Anexo III (mantendo a API antiga). O App.jsx do Lote B
 * passa pelo calcTributacao e, portanto, usa III/V corretamente.
 */
export function calcDAS(rbt12, receitaMes, options = {}) {
  const receita = Math.max(0, clampNumber(receitaMes));
  const rbt = Math.max(0, clampNumber(rbt12));

  if (options.anexo === 'V') {
    const rate = effectiveRate(rbt, SIMPLES_ANEXO_V);
    return {
      valor: round2(receita * rate.aliquota),
      aliquota: rate.aliquota,
      faixa: rate.faixa,
      nominal: rate.nominal,
      deducao: rate.deducao,
      rbt12: rbt,
      anexo: 'V',
      cppPartilha: rate.cppPartilha,
    };
  }

  const rate = effectiveRate(rbt, SIMPLES_ANEXO_III);
  return {
    valor: round2(receita * rate.aliquota),
    aliquota: rate.aliquota,
    faixa: rate.faixa,
    nominal: rate.nominal,
    deducao: rate.deducao,
    rbt12: rbt,
    anexo: 'III',
    cppPartilha: rate.cppPartilha,
  };
}

/**
 * Pró-labore recomendado para planejamento:
 * procura o valor mensal que, somado ao pró-labore dos 11 meses anteriores
 * e à CPP estimada, leva o FS12 do próximo PA a 28%.
 *
 * O mínimo legal usado pelo app continua sendo o salário mínimo de 2026.
 * Se o usuário tiver override manual, o App mantém esse override.
 */
export function calcRecommendedPL(transactions, plMap, year, month) {
  const receitas = monthlyRevenueMap(transactions);
  const firstMonth = firstRevenueMonth(transactions);

  if (!firstMonth) return SALARIO_MINIMO_2026;

  const current = monthStart(year, month);
  if (monthDiff(firstMonth, current) < 0) return SALARIO_MINIMO_2026;

  const monthsSinceStart = monthDiff(firstMonth, current) + 1;

  /*
   * Metodologia reproduzida dos valores fornecidos pela contabilidade:
   *
   *   pró-labore mínimo do PA seguinte
   *   = 28% × receita acumulada do período
   *     − pró-labore acumulado dos meses anteriores.
   *
   * O INSS retido do sócio e a CPP do DAS NÃO entram nessa meta. O que
   * importa aqui é a remuneração/pró-labore que compõe a FS12.
   *
   * Nos primeiros 12 meses, usamos toda a receita acumulada desde o início
   * da atividade. A partir do 13º mês, usamos a janela móvel de 12 meses.
   */
  const mesesNaJanela = Math.min(12, monthsSinceStart);

  let receitaBase = 0;
  let proLaboreAnterior = 0;

  for (let i = 0; i < mesesNaJanela; i += 1) {
    const d = addMonths(current, -i);
    const key = monthKey(d.getFullYear(), d.getMonth());

    receitaBase += receitas[key] || 0;

    // O pró-labore do mês atual é justamente o valor que estamos calculando.
    if (i > 0) {
      proLaboreAnterior += getPayrollForMonth(
        plMap,
        d.getFullYear(),
        d.getMonth(),
      );
    }
  }

  const meta = receitaBase * FATOR_R_MINIMO;
  const necessario = meta - proLaboreAnterior;

  return round2(
    Math.max(SALARIO_MINIMO_2026, necessario),
  );
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
  const inss = Math.min(
    Math.max(0, clampNumber(options.inss ?? calcINSS(rendimento))),
    INSS_TETO_2026 * INSS_PROLABORE_ALIQUOTA,
  );
  const dependentes = Math.max(0, Math.floor(clampNumber(options.dependentes, 0)));
  const pensao = Math.max(0, clampNumber(options.pensao, 0));
  const deducoesLegais =
    inss +
    dependentes * IRRF_DEDUCAO_DEPENDENTE_2026 +
    pensao;
  const deducao = Math.max(deducoesLegais, IRRF_DESCONTO_SIMPLIFICADO_2026);
  const base = Math.max(0, rendimento - deducao);

  const faixa =
    IRRF_2026.find((item) => base <= item.limite) ||
    IRRF_2026[IRRF_2026.length - 1];

  const impostoNormal = Math.max(
    0,
    base * faixa.aliquota - faixa.deducao,
  );

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

export function round2(value) {
  return Math.round(
    (clampNumber(value) + Number.EPSILON) * 100,
  ) / 100;
}
