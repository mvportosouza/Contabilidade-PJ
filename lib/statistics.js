/**
 * Estatísticas finais do aplicativo.
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

export function getMonthlyStatistics(transactions) {
  const valid = Array.isArray(transactions) ? transactions : []
  const receitas = valid.filter(t => t?.tipo === 'receita')
  const despesas = valid.filter(t => t?.tipo === 'despesa')

  const receitaTotal = receitas.reduce((s, t) => s + Math.max(0, number(t.valor)), 0)
  const despesaTotal = despesas.reduce((s, t) => s + Math.max(0, number(t.valor)), 0)

  const porEspecialidade = {
    Endodontia: receitas.filter(t => t.especialidade === 'Endodontia').reduce((s,t)=>s+Math.max(0,number(t.valor)),0),
    Ortodontia: receitas.filter(t => t.especialidade === 'Ortodontia').reduce((s,t)=>s+Math.max(0,number(t.valor)),0),
    Outros: receitas.filter(t => !t.especialidade).reduce((s,t)=>s+Math.max(0,number(t.valor)),0),
  }

  return {
    receitas,
    despesas,
    receitaTotal,
    despesaTotal,
    resultado: receitaTotal - despesaTotal,
    quantidadeReceitas: receitas.length,
    quantidadeDespesas: despesas.length,
    ticketMedio: receitas.length ? receitaTotal / receitas.length : 0,
    porEspecialidade,
  }
}

export function getAnnualStatistics(transactions, plMap, irrfMap, year, calcIRRF) {
  return Array.from({length:12}, (_, i) => {
    const key = `${year}-${String(i+1).padStart(2,'0')}`
    const receita = (Array.isArray(transactions) ? transactions : [])
      .filter(t => {
        const d = dateOf(t?.data)
        return t?.tipo === 'receita' && d && d.getMonth() === i && d.getFullYear() === Number(year)
      })
      .reduce((s,t)=>s+Math.max(0,number(t.valor)),0)

    const pl = Math.max(0, number(plMap?.[key]))
    const inss = pl * 0.11
    const irrf = Object.prototype.hasOwnProperty.call(irrfMap || {}, key)
      ? Math.max(0, number(irrfMap[key]))
      : (typeof calcIRRF === 'function' ? Math.max(0, number(calcIRRF(pl,{inss}).valor)) : 0)

    return { receita, pl, inss, irrf }
  })
}
