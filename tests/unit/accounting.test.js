import { describe, expect, it } from 'vitest'
import { ACCOUNTING_PL_BY_MONTH, reconcileLegacyAccountingPL } from '../../lib/accounting'

describe('valores de pró-labore da contabilidade', () => {
  it('mantém os quatro PAs de referência para 2026', () => {
    expect(ACCOUNTING_PL_BY_MONTH).toEqual({
      '2026-04': 1621,
      '2026-05': 4233.24,
      '2026-06': 5883.61,
      '2026-07': 6266.4,
    })
  })
})


describe('Conciliação do pró-labore legado', () => {
  it('migra o conjunto original semeado para o valor conciliado de junho', () => {
    const legacy = {
      '2026-04': 1621,
      '2026-05': 4233.24,
      '2026-06': 5908.26,
      '2026-07': 6266.4,
    }

    expect(reconcileLegacyAccountingPL(legacy)).toEqual({
      ...legacy,
      '2026-06': 5883.61,
    })
  })

  it('não altera dados quando há qualquer override diferente do conjunto legado', () => {
    const manual = {
      '2026-04': 1621,
      '2026-05': 4233.24,
      '2026-06': 6000,
      '2026-07': 6266.4,
    }

    expect(reconcileLegacyAccountingPL(manual)).toEqual(manual)
  })
})
