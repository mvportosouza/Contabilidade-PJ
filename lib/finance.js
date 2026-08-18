/**
 * Motor financeiro do aplicativo.
 *
 * Modelo atual (sem alterar o layout):
 * - Resultado mensal = receitas - despesas lançadas no mês.
 * - Fluxo de caixa acumulado = saldo inicial (0 no modelo atual) +
 *   movimentações efetivamente lançadas até o período selecionado.
 * - Tributos/obrigações calculados pelo aplicativo NÃO são descontados
 *   automaticamente do caixa. Eles só entram no caixa quando o usuário
 *   registra o pagamento como uma despesa.
 *
 * Isso evita misturar competência/provisão com caixa e evita que uma
 * obrigação estimada seja tratada como dinheiro já pago.
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

function sameMonth(value, year, month) {
  const d = dateOf(value)
  return !!d && d.getFullYear() === Number(year) && d.getMonth() === Number(month)
}

function atOrBefore(value, year, month) {
  const d = dateOf(value)
  if (!d) return false
  const y = d.getFullYear()
  const m = d.getMonth()
  return y < Number(year) || (y === Number(year) && m <= Number(month))
}

/** Retorna apenas lançamentos financeiros válidos. */
export function normalizeTransactions(transactions) {
  return (Array.isArray(transactions) ? transactions : [])
    .filter((tx) => tx && (tx.tipo === 'receita' || tx.tipo === 'despesa') && dateOf(tx.data))
    .map((tx) => ({
      ...tx,
      valor: Math.max(0, number(tx.valor)),
    }))
    .filter((tx) => tx.valor > 0)
}

export function calculateMonthlyFinance(transactions, year, month) {
  const txs = normalizeTransactions(transactions).filter((tx) => sameMonth(tx.data, year, month))

  const receitas = txs
    .filter((tx) => tx.tipo === 'receita')
    .reduce((sum, tx) => sum + tx.valor, 0)

  const despesas = txs
    .filter((tx) => tx.tipo === 'despesa')
    .reduce((sum, tx) => sum + tx.valor, 0)

  return {
    receitas,
    despesas,
    resultado: receitas - despesas,
    lancamentos: txs,
  }
}

/**
 * Fluxo de caixa acumulado até o mês selecionado.
 *
 * O saldo inicial permanece zero enquanto o aplicativo não tiver um campo
 * de saldo inicial configurado. Não transforma obrigações calculadas em
 * pagamentos: somente lançamentos reais alteram o caixa.
 */
export function calculateAccumulatedCash(transactions, year, month, saldoInicial = 0) {
  const opening = number(saldoInicial)

  return normalizeTransactions(transactions).reduce((saldo, tx) => {
    if (!atOrBefore(tx.data, year, month)) return saldo
    return saldo + (tx.tipo === 'receita' ? tx.valor : -tx.valor)
  }, opening)
}

/**
 * Retorna o acumulado de receitas e despesas até o período selecionado.
 * Útil para relatórios e para deixar explícita a diferença entre resultado
 * mensal e caixa acumulado.
 */
export function calculateAccumulatedFinance(transactions, year, month, saldoInicial = 0) {
  const txs = normalizeTransactions(transactions).filter((tx) => atOrBefore(tx.data, year, month))

  const receitas = txs
    .filter((tx) => tx.tipo === 'receita')
    .reduce((sum, tx) => sum + tx.valor, 0)

  const despesas = txs
    .filter((tx) => tx.tipo === 'despesa')
    .reduce((sum, tx) => sum + tx.valor, 0)

  return {
    receitas,
    despesas,
    resultado: receitas - despesas,
    saldo: number(saldoInicial) + receitas - despesas,
  }
}

/**
 * Obrigações são uma visão de competência/provisão e não caixa pago.
 * Esta função existe para manter a regra centralizada e evitar que algum
 * componente passe a descontá-las acidentalmente do saldo.
 */
export function calculateCashAfterRecordedPayments(transactions, year, month, saldoInicial = 0) {
  return calculateAccumulatedCash(transactions, year, month, saldoInicial)
}
