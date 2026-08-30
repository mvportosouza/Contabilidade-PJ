/**
 * Regras de distribuição de lucros/dividendos — 2026.
 * O acumulador é por PJ pagadora + beneficiário + mês.
 */
export const DIVIDEND_MONTHLY_LIMIT = 50000;
export const DIVIDEND_IRRF_RATE = 0.10;
export const DIVIDEND_ALERT_THRESHOLD = 45000;
export const LUCRO_ORIGENS = Object.freeze({
  ANTERIOR_2026: "anteriores_2025",
  APURADO_2026: "apurados_2026",
});

export function normalizeCpfCnpj(value) {
  return String(value || "").replace(/\D/g, "");
}
export function dividendGroupKey(tx) {
  const pj = normalizeCpfCnpj(tx?.pjCnpj || tx?.cnpj);
  const beneficiary = normalizeCpfCnpj(tx?.beneficiarioCpf);
  return `${pj || "PJ_NAO_INFORMADA"}::${beneficiary || String(tx?.beneficiarioNome || tx?.nome || "").trim().toLocaleLowerCase("pt-BR") || "BENEFICIARIO_NAO_INFORMADO"}`;
}
export function isDividend(tx) {
  return tx?.tipo === "distribuicao" && Number(tx?.valor) > 0;
}
function sameMonth(tx, year, month) {
  const d = new Date(`${String(tx?.data || "").slice(0, 10)}T12:00:00`);
  return !Number.isNaN(d.getTime()) && d.getFullYear() === Number(year) && d.getMonth() === Number(month);
}
export function isTransitionalExempt(tx) {
  if ((tx?.origemLucro || LUCRO_ORIGENS.APURADO_2026) !== LUCRO_ORIGENS.ANTERIOR_2026) return false;
  const approved = String(tx?.aprovacaoDistribuicao || "");
  const scheduled = String(tx?.pagamentoPrevistoOriginal || "");
  return approved !== "" && approved <= "2025-12-31"
    && scheduled !== "" && scheduled >= "2026-01-01" && scheduled <= "2028-12-31";
}
function isCurrentRuleDistribution(tx) {
  return !isTransitionalExempt(tx);
}
export function calculateDividendGroup(transactions, { year, month, pjCnpj, beneficiarioCpf, beneficiarioNome } = {}) {
  const pj = normalizeCpfCnpj(pjCnpj);
  const cpf = normalizeCpfCnpj(beneficiarioCpf);
  const name = String(beneficiarioNome || "").trim().toLocaleLowerCase("pt-BR");
  const rows = (Array.isArray(transactions) ? transactions : []).filter((tx) => {
    if (!isDividend(tx) || !sameMonth(tx, year, month)) return false;
    if (pj && normalizeCpfCnpj(tx.pjCnpj || tx.cnpj) !== pj) return false;
    if (cpf) return normalizeCpfCnpj(tx.beneficiarioCpf) === cpf;
    if (name) return String(tx.beneficiarioNome || tx.nome || "").trim().toLocaleLowerCase("pt-BR") === name;
    return true;
  });
  const total = rows.reduce((sum, tx) => sum + Math.max(0, Number(tx.valor) || 0), 0);
  const taxableRows = rows.filter(isCurrentRuleDistribution);
  const taxableTotal = taxableRows.reduce((sum, tx) => sum + Math.max(0, Number(tx.valor) || 0), 0);
  const priorTotal = total - taxableTotal;
  const irrf = taxableTotal > DIVIDEND_MONTHLY_LIMIT ? taxableTotal * DIVIDEND_IRRF_RATE : 0;
  const liquid = total - irrf;
  const remaining = Math.max(0, DIVIDEND_MONTHLY_LIMIT - taxableTotal);
  let status = "normal";
  if (taxableTotal > DIVIDEND_MONTHLY_LIMIT) status = "retencao";
  else if (taxableTotal === DIVIDEND_MONTHLY_LIMIT) status = "limite";
  else if (taxableTotal >= DIVIDEND_ALERT_THRESHOLD) status = "proximo";
  return { total, taxableTotal, priorTotal, irrf, liquid, remaining, status, count: rows.length, rows };
}
export function calculateMonthlyDividends(transactions, year, month) {
  const groups = new Map();
  (Array.isArray(transactions) ? transactions : [])
    .filter((tx) => isDividend(tx) && sameMonth(tx, year, month))
    .forEach((tx) => {
      const key = dividendGroupKey(tx);
      if (!groups.has(key)) groups.set(key, {
        key, pjCnpj: tx.pjCnpj || tx.cnpj || "",
        beneficiarioCpf: tx.beneficiarioCpf || "",
        beneficiarioNome: tx.beneficiarioNome || tx.nome || "", rows: [],
      });
      groups.get(key).rows.push(tx);
    });
  return [...groups.values()].map((group) => ({
    ...group,
    ...calculateDividendGroup(group.rows, {
      year, month, pjCnpj: group.pjCnpj,
      beneficiarioCpf: group.beneficiarioCpf, beneficiarioNome: group.beneficiarioNome,
    }),
  }));
}
export function dividendEfdReinfRows(transactions, year, month) {
  return calculateMonthlyDividends(transactions, year, month).flatMap((group) => group.rows.map((tx) => ({
    id: tx.id, event: "R-4010", natureCode: "12001",
    grossAmount: Number(tx.valor) || 0,
    taxableAmount: group.taxableTotal > DIVIDEND_MONTHLY_LIMIT && isCurrentRuleDistribution(tx) ? Number(tx.valor) || 0 : 0,
    irrf: group.taxableTotal > DIVIDEND_MONTHLY_LIMIT && isCurrentRuleDistribution(tx) ? (Number(tx.valor) || 0) * DIVIDEND_IRRF_RATE : 0,
    exemptionType: isTransitionalExempt(tx) ? "12" : "",
    pjCnpj: tx.pjCnpj || tx.cnpj || "",
    beneficiaryCpf: tx.beneficiarioCpf || "", beneficiaryName: tx.beneficiarioNome || tx.nome || "",
    competence: String(tx.data || "").slice(0, 7),
  })));
}


export function withCalculatedDividendHistory(transactions) {
  const input = Array.isArray(transactions) ? transactions : [];
  const groups = new Map();
  input.filter(isDividend).forEach((tx) => {
    const d = new Date(`${String(tx.data || "").slice(0,10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return;
    const key = `${dividendGroupKey(tx)}::${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  });
  const values = new Map();
  groups.forEach((rows) => {
    const first = rows[0];
    const group = calculateDividendGroup(rows, {
      year: new Date(`${first.data}T12:00:00`).getFullYear(),
      month: new Date(`${first.data}T12:00:00`).getMonth(),
      pjCnpj: first.pjCnpj || first.cnpj,
      beneficiarioCpf: first.beneficiarioCpf,
      beneficiarioNome: first.beneficiarioNome || first.nome,
    });
    rows.forEach((row) => {
      const taxable = !isTransitionalExempt(row);
      const irrf = taxable && group.taxableTotal > DIVIDEND_MONTHLY_LIMIT
        ? (Number(row.valor) || 0) * DIVIDEND_IRRF_RATE
        : 0;
      values.set(row.id, { irrfDistribuicao: irrf, valorLiquidoDistribuicao: Math.max(0, (Number(row.valor)||0)-irrf) });
    });
  });
  return input.map((tx) => tx.tipo === "distribuicao"
    ? { ...tx, ...(values.get(tx.id) || { irrfDistribuicao:0, valorLiquidoDistribuicao:Number(tx.valor)||0 }) }
    : tx);
}
