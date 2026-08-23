/**
 * Motor de estatísticas mensais e anuais.
 * Mantém os cálculos fora do JSX; não define nem altera layout.
 */

function number(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function dateOf(value) {
  if (!value) return null
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function monthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

function monthlyAmount(transactions, year, monthIndex, predicate) {
  return (Array.isArray(transactions) ? transactions : [])
    .filter(t => {
      const d = dateOf(t?.data)
      return d && d.getMonth() === monthIndex && d.getFullYear() === Number(year) && predicate(t)
    })
    .reduce((s, t) => s + Math.max(0, number(t.valor)), 0)
}

export function getMonthlyStatistics(transactions) {
  const valid = Array.isArray(transactions) ? transactions : []
  const receitas = valid.filter(t => t?.tipo === 'receita')
  const despesas = valid.filter(t => t?.tipo === 'despesa')
  const distribuicoes = valid.filter(t => t?.tipo === 'distribuicao')

  const receitaTotal = receitas.reduce((s, t) => s + Math.max(0, number(t.valor)), 0)
  const despesaTotal = despesas.reduce((s, t) => s + Math.max(0, number(t.valor)), 0)
  const distribuicaoTotal = distribuicoes.reduce((s, t) => s + Math.max(0, number(t.valor)), 0)

  const porEspecialidade = {
    Endodontia: receitas.filter(t => t.especialidade === 'Endodontia').reduce((s,t)=>s+Math.max(0,number(t.valor)),0),
    Ortodontia: receitas.filter(t => t.especialidade === 'Ortodontia').reduce((s,t)=>s+Math.max(0,number(t.valor)),0),
    Outros: receitas.filter(t => !t.especialidade).reduce((s,t)=>s+Math.max(0,number(t.valor)),0),
  }

  return {
    receitas,
    despesas,
    distribuicoes,
    receitaTotal,
    despesaTotal,
    distribuicaoTotal,
    resultado: receitaTotal - despesaTotal,
    quantidadeReceitas: receitas.length,
    quantidadeDespesas: despesas.length,
    quantidadeDistribuicoes: distribuicoes.length,
    ticketMedio: receitas.length ? receitaTotal / receitas.length : 0,
    porEspecialidade,
  }
}

export function getAnnualStatistics(
  transactions,
  plMap,
  irrfMap,
  year,
  calcIRRF,
  calcTributacao,
) {
  const txs = Array.isArray(transactions) ? transactions : []
  const rows = Array.from({ length: 12 }, (_, i) => {
    const key = monthKey(year, i)
    const receita = monthlyAmount(txs, year, i, t => t?.tipo === 'receita')
    const despesa = monthlyAmount(txs, year, i, t => t?.tipo === 'despesa')
    const distribuicao = monthlyAmount(txs, year, i, t => t?.tipo === 'distribuicao')
    const pl = Math.max(0, number(plMap?.[key]))
    const inss = pl * 0.11
    const irrf = Object.prototype.hasOwnProperty.call(irrfMap || {}, key)
      ? Math.max(0, number(irrfMap[key]))
      : (typeof calcIRRF === 'function'
        ? Math.max(0, number(calcIRRF(pl, { inss }).valor))
        : 0)

    let das = 0
    if (typeof calcTributacao === 'function') {
      const taxation = calcTributacao(txs, plMap || {}, Number(year), i, receita)
      das = Math.max(0, number(taxation?.das))
    }

    const lucro = receita - despesa
    const margem = receita > 0 ? (lucro / receita) * 100 : 0

    return {
      mesIndex: i,
      key,
      mes: i,
      receita,
      despesa,
      pl,
      inss,
      irrf,
      das,
      impostos: das + inss + irrf,
      distribuicao,
      lucro,
      margem,
      mediaReceitaAcumulada: 0,
      isMelhor: false,
      isPior: false,
    }
  })

  let receitaAcumulada = 0
  rows.forEach((row, i) => {
    receitaAcumulada += row.receita
    row.mediaReceitaAcumulada = receitaAcumulada / (i + 1)
  })

  const active = rows.filter(row => row.receita > 0 || row.despesa > 0 || row.pl > 0 || row.distribuicao > 0)
  if (active.length) {
    const best = active.reduce((a, b) => b.lucro > a.lucro ? b : a)
    const worst = active.reduce((a, b) => b.lucro < a.lucro ? b : a)
    rows[best.mesIndex].isMelhor = true
    rows[worst.mesIndex].isPior = true
  }

  return rows
}
