import { sSet } from "../lib/storage";
import { calcRecommendedPL, SALARIO_MINIMO_2026 } from "../lib/taxes";

/* ─── Logo ─────────────────────────────────────── */
const LOGO = "/assets/logo-horizontal.jpeg";

/* ─── Constants ─────────────────────────────────── */
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const TIPOS_DESP = ["DAS","Pró-Labore","INSS","Taxa","Imposto","Conta","Contabilidade","Escritório Virtual","Material","Outros"];
const TIPOS_REC  = ["Recebimento de Clientes","Estorno"];
const ESPS       = ["Endodontia","Ortodontia"];
const SAL_MIN    = SALARIO_MINIMO_2026;

/* ─── Theme ──────────────────────────────────────── */
const C = {
  bg:"#F2F0ED", navy:"#0F1E35", navyMid:"#1A3055", navyLight:"#E8EEF5",
  gold:"#C8A96E", red:"#C0392B", redLight:"#FFF0EE",
  text:"#1A1A1A", muted:"#8B7F72", border:"#E0D8CE",
};
const iSt = { width:"100%", background:"white", border:"1px solid #E0D8CE", borderRadius:12, padding:"12px 14px", fontSize:15, fontFamily:"inherit", color:"#1A1A1A", outline:"none", boxSizing:"border-box" };

/* ─── Helpers ────────────────────────────────────── */
const fmtBRL  = v => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);
const parseBRL= v => parseFloat(String(v).replace(/\./g,"").replace(",","."))||0;
const fmtIn   = v => { const d=String(v).replace(/\D/g,""); if(!d)return""; return(parseInt(d,10)/100).toFixed(2).replace(".",",").replace(/\B(?=(\d{3})+(?!\d))/g,"."); };
const fmtDoc = v => {
  const d=v.replace(/\D/g,"");
  if(d.length<=11){
    // CPF: 000.000.000-00
    return d.slice(0,11).replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2");
  } else {
    // CNPJ: 00.000.000/0000-00
    return d.slice(0,14).replace(/^(\d{2})(\d)/,"$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/,"$1.$2.$3").replace(/\.(\d{3})(\d)/,".$1/$2").replace(/(\d{4})(\d)/,"$1-$2");
  }
};

const createBlankForm = (date = new Date()) => ({
  valor: "",
  data: date.toISOString().split("T")[0],
  nome: "",
  cnpj: "",
  telefone: "",
  cep: "",
  endereco: "",
  email: "",
  especialidade: "",
  dente: "",
  categoria: "",
  descricao: "",
  notaGerada: false,
  numeroNota: "",
  saveAsFav: false,
});

const formatPhone = value => {
  const d = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
};

const formatCep = value => {
  const d = String(value || "").replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

const storedMoneyInput = value => value ? fmtIn(String(Math.round(Number(value) * 100))) : "";

/* ─── Storage / Supabase ─────────────────────────── */

/* ─── Tax Calculations ───────────────────────────── */
async function cascadePL(txs, manual = {}) {
  const keys = new Set();

  (txs || [])
    .filter(t => t?.tipo === "receita" && t?.data)
    .forEach(t => {
      const d = new Date(t.data + "T12:00:00");
      if (!Number.isNaN(d.getTime())) {
        keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
    });

  Object.keys(manual || {}).forEach(key => keys.add(key));

  const map = {};

  for (const key of [...keys].sort()) {
    if (manual?.[key] != null && Number.isFinite(Number(manual[key]))) {
      map[key] = Math.max(0, Number(manual[key]));
      continue;
    }

    const [y, ms] = key.split("-");
    const yNum = Number(y);
    const mNum = Number(ms) - 1;

    if (!Number.isFinite(yNum) || !Number.isFinite(mNum)) continue;

    map[key] = calcRecommendedPL(txs, map, yNum, mNum);
  }

  await sSet("pj_pl", map);
  return map;
}

/* ─── Ordenação estável ───────────────────────────── */
const sortTransactions = list => [...(Array.isArray(list) ? list : [])].sort((a,b)=>{
  const da=String(a?.data||"");
  const db=String(b?.data||"");
  if(da!==db) return db.localeCompare(da);
  return String(b?.id||"").localeCompare(String(a?.id||""));
});

const sortFavorites = list => [...(Array.isArray(list) ? list : [])].sort((a,b)=>{
  const na=String(a?.nome||"").trim();
  const nb=String(b?.nome||"").trim();
  return na.localeCompare(nb,"pt-BR",{sensitivity:"base",numeric:true});
});

/* ══════════════════════════════════════════════════ */
function getPreviousMonthPayables({txs, effectivePlMap, ctbMap, irrfMap, year, month, calcTributacao, calcIRRF}) {
  const previous = new Date(Number(year), Number(month) - 1, 1);
  const py = previous.getFullYear();
  const pm = previous.getMonth();
  const key = `${py}-${String(pm + 1).padStart(2, "0")}`;
  const revenue = (Array.isArray(txs) ? txs : [])
    .filter(t => t?.tipo === "receita" && t?.data)
    .filter(t => {
      const d = new Date(`${String(t.data).slice(0,10)}T12:00:00`);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === py && d.getMonth() === pm;
    })
    .reduce((s,t) => s + Math.max(0, Number(t.valor) || 0), 0);

  const taxation = typeof calcTributacao === "function"
    ? calcTributacao(txs, effectivePlMap || {}, py, pm, revenue)
    : { das: 0 };

  const pl = Math.max(0, Number(effectivePlMap?.[key]) || 0);
  const inss = pl * 0.11;
  const irrf = Object.prototype.hasOwnProperty.call(irrfMap || {}, key)
    ? Math.max(0, Number(irrfMap[key]) || 0)
    : (typeof calcIRRF === "function" ? Math.max(0, Number(calcIRRF(pl, {inss}).valor)) : 0);
  const ctb = Math.max(0, Number(ctbMap?.[key]) || 0);

  const due = (day, label, amount) => {
    const d = new Date(Number(year), Number(month), day);
    const today = new Date();
    const selectedIsCurrentMonth = today.getFullYear() === Number(year) && today.getMonth() === Number(month);
    let timing = `Vencimento dia ${day}`;
    if (selectedIsCurrentMonth) {
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const diff = Math.round((d - todayStart) / 86400000);
      if (diff === 0) timing = "Vence hoje";
      else if (diff > 0) timing = `Vence em ${diff} dia${diff === 1 ? "" : "s"}`;
      else timing = `Vencido há ${Math.abs(diff)} dia${Math.abs(diff) === 1 ? "" : "s"}`;
    }
    return { label, amount: Math.max(0, Number(amount) || 0), dueDate: d, timing };
  };

  const items = [
    due(20, "DAS", taxation?.das || 0),
    due(20, "DARF (INSS + IRRF)", inss + irrf),
    due(15, "Contabilidade", ctb),
  ];

  return {
    competenceLabel: `${MONTHS[pm]} ${py}`,
    items,
    total: items.reduce((s, item) => s + item.amount, 0),
  };
}

/* ─── Tab Components ─────────────────────────────── */


export {
  LOGO, MONTHS, TIPOS_DESP, TIPOS_REC, ESPS, SAL_MIN, C, iSt,
  fmtBRL, parseBRL, fmtIn, fmtDoc, createBlankForm, formatPhone, formatCep,
  storedMoneyInput, cascadePL, sortTransactions, sortFavorites,
  getPreviousMonthPayables,
};
