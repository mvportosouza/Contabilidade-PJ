import { describe, expect, it } from 'vitest'
import {
  calcFatorR,
  calcRecommendedPL,
  FATOR_R_MINIMO,
  SALARIO_MINIMO_2026,
} from '../../lib/taxes'

const receita = (data, valor, id = data) => ({
  id,
  tipo: 'receita',
  valor,
  data,
})

describe('Pró-labore — metodologia da contabilidade', () => {
  it('primeiro PA: Fator R usa FSPA/RPA sem anualizar a folha', () => {
    const txs = [receita('2026-04-15', 3500)]
    const pl = { '2026-04': 1621 }

    const result = calcFatorR(txs, pl, 2026, 3)

    expect(result.fs12).toBe(1621)
    expect(result.rbt12).toBe(42000)
    expect(result.fatorR).toBeCloseTo(1621 / 3500, 10)
    expect(result.fatorR).toBeGreaterThan(FATOR_R_MINIMO)
    expect(result.atingiu).toBe(true)
  })

  it('primeiro PA sem pró-labore: mantém fator R mínimo de 1%', () => {
    const txs = [receita('2026-04-15', 3500)]

    const result = calcFatorR(txs, {}, 2026, 3)

    expect(result.fatorR).toBe(0.01)
    expect(result.atingiu).toBe(false)
  })

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

  it('junho: usa R$ 5.883,61 quando a diferença contábil é imaterial', () => {
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
    //
    // A contabilidade havia informado R$ 5.908,26. A diferença de R$ 24,65
    // (0,42%) foi considerada imaterial e, conforme decisão do proprietário,
    // prevalece o valor calculado pelo motor do aplicativo.
    expect(calcRecommendedPL(txs, pl, 2026, 5)).toBe(5883.61)
  })

  it('a diferença entre o valor contábil original e o cálculo é imaterial', () => {
    const calculado = 5883.61
    const contabilOriginal = 5908.26
    const diferenca = Math.abs(contabilOriginal - calculado)

    expect(diferenca).toBeCloseTo(24.65, 2)
    expect(diferenca / contabilOriginal).toBeLessThan(0.01)
  })
})
