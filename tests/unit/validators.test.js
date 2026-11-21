import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, normalizeBackup, normalizeDateOnly, normalizeMonthKey, validateBackup } from '../../lib/validators'

describe('validação e backup',()=>{
 it('normaliza datas sem deslocamento',()=>{ expect(normalizeDateOnly('2026-08-18')).toBe('2026-08-18'); expect(normalizeDateOnly('2026-02-30')).toBeNull(); expect(normalizeDateOnly('2026-8-18')).toBeNull() })
 it('valida competência YYYY-MM',()=>{ expect(normalizeMonthKey('2026-08')).toBe('2026-08'); expect(normalizeMonthKey('2026-13')).toBeNull(); expect(normalizeMonthKey('08-2026')).toBeNull() })
 it('normaliza backup legado',()=>{ const b=normalizeBackup({version:3,transactions:[{id:'old',tipo:'receita',valor:1000,data:'2026-08-18',nome:'Cliente'}],favorites:[],proLaboreMap:{'2026-08':2000},contabMap:{},irrfMap:{}}); expect(b.version).toBe(BACKUP_VERSION); expect(b.schema).toBe('contabilidade-pj-backup'); expect(b.txs[0].id).toBe('old'); expect(b.plMap['2026-08']).toBe(2000) })
 it('rejeita valor inválido',()=>{ expect(()=>validateBackup({version:4,schema:'contabilidade-pj-backup',exportedAt:'2026-08-30T13:00:00.000Z',txs:[{id:'bad',tipo:'receita',valor:-1,data:'2026-08-18'}],favs:[]})).toThrow(/valor inválido/i) })
 it('rejeita versão futura',()=>{ expect(()=>validateBackup({version:BACKUP_VERSION+1,schema:'contabilidade-pj-backup',exportedAt:'2026-08-30T13:00:00.000Z',txs:[],favs:[]})).toThrow(/versão mais nova/i) })
 it('resolve IDs duplicados',()=>{ const b=normalizeBackup({version:4,schema:'contabilidade-pj-backup',exportedAt:'2026-08-30T13:00:00.000Z',txs:[{id:'same',tipo:'receita',valor:100,data:'2026-08-01'},{id:'same',tipo:'receita',valor:200,data:'2026-08-02'}],favs:[]}); expect(b.txs[0].id).toBe('same'); expect(b.txs[1].id).not.toBe('same') })

 it('preserva todos os campos fiscais ao normalizar e restaurar um backup',()=>{
   const fiscal={
     recebido:false,
     cnae:'8630-5/04',
     codigoServico:'04.12.01',
     nbs:'1.2301.23.00',
     indOp:'030102',
     descontoAtivo:true,
     descontoTipo:'percentual',
     descontoValor:'10,00',
     issMunicipal:true,
     municipioPrestacao:'Aracaju/SE',
     descricaoServico:'Prestação de serviço odontológico (8630-5/04) nos dias: 13/11/2026',
     notaGerada:true,
     numeroNota:'NF-2026-001',
     dataEmissao:'2026-11-14',
     taxaISS:'2,00',
     informadoContab:true,
   };
   const backup=normalizeBackup({
     version:BACKUP_VERSION,
     schema:'contabilidade-pj-backup',
     exportedAt:'2026-11-19T12:00:00.000Z',
     txs:[{id:'fiscal-1',tipo:'receita',valor:220,data:'2026-11-13',...fiscal}],
     favs:[],
   });
   expect(Object.fromEntries(Object.keys(fiscal).map(key=>[key,backup.txs[0][key]]))).toEqual(fiscal);
 });

 it('preserva o município da prestação e aplica Aracaju/SE em registros legados',()=>{
   const withCity=normalizeBackup({
     version:BACKUP_VERSION,
     schema:'contabilidade-pj-backup',
     exportedAt:'2026-11-21T12:00:00.000Z',
     txs:[{id:'city-1',tipo:'receita',valor:220,data:'2026-11-13',municipioPrestacao:'Nossa Senhora do Socorro/SE'}],
     favs:[],
   });
   expect(withCity.txs[0].municipioPrestacao).toBe('Nossa Senhora do Socorro/SE');
   const legacy=normalizeBackup({version:3,transactions:[{id:'city-legacy',tipo:'receita',valor:220,data:'2026-10-13'}],favorites:[]});
   expect(legacy.txs[0].municipioPrestacao).toBe('Aracaju/SE');
 });

 it('mantém compatibilidade com lançamentos antigos sem o campo recebido',()=>{
   const backup=normalizeBackup({
     version:3,
     transactions:[{id:'legacy-receita',tipo:'receita',valor:220,data:'2026-10-13'}],
     favorites:[],
   });
   // Antes da existência do campo, a interface tratava ausência como recebido.
   expect(backup.txs[0].recebido).toBe(true);
   expect(backup.txs[0].cnae).toBe('');
   expect(backup.txs[0].issMunicipal).toBe(false);
 });

 it('rejeita tipos inválidos nos novos campos fiscais',()=>{
   const base={id:'fiscal-invalid',tipo:'receita',valor:220,data:'2026-11-13'};
   const backup={version:BACKUP_VERSION,schema:'contabilidade-pj-backup',exportedAt:'2026-11-19T12:00:00.000Z',txs:[base],favs:[]};
   expect(()=>normalizeBackup({...backup,txs:[{...base,recebido:'false'}]})).toThrow(/recebido.*tipo inválido/i);
   expect(()=>normalizeBackup({...backup,txs:[{...base,issMunicipal:'true'}]})).toThrow(/issMunicipal.*tipo inválido/i);
   expect(()=>normalizeBackup({...backup,txs:[{...base,cnae:86305}]})).toThrow(/cnae.*tipo inválido/i);
 });
})
