import { describe, expect, it } from 'vitest'
import { calculateDividendGroup, calculateMonthlyDividends, dividendEfdReinfRows } from '../../lib/dividends'

const tx = (id, valor, data='2026-08-10', extra={}) => ({
  id, tipo:'distribuicao', valor, data,
  beneficiarioNome:'Marcus', beneficiarioCpf:'12345678901',
  pjCnpj:'66145009000107', origemLucro:'apurados_2026', ...extra,
})

describe('Lote 04 — lucros e dividendos 2026', () => {
  it('acumula por PJ + beneficiário + mês', () => {
    const groups = calculateMonthlyDividends([
      tx('1', 30000), tx('2', 19000),
      tx('3', 5000, '2026-08-20', { beneficiarioNome:'Outro', beneficiarioCpf:'98765432100' }),
      tx('4', 90000, '2026-08-10', { pjCnpj:'11222333000199' }),
    ], 2026, 7)
    const marcus = groups.find(g => g.beneficiarioCpf === '12345678901' && g.pjCnpj === '66145009000107')
    expect(marcus.total).toBe(49000)
    expect(marcus.remaining).toBe(1000)
    expect(marcus.irrf).toBe(0)
  })

  it('acima de R$ 50 mil, retém 10% sobre o total sujeito', () => {
    const result = calculateDividendGroup([tx('1', 30000), tx('2', 21001)], {year:2026, month:7, pjCnpj:'66145009000107', beneficiarioCpf:'12345678901'})
    expect(result.taxableTotal).toBe(51001)
    expect(result.irrf).toBeCloseTo(5100.1, 10)
    expect(result.liquid).toBeCloseTo(45900.9, 10)
  })

  it('R$ 50 mil exatos não gera retenção', () => {
    const result = calculateDividendGroup([tx('1', 50000)], {year:2026, month:7, pjCnpj:'66145009000107', beneficiarioCpf:'12345678901'})
    expect(result.irrf).toBe(0)
    expect(result.status).toBe('limite')
  })

  it('separa lucros anteriores a 2026', () => {
    const result = calculateDividendGroup([
      tx('1', 60000, '2026-08-10', { origemLucro:'anteriores_2025', aprovacaoDistribuicao:'2025-12-20', pagamentoPrevistoOriginal:'2026-12-20' }),
      tx('2', 10000),
    ], {year:2026, month:7, pjCnpj:'66145009000107', beneficiarioCpf:'12345678901'})
    expect(result.priorTotal).toBe(60000)
    expect(result.taxableTotal).toBe(10000)
    expect(result.irrf).toBe(0)
  })

  it('prepara R-4010 com natureza 12001 e isenção 12', () => {
    const rows = dividendEfdReinfRows([
      tx('1', 60000, '2026-08-10', { origemLucro:'anteriores_2025', aprovacaoDistribuicao:'2025-12-20', pagamentoPrevistoOriginal:'2026-12-20' }),
    ], 2026, 7)
    expect(rows[0].event).toBe('R-4010')
    expect(rows[0].natureCode).toBe('12001')
    expect(rows[0].exemptionType).toBe('12')
    expect(rows[0].grossAmount).toBe(60000)
  })
})
