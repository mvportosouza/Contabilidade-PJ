import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, normalizeBackup, normalizeDateOnly, normalizeMonthKey, validateBackup } from '../../lib/validators'

describe('validação e backup',()=>{
 it('normaliza datas sem deslocamento',()=>{ expect(normalizeDateOnly('2026-08-18')).toBe('2026-08-18'); expect(normalizeDateOnly('2026-02-30')).toBeNull(); expect(normalizeDateOnly('2026-8-18')).toBeNull() })
 it('valida competência YYYY-MM',()=>{ expect(normalizeMonthKey('2026-08')).toBe('2026-08'); expect(normalizeMonthKey('2026-13')).toBeNull(); expect(normalizeMonthKey('08-2026')).toBeNull() })
 it('normaliza backup legado',()=>{ const b=normalizeBackup({version:3,transactions:[{id:'old',tipo:'receita',valor:1000,data:'2026-08-18',nome:'Cliente'}],favorites:[],proLaboreMap:{'2026-08':2000},contabMap:{},irrfMap:{}}); expect(b.version).toBe(BACKUP_VERSION); expect(b.schema).toBe('contabilidade-pj-backup'); expect(b.txs[0].id).toBe('old'); expect(b.plMap['2026-08']).toBe(2000) })
 it('rejeita valor inválido',()=>{ expect(()=>validateBackup({version:4,txs:[{id:'bad',tipo:'receita',valor:-1,data:'2026-08-18'}],favs:[]})).toThrow(/valor inválido/i) })
 it('rejeita versão futura',()=>{ expect(()=>validateBackup({version:BACKUP_VERSION+1,txs:[],favs:[]})).toThrow(/versão mais nova/i) })
 it('resolve IDs duplicados',()=>{ const b=normalizeBackup({version:4,txs:[{id:'same',tipo:'receita',valor:100,data:'2026-08-01'},{id:'same',tipo:'receita',valor:200,data:'2026-08-02'}],favs:[]}); expect(b.txs[0].id).toBe('same'); expect(b.txs[1].id).not.toBe('same') })
})
