import { describe, expect, it } from 'vitest'
import { getAnnualStatistics } from '../../lib/statistics'

describe('estatísticas anuais', () => {
  const txs = [
    {tipo:'receita', valor:1000, data:'2026-01-10'},
    {tipo:'despesa', valor:250, data:'2026-01-20'},
    {tipo:'distribuicao', valor:100, data:'2026-01-25'},
    {tipo:'receita', valor:2000, data:'2026-02-10'},
  ]
  const calcIRRF = () => ({valor: 10})
  const calcTributacao = () => ({das: 60})

  it('separa distribuição de lucros das despesas e mantém 12 meses', () => {
    const rows = getAnnualStatistics(txs, {'2026-01':500}, {}, 2026, calcIRRF, calcTributacao)
    expect(rows).toHaveLength(12)
    expect(rows[0].receita).toBe(1000)
    expect(rows[0].despesa).toBe(250)
    expect(rows[0].distribuicao).toBe(100)
    expect(rows[0].lucro).toBe(750)
    expect(rows[0].impostos).toBe(10 + 60 + 55)
    expect(rows[1].receita).toBe(2000)
    expect(rows[2].ativo).toBe(false)
  })
})
