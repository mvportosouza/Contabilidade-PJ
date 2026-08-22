import { describe, expect, it } from 'vitest'
import { ACCOUNTING_PL_BY_MONTH } from '../../lib/accounting'

describe('valores de pró-labore da contabilidade', () => {
  it('mantém os quatro PAs informados para 2026', () => {
    expect(ACCOUNTING_PL_BY_MONTH).toEqual({
      '2026-04': 1621,
      '2026-05': 4233.24,
      '2026-06': 5908.26,
      '2026-07': 6266.4,
    })
  })
})
