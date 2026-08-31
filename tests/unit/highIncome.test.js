import { describe, expect, it } from 'vitest'
import { annualProgressiveTax, calculateHighIncomeEstimate } from '../../lib/highIncome'

const inss = value => Math.min(value, 8475.55) * 0.11

describe('tributação mínima de altas rendas — 2026', () => {
  it('não enquadra abaixo de R$ 600 mil', () => {
    const result = calculateHighIncomeEstimate({
      transactions: [],
      plMap: { '2026-01': 50000 },
      year: 2026,
      calcINSS: inss,
    })
    expect(result.annualIncome).toBe(50000)
    expect(result.minimumTax).toBe(0)
    expect(result.status).toBe('fora')
  })

  it('aplica alíquota linear entre R$ 600 mil e R$ 1,2 milhão sobre a base relevante', () => {
    const result = calculateHighIncomeEstimate({
      transactions: [],
      plMap: { '2026-01': 750000 },
      year: 2026,
      calcINSS: inss,
    })
    expect(result.annualIncome).toBe(750000)
    expect(result.rate).toBeCloseTo(0.025, 10)
    expect(result.minimumTax).toBeCloseTo(18750, 2)
  })

  it('lucro anterior com transição válida não entra na base relevante, mas conta para o total de rendimentos', () => {
    const result = calculateHighIncomeEstimate({
      transactions: [{
        tipo: 'distribuicao', valor: 400000, data: '2026-01-20',
        origemLucro: 'anteriores_2025',
        aprovacaoDistribuicao: '2025-12-20',
        pagamentoPrevistoOriginal: '2026-02-20',
      }],
      plMap: { '2026-01': 250000 },
      year: 2026,
      calcINSS: inss,
    })
    expect(result.annualIncome).toBe(650000)
    expect(result.priorExempt).toBe(400000)
    expect(result.minimumBase).toBe(250000)
    expect(result.minimumTax).toBe(0)
    expect(result.status).toBe('compensado')
  })

  it('mantém IRRF PJ como crédito contra a tributação mínima', () => {
    const result = calculateHighIncomeEstimate({
      transactions: [{ tipo: 'distribuicao', valor: 60000, data: '2026-01-20', pjCnpj: '11111111000111', beneficiarioCpf: '11111111111', beneficiarioNome: 'Sócio' },
        { tipo: 'distribuicao', valor: 550000, data: '2026-01-21', pjCnpj: '11111111000111', beneficiarioCpf: '11111111111', beneficiarioNome: 'Sócio' }],
      plMap: [],
      year: 2026,
      calcINSS: inss,
    })
    expect(result.irrfPj).toBeCloseTo(61000, 2)
    expect(result.minimumBase).toBe(610000)
    expect(result.difference).toBeGreaterThanOrEqual(0)
  })

  it('usa a tabela anual de 2026 para a estimativa do IRPF regular', () => {
    expect(annualProgressiveTax(100000)).toBeCloseTo(16600.34, 2)
  })
})
