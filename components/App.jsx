'use client';

import { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import { sGet, sSet, syncPendingChanges } from '../lib/storage';
import { calcDAS, calcFatorR, calcINSS, calcIRRF, calcRBT12, calcRecommendedPL, SALARIO_MINIMO_2026, INSS_TETO_2026 } from '../lib/taxes';
import { BACKUP_VERSION, cryptoId, normalizeAsset, normalizePayable, normalizeReceivable, normalizeTransaction, safeArray, safeMap, validateBackup } from '../lib/validators';
import LoadingScreen from './LoadingScreen';

const C = {
  bg: '#F2F0ED', card: '#FFFFFF', navy: '#0F1E35', navyMid: '#1A3055', navyLight: '#E8EEF5',
  gold: '#C8A96E', green: '#277A4A', greenLight: '#EBF5EE', red: '#C0392B', redLight: '#FFF0EE',
  orange: '#C97822', orangeLight: '#FFF6E8', text: '#27364A', muted: '#7A8491', border: '#E3DED7'
};
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const EXPENSE_CATEGORIES = ['DAS','Pró-Labore','Distribuição de Lucros','INSS','Taxa','Imposto','Conta','Contabilidade','Escritório Virtual','Material','Equipamento','Outros'];
const RECEIPT_CATEGORIES = ['Recebimento de Clientes','Estorno'];
const COLORS = ['#1A3055','#C8A96E','#277A4A','#C97822','#7A8491','#8E44AD'];

function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function parseBRL(value) {
  if (typeof value === 'number') return value;
  const s = String(value || '').replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function moneyInput(v) {
  if (v === '' || v === null || v === undefined) return '';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function today() { return new Date().toISOString().slice(0, 10); }
function monthKey(y, m) { return `${y}-${String(m + 1).padStart(2, '0')}`; }
function dateLabel(value) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—'; }
function daysUntil(value) { if (!value) return null; const a = new Date(`${today()}T12:00:00`); const b = new Date(`${value}T12:00:00`); return Math.round((b - a) / 86400000); }
function dueStatus(date, paid) { if (paid) return 'pago'; const d = daysUntil(date); if (d === null) return 'pendente'; if (d < 0) return 'vencido'; if (d <= 7) return 'proximo'; return 'pendente'; }

function Card({ children, style }) { return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: 16, ...style }}>{children}</div>; }
function Label({ children }) { return <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{children}</div>; }
function Button({ children, onClick, kind = 'primary', disabled = false, style }) {
  const styles = {
    primary: { background: `linear-gradient(135deg,${C.navy},${C.navyMid})`, color: '#fff' },
    danger: { background: C.red, color: '#fff' },
    soft: { background: C.navyLight, color: C.navyMid },
    green: { background: C.greenLight, color: C.green },
    neutral: { background: '#F4F2EF', color: C.text },
  };
  return <button disabled={disabled} onClick={onClick} style={{ border: 0, borderRadius: 12, padding: '11px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .5 : 1, ...styles[kind], ...style }}>{children}</button>;
}
function Input({ label, value, onChange, type = 'text', placeholder, inputMode }) {
  return <label style={{ display: 'block', marginBottom: 12 }}><span style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5 }}>{label}</span><input type={type} value={value ?? ''} onChange={onChange} placeholder={placeholder} inputMode={inputMode} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 12px', background: '#fff', color: C.text, outline: 'none', fontFamily: 'inherit', fontSize: 13 }} /></label>;
}
function Select({ label, value, onChange, options }) { return <label style={{ display: 'block', marginBottom: 12 }}><span style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5 }}>{label}</span><select value={value ?? ''} onChange={onChange} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 12px', background: '#fff', color: C.text, fontFamily: 'inherit', fontSize: 13 }}>{options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}</select></label>; }
function Modal({ title, children, onClose, wide = false }) { return <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,30,53,.42)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onMouseDown={onClose}><div onMouseDown={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: wide ? 620 : 430, maxHeight: '92vh', overflow: 'auto', background: '#fff', borderRadius: '24px 24px 0 0', padding: 20, boxSizing: 'border-box' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><h2 style={{ margin: 0, color: C.navy, fontSize: 19 }}>{title}</h2><button onClick={onClose} style={{ border: 0, background: '#F3F1EE', borderRadius: 10, width: 34, height: 34, cursor: 'pointer' }}>✕</button></div>{children}</div></div>; }
function StatusPill({ status }) { const map = { pago: ['Pago', C.green, C.greenLight], recebido: ['Recebido', C.green, C.greenLight], vencido: ['Vencido', C.red, C.redLight], proximo: ['Próximo', C.orange, C.orangeLight], pendente: ['Pendente', C.muted, '#F1F1F1'], aberto: ['Aberto', C.orange, C.orangeLight] }; const x = map[status] || map.pendente; return <span style={{ display: 'inline-block', padding: '5px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, color: x[1], background: x[2] }}>{x[0]}</span>; }
function Empty({ title, text, action }) { return <Card style={{ textAlign: 'center', padding: 28 }}><div style={{ fontSize: 30, marginBottom: 8 }}>◌</div><div style={{ color: C.navy, fontWeight: 700 }}>{title}</div><div style={{ color: C.muted, fontSize: 12, margin: '6px 0 14px', lineHeight: 1.5 }}>{text}</div>{action}</Card>; }

export default function App() {
  const now = new Date();
  const [tab, setTab] = useState('dashboard');
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [toast, setToast] = useState(null);
  const [txs, setTxs] = useState([]);
  const [favs, setFavs] = useState([]);
  const [plMap, setPlMap] = useState({});
  const [plManual, setPlManual] = useState({});
  const [ctbMap, setCtbMap] = useState({});
  const [irrfMap, setIrrfMap] = useState({});
  const [payables, setPayables] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [assets, setAssets] = useState([]);
  const [settings, setSettings] = useState({ dependentes: 0, pensao: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [hideValues, setHideValues] = useState(false);

  const notify = (msg, type = 'ok') => { setToast({ msg, type }); window.clearTimeout(window.__pjToast); window.__pjToast = window.setTimeout(() => setToast(null), 2800); };

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline); window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [a,b,c,d,e,f,g,h,i,j] = await Promise.all([
          sGet('pj_tx2'), sGet('pj_favs2'), sGet('pj_pl'), sGet('pj_plm'), sGet('pj_ctb'), sGet('pj_irrf'),
          sGet('pj_payables'), sGet('pj_receivables'), sGet('pj_assets'), sGet('pj_settings')
        ]);
        setTxs(safeArray(a).map(normalizeTransaction)); setFavs(safeArray(b)); setPlMap(safeMap(c)); setPlManual(safeMap(d)); setCtbMap(safeMap(e)); setIrrfMap(safeMap(f));
        setPayables(safeArray(g).map(normalizePayable)); setReceivables(safeArray(h).map(normalizeReceivable)); setAssets(safeArray(i).map(normalizeAsset)); setSettings({ dependentes: Number(j?.dependentes || 0), pensao: Number(j?.pensao || 0) });
      } catch (error) { notify('Não foi possível carregar todos os dados.', 'err'); }
      finally { setLoading(false); }
    })();
  }, []);

  const save = async (key, value, setter) => { setter(value); await sSet(key, value); };
  const monthTxs = useMemo(() => txs.filter((t) => { const d = new Date(`${t.data}T12:00:00`); return d.getFullYear() === year && d.getMonth() === month; }), [txs, year, month]);
  const receitas = useMemo(() => monthTxs.filter((t) => t.tipo === 'receita').reduce((s,t) => s + Number(t.valor || 0), 0), [monthTxs]);
  const despesas = useMemo(() => monthTxs.filter((t) => t.tipo === 'despesa').reduce((s,t) => s + Number(t.valor || 0), 0), [monthTxs]);
  const resultado = receitas - despesas;
  const rbt = useMemo(() => calcRBT12(txs, year, month), [txs, year, month]);
  const das = useMemo(() => calcDAS(rbt.rbt12 || rbt.rbt12Anualizado, receitas), [rbt, receitas]);
  const autoPL = useMemo(() => calcRecommendedPL(txs, plMap, year, month), [txs, plMap, year, month]);
  const key = monthKey(year, month);
  const pl = Number(plMap[key] || autoPL);
  const inss = calcINSS(pl);
  const irrf = calcIRRF(pl, { inss, dependentes: settings.dependentes, pensao: settings.pensao });
  const irrfEf = Number(irrfMap[key] || irrf.valor);
  const ctb = Number(ctbMap[key] || 0);
  const fator = useMemo(() => calcFatorR(txs, plMap, year, month), [txs, plMap, year, month]);
  const totalObrig = das.valor + inss + irrfEf + ctb;
  const saldo = useMemo(() => txs.reduce((s,t) => { const d = new Date(`${t.data}T12:00:00`); const cur = new Date(year, month, 1); return d <= new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23,59,59) ? s + (t.tipo === 'receita' ? t.valor : -t.valor) : s; }, 0), [txs, year, month]);
  const pendingPayables = payables.filter((p) => !p.paidAt);
  const overduePayables = pendingPayables.filter((p) => dueStatus(p.dueDate, p.paidAt) === 'vencido');
  const openReceivables = receivables.filter((r) => !r.receivedAt);
  const overdueReceivables = openReceivables.filter((r) => dueStatus(r.dueDate, r.receivedAt) === 'vencido');
  const assetBook = assets.filter(a => a.active).reduce((sum,a) => sum + assetBookValue(a), 0);

  function commitTx(tx) { const normalized = normalizeTransaction(tx); const next = txs.some(x => x.id === normalized.id) ? txs.map(x => x.id === normalized.id ? normalized : x) : [normalized, ...txs]; save('pj_tx2', next, setTxs); if (tx.saveAsFav) { const fav = { id: cryptoId(), tipo: normalized.tipo, nome: normalized.nome || normalized.categoria, categoria: normalized.categoria, cnpj: normalized.cnpj, telefone: normalized.telefone, email: normalized.email, especialidade: normalized.especialidade }; const favNext = favs.some(x => x.tipo === fav.tipo && x.nome === fav.nome) ? favs.map(x => x.tipo === fav.tipo && x.nome === fav.nome ? { ...x, ...fav } : x) : [fav, ...favs]; save('pj_favs2', favNext, setFavs); } setModal(null); notify('Lançamento salvo.'); }
  function removeTx(id) { const item = txs.find(x => x.id === id); if (!item) return; if (!window.confirm(`Excluir ${item.tipo === 'receita' ? 'receita' : 'despesa'} de ${brl(item.valor)}?`)) return; const next = txs.filter(x => x.id !== id); save('pj_tx2', next, setTxs); notify('Lançamento excluído.'); }
  function commitPayable(item) { const n = normalizePayable(item); const next = payables.some(x=>x.id===n.id) ? payables.map(x=>x.id===n.id?n:x) : [n,...payables]; save('pj_payables', next, setPayables); setModal(null); notify('Conta a pagar salva.'); }
  function commitReceivable(item) { const n = normalizeReceivable(item); const next = receivables.some(x=>x.id===n.id) ? receivables.map(x=>x.id===n.id?n:x) : [n,...receivables]; save('pj_receivables', next, setReceivables); setModal(null); notify('Conta a receber salva.'); }
  function commitAsset(item) { const n = normalizeAsset(item); const next = assets.some(x=>x.id===n.id) ? assets.map(x=>x.id===n.id?n:x) : [n,...assets]; save('pj_assets', next, setAssets); setModal(null); notify('Patrimônio salvo.'); }
  function markPayablePaid(item) { commitPayable({ ...item, paidAt: item.paidAt || today(), status: 'pago' }); }
  function markReceivableReceived(item) { commitReceivable({ ...item, receivedAt: item.receivedAt || today(), status: 'recebido' }); }

  function exportBackup() {
    const payload = { version: BACKUP_VERSION, app: 'Contabilidade PJ', exportedAt: new Date().toISOString(), txs, favs, plMap, plManual, ctbMap, irrfMap, payables, receivables, assets, settings };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `contabilidade-pj-backup-${today()}.json`; a.click(); URL.revokeObjectURL(url); notify('Backup gerado.');
  }
  async function importBackup(file) {
    try {
      const text = await file.text(); const data = JSON.parse(text); validateBackup(data);
      const nextTx = safeArray(data.txs || data.transactions).map(normalizeTransaction); const nextFav = safeArray(data.favs || data.favorites);
      const nextPl = safeMap(data.plMap || data.proLaboreMap); const nextPlm = safeMap(data.plManual); const nextCtb = safeMap(data.ctbMap || data.contabMap); const nextIrrf = safeMap(data.irrfMap);
      const nextPay = safeArray(data.payables).map(normalizePayable); const nextRec = safeArray(data.receivables).map(normalizeReceivable); const nextAssets = safeArray(data.assets).map(normalizeAsset);
      if (!window.confirm('Restaurar este backup? Os dados atuais serão substituídos.')) return;
      await Promise.all([save('pj_tx2',nextTx,setTxs),save('pj_favs2',nextFav,setFavs),save('pj_pl',nextPl,setPlMap),save('pj_plm',nextPlm,setPlManual),save('pj_ctb',nextCtb,setCtbMap),save('pj_irrf',nextIrrf,setIrrfMap),save('pj_payables',nextPay,setPayables),save('pj_receivables',nextRec,setReceivables),save('pj_assets',nextAssets,setAssets),save('pj_settings',data.settings || settings,setSettings)]);
      setShowSettings(false); notify('Backup restaurado com sucesso.');
    } catch (error) { notify(error?.message || 'Backup inválido.', 'err'); }
  }

  async function updateTaxField(field, value) {
    const v = parseBRL(value); const map = field === 'pl' ? { ...plMap, [key]: v } : field === 'ctb' ? { ...ctbMap, [key]: v } : { ...irrfMap, [key]: v };
    if (field === 'pl') await save('pj_pl', map, setPlMap); if (field === 'ctb') await save('pj_ctb', map, setCtbMap); if (field === 'irrf') await save('pj_irrf', map, setIrrfMap); notify('Valor tributário salvo.');
  }

  if (loading) return <LoadingScreen />;

  return <div style={{ minHeight:'100vh', maxWidth: 460, margin:'0 auto', background:C.bg, color:C.text, fontFamily:'Georgia,serif', position:'relative' }}>
    <header style={{ position:'sticky', top:0, zIndex:30, background:'rgba(242,240,237,.96)', backdropFilter:'blur(14px)', padding:'14px 16px 10px', borderBottom:`1px solid ${C.border}` }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div><div style={{ fontSize:10, letterSpacing:'.12em', color:C.gold, fontWeight:800 }}>CONTABILIDADE</div><div style={{ fontSize:21, color:C.navy, fontWeight:800 }}>PJ</div></div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}><span title={online?'Online':'Offline'} style={{ width:8,height:8,borderRadius:99,background:online?C.green:C.orange,display:'inline-block' }} /><button onClick={()=>setHideValues(v=>!v)} style={{ border:0, background:'#fff', borderRadius:10, padding:'8px 10px', cursor:'pointer' }}>{hideValues?'👁':'◉'}</button><button onClick={()=>setShowSettings(true)} style={{ border:0, background:'#fff', borderRadius:10, padding:'8px 10px', cursor:'pointer' }}>⚙️</button></div>
      </div>
      <div style={{ display:'flex', gap:6, marginTop:10 }}><button onClick={()=>setYear(y=>y-1)} style={yearBtn}>‹</button><div style={{ flex:1,textAlign:'center',fontSize:13,fontWeight:800,color:C.navy }}>{MONTHS[month]} {year}</div><button onClick={()=>setYear(y=>y+1)} style={yearBtn}>›</button></div>
    </header>

    <main style={{ padding:'14px 14px 92px' }}>
      {tab === 'dashboard' && <Dashboard {...{receitas,despesas,resultado,saldo,brl,hideValues,das,rbt,pl,inss,irrf,irrfEf,ctb,totalObrig,fator,pendingPayables,overduePayables,openReceivables,overdueReceivables,assetBook,monthTxs, setTab, setModal, notify}} />}
      {tab === 'lancamentos' && <TransactionsTab {...{monthTxs,receitas,despesas,resultado,brl,search,setSearch,filter,setFilter,setModal,removeTx}} />}
      {tab === 'financeiro' && <FinanceTab {...{payables,receivables,brl,setModal,markPayablePaid,markReceivableReceived,notify}} />}
      {tab === 'patrimonio' && <AssetsTab {...{assets,brl,setModal,assetBookValue}} />}
      {tab === 'anual' && <AnnualTab {...{txs,plMap,irrfMap,year,brl,hideValues}} />}
      {tab === 'mais' && <MoreTab {...{setTab,setModal,setShowSettings,exportBackup,importBackup,settings,setSettings,updateTaxField,pl,autoPL,inss,irrf,ctb,das,rbt,fator,brl,key}} />}
      {tab === 'estatistica' && <StatsTab {...{monthTxs,receitas,despesas,brl,hideValues}} />}
      {tab === 'favoritos' && <FavoritesTab {...{favs,setModal,save,txs,setTxs}} />}
    </main>

    <nav style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:460, background:'rgba(255,255,255,.97)', borderTop:`1px solid ${C.border}`, display:'grid', gridTemplateColumns:'repeat(5,1fr)', padding:'7px 4px 12px', zIndex:40 }}>
      {[['dashboard','⌂','Início'],['lancamentos','≡','Lançamentos'],['financeiro','▣','Financeiro'],['patrimonio','◆','Patrimônio'],['mais','•••','Mais']].map(([id,icon,label])=><button key={id} onClick={()=>setTab(id)} style={{ border:0,background:'none',color:tab===id?C.navyMid:'#9AA1A9',fontFamily:'inherit',fontSize:10,fontWeight:tab===id?800:500,cursor:'pointer' }}><div style={{fontSize:19,lineHeight:1.1,marginBottom:3}}>{icon}</div>{label}</button>)}
    </nav>

    {!online && <div style={{ position:'fixed', bottom:74, left:'50%', transform:'translateX(-50%)', zIndex:45, background:C.orange, color:'#fff', padding:'8px 12px', borderRadius:999, fontSize:11, fontWeight:700 }}>⚠️ Offline — alterações serão sincronizadas depois</div>}
    {toast && <div style={{ position:'fixed', top:76, left:'50%', transform:'translateX(-50%)', zIndex:120, maxWidth:'calc(100% - 32px)', background:toast.type==='err'?C.red:C.navy, color:'#fff', padding:'10px 14px', borderRadius:12, fontSize:12, fontWeight:700, boxShadow:'0 8px 25px rgba(0,0,0,.2)' }}>{toast.msg}</div>}

    {modal?.type === 'tx' && <TransactionModal {...{item:modal.item,onClose:()=>setModal(null),onSave:commitTx,favs}} />}
    {modal?.type === 'payable' && <PayableModal {...{item:modal.item,onClose:()=>setModal(null),onSave:commitPayable}} />}
    {modal?.type === 'receivable' && <ReceivableModal {...{item:modal.item,onClose:()=>setModal(null),onSave:commitReceivable}} />}
    {modal?.type === 'asset' && <AssetModal {...{item:modal.item,onClose:()=>setModal(null),onSave:commitAsset}} />}
    {modal?.type === 'fav' && <FavoriteModal {...{item:modal.item,onClose:()=>setModal(null),onSave:async(item)=>{const n={...item,id:item.id||cryptoId()};const next=favs.some(x=>x.id===n.id)?favs.map(x=>x.id===n.id?n:x):[n,...favs];await save('pj_favs2',next,setFavs);setModal(null);notify('Favorito salvo.')}}} />}
    {showSettings && <SettingsModal {...{onClose:()=>setShowSettings(false),exportBackup,importBackup,online,settings,setSettings,save,notify}} />}
  </div>;
}

const yearBtn = { border:0,background:'#fff',borderRadius:10,width:34,height:30,cursor:'pointer',color:C.navy,fontWeight:800 };
function val(v, hide) { return hide ? 'R$ ···' : brl(v); }
function assetBookValue(a) { const cost=Math.max(0,Number(a.acquisitionValue||0)); const residual=Math.min(cost,Math.max(0,Number(a.residualValue||0))); const life=Math.max(0,Number(a.usefulLifeYears||0)); if(!a.active||!a.acquisitionDate||!life) return cost; const age=Math.max(0,(new Date()-new Date(`${a.acquisitionDate}T12:00:00`))/31557600000); return Math.max(residual,cost-Math.min(age,life)*((cost-residual)/life)); }

function Dashboard(p) {
  const chart=[{name:'Receitas',value:p.receitas},{name:'Despesas',value:p.despesas}];
  return <>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}><Card><Label>Receita</Label><div style={big}>{val(p.receitas,p.hideValues)}</div></Card><Card><Label>Resultado</Label><div style={{...big,color:p.resultado>=0?C.green:C.red}}>{val(p.resultado,p.hideValues)}</div></Card></div>
    <Card style={{marginBottom:10}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><Label>Saldo acumulado</Label><div style={big}>{val(p.saldo,p.hideValues)}</div></div><div style={{width:120,height:80}}><ResponsiveContainer><BarChart data={chart}><Bar dataKey="value" radius={[5,5,0,0]} fill={C.navyMid}/><XAxis dataKey="name" hide/><YAxis hide/><Tooltip formatter={(v)=>brl(v)}/></BarChart></ResponsiveContainer></div></div></Card>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
      <Card><Label>DAS</Label><div style={money}>{brl(p.das.valor)}</div><div style={sub}>{(p.das.aliquota*100).toFixed(2)}% efetiva</div></Card>
      <Card><Label>Fator R</Label><div style={{...money,color:p.fator.atingiu?C.green:C.orange}}>{(p.fator.fatorR*100).toFixed(2)}%</div><div style={sub}>{p.fator.atingiu?'Anexo III atingido':'Abaixo de 28%'}</div></Card>
    </div>
    <Card style={{marginBottom:10}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><Label>Obrigações do mês</Label><div style={money}>{brl(p.totalObrig)}</div><div style={sub}>DAS + INSS + IRRF + contabilidade</div></div><button onClick={()=>p.setTab('mais')} style={linkBtn}>Ver tributação ›</button></div></Card>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:10}}>
      <Quick title="A pagar" value={p.pendingPayables.length} danger={p.overduePayables.length>0} onClick={()=>p.setTab('financeiro')} /><Quick title="A receber" value={p.openReceivables.length} danger={p.overdueReceivables.length>0} onClick={()=>p.setTab('financeiro')} /><Quick title="Patrimônio" value={brl(p.assetBook)} onClick={()=>p.setTab('patrimonio')} />
    </div>
    <Card><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><h3 style={h3}>Movimentação do mês</h3><button onClick={()=>p.setModal({type:'tx'})} style={linkBtn}>+ lançamento</button></div>{p.monthTxs.slice(0,5).map(t=><div key={t.id} style={row}><div><div style={{fontSize:13,fontWeight:700}}>{t.nome||t.categoria||'Lançamento'}</div><div style={sub}>{dateLabel(t.data)} · {t.categoria||''}</div></div><div style={{fontWeight:800,color:t.tipo==='receita'?C.green:C.red}}>{t.tipo==='receita'?'+':'-'}{brl(t.valor)}</div></div>)}{!p.monthTxs.length&&<div style={{color:C.muted,fontSize:12}}>Nenhum lançamento neste mês.</div>}</Card>
  </>;
}
function Quick({title,value,danger,onClick}) { return <button onClick={onClick} style={{border:`1px solid ${danger? '#F0C7C2':C.border}`,background:'#fff',borderRadius:15,padding:12,textAlign:'left',cursor:'pointer',fontFamily:'inherit'}}><div style={{fontSize:10,color:C.muted,fontWeight:700}}>{title}</div><div style={{fontSize:16,color:danger?C.red:C.navy,fontWeight:800,marginTop:5}}>{value}</div></button>; }

function TransactionsTab({monthTxs,receitas,despesas,resultado,brl,search,setSearch,filter,setFilter,setModal,removeTx}) {
  const list=monthTxs.filter(t=>filter==='todos'||t.tipo===filter).filter(t=>`${t.nome} ${t.categoria} ${t.descricao}`.toLowerCase().includes(search.toLowerCase()));
  return <><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9,marginBottom:10}}><Button onClick={()=>setModal({type:'tx',item:{tipo:'receita'}})}>+ Receita</Button><Button kind="danger" onClick={()=>setModal({type:'tx',item:{tipo:'despesa'}})}>+ Despesa</Button></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}><Card><Label>Receitas</Label><div style={money}>{brl(receitas)}</div></Card><Card><Label>Despesas</Label><div style={money}>{brl(despesas)}</div></Card></div><Card style={{marginBottom:10}}><Input label="Pesquisar" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Clínica, categoria, descrição…"/><div style={{display:'flex',gap:6,overflowX:'auto'}}>{[['todos','Todos'],['receita','Receitas'],['despesa','Despesas']].map(([v,l])=><button key={v} onClick={()=>setFilter(v)} style={{border:0,borderRadius:999,padding:'7px 10px',background:filter===v?C.navy:C.navyLight,color:filter===v?'#fff':C.navyMid,fontSize:10,fontWeight:700}}>{l}</button>)}</div></Card>{list.length?list.map(t=><TxRow key={t.id} t={t} brl={brl} onEdit={()=>setModal({type:'tx',item:t})} onDelete={()=>removeTx(t.id)}/>):<Empty title="Nenhum lançamento" text="Registre receitas e despesas para alimentar o financeiro e os cálculos tributários." />}</>;
}
function TxRow({t,brl,onEdit,onDelete}) { return <Card style={{marginBottom:8,padding:13}}><div style={{display:'flex',justifyContent:'space-between',gap:10}}><div style={{minWidth:0}}><div style={{fontWeight:800,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.nome||t.categoria||'Lançamento'}</div><div style={sub}>{dateLabel(t.data)} · {t.categoria||'Sem categoria'}</div>{t.notaGerada&&<div style={{marginTop:5,fontSize:10,color:C.green}}>✓ NF {t.numeroNota||'emitida'}</div>}</div><div style={{textAlign:'right'}}><div style={{fontWeight:800,color:t.tipo==='receita'?C.green:C.red}}>{t.tipo==='receita'?'+':'-'}{brl(t.valor)}</div><div style={{display:'flex',gap:4,justifyContent:'flex-end',marginTop:6}}><button onClick={onEdit} style={smallBtn}>Editar</button><button onClick={onDelete} style={{...smallBtn,color:C.red}}>Excluir</button></div></div></div></Card>; }

function FinanceTab({payables,receivables,brl,setModal,markPayablePaid,markReceivableReceived,notify}) {
  const [sub,setSub]=useState('pagar');
  const list=sub==='pagar'?payables:receivables;
  return <><div style={{display:'flex',gap:7,marginBottom:10}}><Button kind={sub==='pagar'?'primary':'soft'} onClick={()=>setSub('pagar')} style={{flex:1}}>A pagar</Button><Button kind={sub==='receber'?'primary':'soft'} onClick={()=>setSub('receber')} style={{flex:1}}>A receber</Button></div><Button onClick={()=>setModal({type:sub==='pagar'?'payable':'receivable'})} style={{width:'100%',marginBottom:10}}>{sub==='pagar'?'+ Nova conta a pagar':'+ Nova conta a receber'}</Button>{list.length?list.sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||'')).map(item=>sub==='pagar'?<PayableRow key={item.id} item={item} brl={brl} onEdit={()=>setModal({type:'payable',item})} onPaid={()=>markPayablePaid(item)} />:<ReceivableRow key={item.id} item={item} brl={brl} onEdit={()=>setModal({type:'receivable',item})} onReceived={()=>markReceivableReceived(item)} />):<Empty title={sub==='pagar'?'Contas a pagar vazias':'Contas a receber vazias'} text="Use esta área para controlar vencimentos sem misturar contas a pagar/receber com o caixa efetivamente pago/recebido." />}</>;
}
function PayableRow({item,brl,onEdit,onPaid}) { const status=dueStatus(item.dueDate,item.paidAt); return <Card style={{marginBottom:8,padding:13}}><div style={{display:'flex',justifyContent:'space-between',gap:10}}><div><div style={{fontWeight:800,fontSize:13}}>{item.description||'Conta'}</div><div style={sub}>{item.supplier||'Fornecedor não informado'} · vence {dateLabel(item.dueDate)}</div><div style={{marginTop:6}}><StatusPill status={status}/>{item.recurring&&<span style={{fontSize:10,color:C.muted,marginLeft:6}}>↻ recorrente</span>}</div></div><div style={{textAlign:'right'}}><div style={money}>{brl(item.amount)}</div>{!item.paidAt&&<button onClick={onPaid} style={smallBtn}>Marcar pago</button>}<button onClick={onEdit} style={{...smallBtn,display:'block',marginTop:4}}>Editar</button></div></div></Card>; }
function ReceivableRow({item,brl,onEdit,onReceived}) { const status=dueStatus(item.dueDate,item.receivedAt); return <Card style={{marginBottom:8,padding:13}}><div style={{display:'flex',justifyContent:'space-between',gap:10}}><div><div style={{fontWeight:800,fontSize:13}}>{item.description||'Recebimento'}</div><div style={sub}>{item.client||'Cliente não informado'} · vence {dateLabel(item.dueDate)}</div><div style={{marginTop:6}}><StatusPill status={status}/>{item.invoiceNumber&&<span style={{fontSize:10,color:C.muted,marginLeft:6}}>NF {item.invoiceNumber}</span>}</div></div><div style={{textAlign:'right'}}><div style={money}>{brl(item.amount)}</div>{!item.receivedAt&&<button onClick={onReceived} style={smallBtn}>Marcar recebido</button>}<button onClick={onEdit} style={{...smallBtn,display:'block',marginTop:4}}>Editar</button></div></div></Card>; }

function AssetsTab({assets,brl,setModal,assetBookValue}) { const total=assets.filter(a=>a.active).reduce((s,a)=>s+assetBookValue(a),0); return <><Card style={{marginBottom:10}}><Label>Patrimônio líquido registrado</Label><div style={money}>{brl(total)}</div><div style={sub}>Valor contábil estimado dos ativos cadastrados.</div></Card><Button onClick={()=>setModal({type:'asset'})} style={{width:'100%',marginBottom:10}}>+ Novo ativo</Button>{assets.length?assets.map(a=><Card key={a.id} style={{marginBottom:8,padding:13}}><div style={{display:'flex',justifyContent:'space-between',gap:10}}><div><div style={{fontWeight:800,fontSize:13}}>{a.name||'Ativo'}</div><div style={sub}>{a.category} · aquisição {dateLabel(a.acquisitionDate)}</div><div style={sub}>Vida útil: {a.usefulLifeYears||'—'} anos</div></div><div style={{textAlign:'right'}}><div style={money}>{brl(assetBookValue(a))}</div><button onClick={()=>setModal({type:'asset',item:a})} style={smallBtn}>Editar</button></div></div></Card>):<Empty title="Nenhum ativo" text="Cadastre equipamentos, móveis, computadores e outros bens para acompanhar o patrimônio e a depreciação estimada." />}</>; }

function AnnualTab({txs,plMap,irrfMap,year,brl,hideValues}) { const rows=MONTHS.map((m,i)=>{const rec=txs.filter(t=>t.tipo==='receita'&&new Date(`${t.data}T12:00:00`).getFullYear()===year&&new Date(`${t.data}T12:00:00`).getMonth()===i).reduce((s,t)=>s+t.valor,0);const pl=plMap[monthKey(year,i)]||0;const ir=irrfMap[monthKey(year,i)]||calcIRRF(pl).valor;return {m,rec,pl,ir};}).filter(x=>x.rec||x.pl||x.ir); const total=rows.reduce((s,x)=>s+x.rec,0); return <><Card style={{marginBottom:10}}><Label>Receita anual {year}</Label><div style={money}>{val(total,hideValues)}</div></Card>{rows.length?rows.map(x=><div key={x.m} style={row}><div><div style={{fontWeight:800,fontSize:13}}>{x.m}</div><div style={sub}>Pró-labore {brl(x.pl)} · IRRF {brl(x.ir)}</div></div><div style={{fontWeight:800}}>{val(x.rec,hideValues)}</div></div>):<Empty title="Sem dados anuais" text="Registre movimentações para formar a visão anual." />}</>; }
function StatsTab({monthTxs,receitas,despesas,brl,hideValues}) { const groups={}; monthTxs.forEach(t=>{const k=t.tipo==='receita'?(t.categoria||'Receita'):(t.categoria||'Despesa');groups[k]=(groups[k]||0)+Number(t.valor||0);});const data=Object.entries(groups).map(([name,value])=>({name,value}));return <><Card style={{marginBottom:10}}><Label>Composição do mês</Label><div style={{height:220}}><ResponsiveContainer><PieChart><Pie data={data} dataKey="value" nameKey="name" outerRadius={80} label>{data.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip formatter={(v)=>brl(v)}/></PieChart></ResponsiveContainer></div></Card><div style={row}><span>Receitas</span><b>{val(receitas,hideValues)}</b></div><div style={row}><span>Despesas</span><b>{val(despesas,hideValues)}</b></div><div style={row}><span>Resultado</span><b>{val(receitas-despesas,hideValues)}</b></div></>; }
function FavoritesTab({favs,setModal}) { return <><Button onClick={()=>setModal({type:'fav',item:{tipo:'receita',nome:''}})} style={{width:'100%',marginBottom:10}}>+ Novo favorito</Button>{favs.length?favs.map(f=><Card key={f.id} style={{marginBottom:8}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{fontWeight:800}}>{f.nome||'Favorito'}</div><div style={sub}>{f.tipo==='receita'?'Receita':'Despesa'} · {f.categoria||''}</div></div><button onClick={()=>setModal({type:'fav',item:f})} style={smallBtn}>Editar</button></div></Card>):<Empty title="Nenhum favorito" text="Salve clínicas ou categorias usadas com frequência para acelerar novos lançamentos." />}</>; }
function MoreTab({setTab,setModal,setShowSettings,exportBackup,importBackup,settings,setSettings,updateTaxField,pl,autoPL,inss,irrf,ctb,das,rbt,fator,brl,key}) { return <><Card style={{marginBottom:10}}><h3 style={h3}>Tributação 2026</h3><div style={row}><span>RBT12</span><b>{brl(rbt.rbt12||rbt.rbt12Anualizado)}</b></div><div style={row}><span>DAS — Anexo III</span><b>{brl(das.valor)} · {(das.aliquota*100).toFixed(2)}%</b></div><div style={row}><span>Pró-labore atual</span><b>{brl(pl)}</b></div><div style={row}><span>Pró-labore recomendado</span><b>{brl(autoPL)}</b></div><div style={row}><span>INSS</span><b>{brl(inss)}</b></div><div style={row}><span>IRRF</span><b>{brl(irrf.valor)}</b></div><div style={row}><span>Fator R estimado</span><b style={{color:fator.atingiu?C.green:C.orange}}>{(fator.fatorR*100).toFixed(2)}%</b></div><div style={{fontSize:10,color:C.muted,lineHeight:1.5,marginTop:8}}>O Fator R exibido é uma estimativa baseada no pró-labore e INSS registrados. Confirme a apuração final com a contabilidade.</div></Card><Card style={{marginBottom:10}}><h3 style={h3}>Valores manuais do mês</h3><Input label="Pró-labore" value={moneyInput(pl)} onChange={e=>updateTaxField('pl',e.target.value)} inputMode="decimal"/><Input label="Contabilidade" value={moneyInput(ctb)} onChange={e=>updateTaxField('ctb',e.target.value)} inputMode="decimal"/><Input label="IRRF manual (opcional)" value={moneyInput(irrf.valor)} onChange={e=>updateTaxField('irrf',e.target.value)} inputMode="decimal"/></Card><Card style={{marginBottom:10}}><h3 style={h3}>IRRF 2026</h3><div style={row}><span>Dependentes</span><input value={settings.dependentes} onChange={e=>setSettings({...settings,dependentes:Number(e.target.value||0)})} type="number" min="0" style={miniInput}/></div><div style={row}><span>Pensão mensal</span><input value={settings.pensao} onChange={e=>setSettings({...settings,pensao:Number(e.target.value||0)})} inputMode="decimal" style={miniInput}/></div><div style={sub}>Salário mínimo: {brl(SALARIO_MINIMO_2026)} · teto INSS: {brl(INSS_TETO_2026)}</div></Card><Button onClick={()=>setTab('favoritos')} kind="soft" style={{width:'100%',marginBottom:8}}>♡ Favoritos</Button><Button onClick={()=>setTab('estatistica')} kind="soft" style={{width:'100%',marginBottom:8}}>◑ Estatística</Button><Button onClick={()=>setTab('anual')} kind="soft" style={{width:'100%',marginBottom:8}}>▦ Visão anual</Button><Button onClick={()=>setShowSettings(true)} style={{width:'100%'}}>⚙️ Backup e configurações</Button></>; }

function TransactionModal({item,onClose,onSave,favs}) { const initial={tipo:'receita',valor:'',data:today(),nome:'',cnpj:'',telefone:'',email:'',especialidade:'',dente:'',categoria:'Recebimento de Clientes',descricao:'',notaGerada:false,numeroNota:'',dataEmissao:'',informadoContab:false,...item}; const [f,setF]=useState(initial); const [fav,setFav]=useState(false); const change=(k,v)=>setF(x=>({...x,[k]:v})); return <Modal title={item?.id?'Editar lançamento':f.tipo==='receita'?'Nova receita':'Nova despesa'} onClose={onClose}><div style={{display:'flex',gap:7,marginBottom:12}}><Button kind={f.tipo==='receita'?'primary':'soft'} onClick={()=>change('tipo','receita')} style={{flex:1}}>Receita</Button><Button kind={f.tipo==='despesa'?'danger':'soft'} onClick={()=>change('tipo','despesa')} style={{flex:1}}>Despesa</Button></div><Input label="Valor" value={f.valor} onChange={e=>change('valor',e.target.value)} inputMode="decimal" placeholder="0,00"/><Input label={f.tipo==='receita'?'Clínica / cliente':'Descrição'} value={f.nome} onChange={e=>change('nome',e.target.value)}/><Input label="Data" type="date" value={f.data} onChange={e=>change('data',e.target.value)}/><Select label="Categoria" value={f.categoria} onChange={e=>change('categoria',e.target.value)} options={(f.tipo==='receita'?RECEIPT_CATEGORIES:EXPENSE_CATEGORIES).map(x=>({value:x,label:x}))}/>{f.tipo==='receita'&&<><Input label="CNPJ" value={f.cnpj} onChange={e=>change('cnpj',e.target.value)}/><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}><Input label="Especialidade" value={f.especialidade} onChange={e=>change('especialidade',e.target.value)}/><Input label="Dente" value={f.dente} onChange={e=>change('dente',e.target.value)}/></div><div style={{background:'#F8F6F3',padding:12,borderRadius:12,marginBottom:12}}><label style={{display:'flex',gap:8,fontSize:12,fontWeight:700}}><input type="checkbox" checked={!!f.notaGerada} onChange={e=>change('notaGerada',e.target.checked)}/> Nota fiscal emitida</label>{f.notaGerada&&<Input label="Número da nota" value={f.numeroNota} onChange={e=>change('numeroNota',e.target.value)}/>}</div></>}<Input label="Observações" value={f.descricao} onChange={e=>change('descricao',e.target.value)}/><label style={{display:'flex',gap:8,fontSize:12,marginBottom:14}}><input type="checkbox" checked={fav} onChange={e=>setFav(e.target.checked)}/> Salvar como favorito</label><Button onClick={()=>{if(parseBRL(f.valor)<=0)return;onSave({...f,valor:parseBRL(f.valor),saveAsFav:fav});}}>Salvar lançamento</Button></Modal>; }

function PayableModal({item,onClose,onSave}) { const [f,setF]=useState({description:'',category:'Outros',supplier:'',amount:'',dueDate:today(),paidAt:'',recurring:false,notes:'',...item}); const c=(k,v)=>setF(x=>({...x,[k]:v})); return <Modal title={item?.id?'Editar conta a pagar':'Nova conta a pagar'} onClose={onClose}><Input label="Descrição" value={f.description} onChange={e=>c('description',e.target.value)}/><Input label="Valor" value={f.amount} onChange={e=>c('amount',e.target.value)} inputMode="decimal"/><Input label="Fornecedor" value={f.supplier} onChange={e=>c('supplier',e.target.value)}/><Select label="Categoria" value={f.category} onChange={e=>c('category',e.target.value)} options={EXPENSE_CATEGORIES.map(x=>({value:x,label:x}))}/><Input label="Vencimento" type="date" value={f.dueDate} onChange={e=>c('dueDate',e.target.value)}/><Input label="Data de pagamento (opcional)" type="date" value={f.paidAt} onChange={e=>c('paidAt',e.target.value)}/><label style={{display:'flex',gap:8,fontSize:12,marginBottom:12}}><input type="checkbox" checked={!!f.recurring} onChange={e=>c('recurring',e.target.checked)}/> Conta recorrente</label><Input label="Observações" value={f.notes} onChange={e=>c('notes',e.target.value)}/><Button onClick={()=>onSave({...f,amount:parseBRL(f.amount),status:f.paidAt?'pago':'pendente'})}>Salvar</Button></Modal>; }
function ReceivableModal({item,onClose,onSave}) { const [f,setF]=useState({description:'',client:'',amount:'',issueDate:today(),dueDate:today(),receivedAt:'',invoiceNumber:'',notes:'',...item}); const c=(k,v)=>setF(x=>({...x,[k]:v})); return <Modal title={item?.id?'Editar conta a receber':'Nova conta a receber'} onClose={onClose}><Input label="Descrição" value={f.description} onChange={e=>c('description',e.target.value)}/><Input label="Valor" value={f.amount} onChange={e=>c('amount',e.target.value)} inputMode="decimal"/><Input label="Cliente" value={f.client} onChange={e=>c('client',e.target.value)}/><Input label="Emissão" type="date" value={f.issueDate} onChange={e=>c('issueDate',e.target.value)}/><Input label="Vencimento" type="date" value={f.dueDate} onChange={e=>c('dueDate',e.target.value)}/><Input label="Data de recebimento (opcional)" type="date" value={f.receivedAt} onChange={e=>c('receivedAt',e.target.value)}/><Input label="Número da nota" value={f.invoiceNumber} onChange={e=>c('invoiceNumber',e.target.value)}/><Input label="Observações" value={f.notes} onChange={e=>c('notes',e.target.value)}/><Button onClick={()=>onSave({...f,amount:parseBRL(f.amount),status:f.receivedAt?'recebido':'aberto'})}>Salvar</Button></Modal>; }
function AssetModal({item,onClose,onSave}) { const [f,setF]=useState({name:'',category:'Equipamento',acquisitionDate:today(),acquisitionValue:'',usefulLifeYears:5,residualValue:'',active:true,notes:'',...item}); const c=(k,v)=>setF(x=>({...x,[k]:v})); return <Modal title={item?.id?'Editar ativo':'Novo ativo'} onClose={onClose}><Input label="Nome do ativo" value={f.name} onChange={e=>c('name',e.target.value)}/><Select label="Categoria" value={f.category} onChange={e=>c('category',e.target.value)} options={['Equipamento','Computador','Móvel','Veículo','Benfeitoria','Outro'].map(x=>({value:x,label:x}))}/><Input label="Data de aquisição" type="date" value={f.acquisitionDate} onChange={e=>c('acquisitionDate',e.target.value)}/><Input label="Valor de aquisição" value={f.acquisitionValue} onChange={e=>c('acquisitionValue',e.target.value)} inputMode="decimal"/><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}><Input label="Vida útil (anos)" type="number" value={f.usefulLifeYears} onChange={e=>c('usefulLifeYears',e.target.value)}/><Input label="Valor residual" value={f.residualValue} onChange={e=>c('residualValue',e.target.value)} inputMode="decimal"/></div><label style={{display:'flex',gap:8,fontSize:12,marginBottom:12}}><input type="checkbox" checked={!!f.active} onChange={e=>c('active',e.target.checked)}/> Ativo em uso</label><Input label="Observações" value={f.notes} onChange={e=>c('notes',e.target.value)}/><Button onClick={()=>onSave({...f,acquisitionValue:parseBRL(f.acquisitionValue),residualValue:parseBRL(f.residualValue),usefulLifeYears:Number(f.usefulLifeYears||0)})}>Salvar</Button></Modal>; }
function FavoriteModal({item,onClose,onSave}) { const [f,setF]=useState({tipo:'receita',nome:'',categoria:'',cnpj:'',telefone:'',email:'',...item}); const c=(k,v)=>setF(x=>({...x,[k]:v})); return <Modal title="Favorito" onClose={onClose}><Select label="Tipo" value={f.tipo} onChange={e=>c('tipo',e.target.value)} options={[{value:'receita',label:'Receita'},{value:'despesa',label:'Despesa'}]}/><Input label="Nome" value={f.nome} onChange={e=>c('nome',e.target.value)}/><Input label="Categoria" value={f.categoria} onChange={e=>c('categoria',e.target.value)}/><Input label="CNPJ / identificação" value={f.cnpj} onChange={e=>c('cnpj',e.target.value)}/><Button onClick={()=>onSave(f)}>Salvar favorito</Button></Modal>; }
function SettingsModal({onClose,exportBackup,importBackup,online,settings,setSettings,save,notify}) { return <Modal title="Backup e configurações" onClose={onClose}><Card style={{background:online?C.greenLight:C.orangeLight,marginBottom:12}}><b>{online?'🟢 Online':'🟠 Offline'}</b><div style={{fontSize:11,color:C.muted,marginTop:4}}>Os dados são salvos localmente e sincronizados com o Supabase quando a conexão está disponível.</div></Card><Button onClick={exportBackup} style={{width:'100%',marginBottom:8}}>📤 Exportar backup completo</Button><label style={{display:'block',marginBottom:12}}><span style={{display:'block',fontSize:11,color:C.muted,fontWeight:700,marginBottom:5}}>Restaurar backup JSON</span><input type="file" accept="application/json,.json" onChange={e=>e.target.files?.[0]&&importBackup(e.target.files[0])} style={{width:'100%'}}/></label><Button kind="soft" onClick={async()=>{await save('pj_settings',settings,setSettings);notify('Configurações salvas.')}} style={{width:'100%'}}>Salvar configurações</Button></Modal>; }

const big={fontSize:22,fontWeight:800,color:C.navy}; const money={fontSize:17,fontWeight:800,color:C.navy}; const sub={fontSize:10,color:C.muted,marginTop:4,lineHeight:1.4}; const h3={margin:'0 0 10px',fontSize:15,color:C.navy}; const row={display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,padding:'11px 0',borderBottom:`1px solid ${C.border}`,fontSize:12}; const smallBtn={border:`1px solid ${C.border}`,background:'#fff',borderRadius:8,padding:'5px 7px',fontSize:10,color:C.navy,cursor:'pointer'}; const linkBtn={border:0,background:'none',color:C.navyMid,fontWeight:800,fontSize:11,cursor:'pointer'}; const miniInput={width:90,border:`1px solid ${C.border}`,borderRadius:8,padding:6};
