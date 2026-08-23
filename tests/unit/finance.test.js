import { describe, expect, it } from 'vitest'
import { calculateAccumulatedCash, calculateAccumulatedFinance, calculateMonthlyFinance, normalizeTransactions } from '../../lib/finance'

const txs=[
 {id:'1',tipo:'receita',valor:1000,data:'2026-01-10'},
 {id:'2',tipo:'despesa',valor:250,data:'2026-01-20'},
 {id:'3',tipo:'receita',valor:2000,data:'2026-02-10'},
 {id:'4',tipo:'despesa',valor:500,data:'2026-02-20'},
 {id:'5',tipo:'distribuicao',valor:300,data:'2026-02-25'},
]

describe('modelo financeiro',()=>{
 it('calcula resultado mensal',()=>{ const r=calculateMonthlyFinance(txs,2026,0); expect(r.receitas).toBe(1000); expect(r.despesas).toBe(250); expect(r.resultado).toBe(750) })
 it('calcula caixa acumulado com saldo inicial',()=>{ expect(calculateAccumulatedCash(txs,2026,1,500)).toBe(2750) })
 it('separa resultado acumulado de saldo inicial',()=>{ const r=calculateAccumulatedFinance(txs,2026,1,500); expect(r.receitas).toBe(3000); expect(r.despesas).toBe(750); expect(r.resultado).toBe(2250); expect(r.saldo).toBe(2750) })
 it('não trata distribuição de lucros como despesa',()=>{ const r=calculateMonthlyFinance([...txs,{id:'5',tipo:'distribuicao',valor:300,data:'2026-02-25'}],2026,1); expect(r.receitas).toBe(2000); expect(r.despesas).toBe(500); expect(r.distribuicoes).toBe(300); expect(r.resultado).toBe(1500) })
 it('descarta lançamentos inválidos',()=>{ const r=normalizeTransactions([...txs,{id:'x',tipo:'receita',valor:-10,data:'2026-02-01'},{id:'y',tipo:'receita',valor:100,data:'invalida'},{id:'z',tipo:'outro',valor:100,data:'2026-02-01'}]); expect(r).toHaveLength(5) })
})
