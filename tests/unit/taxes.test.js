import { describe, expect, it } from 'vitest'
import { calcDAS, calcIRRF, calcINSS, calcRBT12, calcRecommendedPL, calcTributacao, FATOR_R_MINIMO, SALARIO_MINIMO_2026, INSS_TETO_2026 } from '../../lib/taxes'

const tx = (data, valor=10000, id=data) => ({ id, tipo:'receita', valor, data })
const months = (y,m,count) => Array.from({length:count},(_,i)=>{ const d=new Date(y,m+i,15); return d.toISOString().slice(0,10) })

describe('RBT12',()=>{
 it('anualiza o primeiro mês',()=>{ const r=calcRBT12([tx('2026-01-15')],2026,0); expect(r.rbt12).toBe(120000); expect(r.periodo).toBe('primeiro_mes') })
 it('anualiza pela média nos primeiros 12 meses',()=>{ const r=calcRBT12(months(2026,0,3).map(d=>tx(d)),2026,2); expect(r.rbt12).toBe(120000); expect(r.periodo).toBe('inicio_atividade') })
 it('usa os 12 meses anteriores a partir do 13º mês',()=>{ const r=calcRBT12(months(2025,0,13).map(d=>tx(d)),2026,0); expect(r.rbt12).toBe(120000); expect(r.periodo).toBe('normal') })
})

describe('Anexo III/V e Fator R',()=>{
 const txs=months(2025,0,13).map(d=>tx(d))
 it('usa V abaixo de 28%',()=>{ const r=calcTributacao(txs,{},2026,0,10000); expect(r.fatorR).toBeLessThan(FATOR_R_MINIMO); expect(r.anexo).toBe('V') })
 it('usa III quando o Fator R atinge 28%',()=>{ const pl={}; months(2025,0,12).forEach(d=>pl[d.slice(0,7)]=3000); const r=calcTributacao(txs,pl,2026,0,10000); expect(r.fatorR).toBeGreaterThanOrEqual(FATOR_R_MINIMO); expect(r.anexo).toBe('III') })
 it('calcula primeira faixa do III',()=>{ const r=calcDAS(120000,10000,{anexo:'III'}); expect(r.aliquota).toBeCloseTo(.06,10); expect(r.valor).toBe(600) })
 it('calcula primeira faixa do V',()=>{ const r=calcDAS(120000,10000,{anexo:'V'}); expect(r.aliquota).toBeCloseTo(.155,10); expect(r.valor).toBe(1550) })
})

describe('pró-labore, INSS e IRRF',()=>{
 it('não recomenda abaixo do salário mínimo 2026',()=>{ expect(calcRecommendedPL([tx('2026-01-15',1000)],{},2026,0)).toBeGreaterThanOrEqual(SALARIO_MINIMO_2026) })
 it('limita INSS ao teto',()=>{ expect(calcINSS(INSS_TETO_2026*2)).toBeCloseTo(INSS_TETO_2026*.11,2) })
 it('não gera IRRF até R$ 5.000',()=>{ expect(calcIRRF(5000).valor).toBe(0) })
 it('aplica a redução de 2026 ao pró-labore acima de R$ 5.000',()=>{
   const r=calcIRRF(5220.07, { inss: 574.21 });
   expect(r.valor).toBe(78.81);
   expect(r.reducao).toBe(283.59);
 })
 it('não aplica a redução de 2026 a partir de R$ 7.350',()=>{
   const r=calcIRRF(7350, { inss: 808.50 });
   expect(r.reducao).toBe(0);
 })
 it('nunca retorna base ou imposto negativos',()=>{ const r=calcIRRF(2000); expect(r.base).toBeGreaterThanOrEqual(0); expect(r.valor).toBeGreaterThanOrEqual(0) })
})
