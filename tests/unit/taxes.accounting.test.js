import { describe, expect, it } from 'vitest'
import { calcRecommendedPL, SALARIO_MINIMO_2026 } from '../../lib/taxes'

const receita = (data, valor, id = data) => ({
  id,
  tipo: 'receita',
  valor,
  data,
})

describe('Pró-labore — metodologia da contabilidade', () => {
  it('abril: respeita o salário mínimo de 2026', () => {
    const txs = [receita('2026-04-15', 3500)]
    expect(calcRecommendedPL(txs, {}, 2026, 3)).toBe(SALARIO_MINIMO_2026)
  })

  it('maio: reproduz exatamente R$ 4.233,24', () => {
    const txs = [
      receita('2026-04-15', 3500),
      receita('2026-05-15', 17408),
    ]
    const pl = { '2026-04': 1621 }

    expect(calcRecommendedPL(txs, pl, 2026, 4)).toBe(4233.24)
  })

  it('junho: reproduz a metodologia com o faturamento real de R$ 21.012,90', () => {
    const txs = [
      receita('2026-04-15', 3500),
      receita('2026-05-15', 17408),
      receita('2026-06-15', 21012.90),
    ]
    const pl = {
      '2026-04': 1621,
      '2026-05': 4233.24,
    }

    // (3.500 + 17.408 + 21.012,90) × 28% − (1.621 + 4.233,24)
    // = R$ 5.883,61.
    expect(calcRecommendedPL(txs, pl, 2026, 5)).toBe(5883.61)
  })
})
