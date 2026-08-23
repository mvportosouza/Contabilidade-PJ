'use client';
import { useState, useEffect, useRef } from "react";
import { deleteAllAppData, sGet, sSet, clearStorageCache } from "../lib/storage";
import { updatePassword } from "../lib/auth";
import { ACCOUNTING_PL_BY_MONTH } from "../lib/accounting";
import { supabase } from "../lib/supabaseClient";
import { BACKUP_VERSION, cryptoId, normalizeBackup, normalizeDateOnly } from "../lib/validators";
import { calculateMonthlyFinance, calculateAccumulatedCash } from "../lib/finance";
import { generateMonthlyReportPdf, generateAnnualReportPdf, openPdfBlob } from "../lib/pdf";
import { getMonthlyStatistics, getAnnualStatistics } from "../lib/statistics";
import {
  calcINSS,
  calcIRRF,
  calcRecommendedPL,
  calcTributacao,
  SALARIO_MINIMO_2026,
} from "../lib/taxes";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, ComposedChart, Line } from "recharts";

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
export default function App() {
  const now=new Date();
  const [tab,setTab]=useState("dashboard");
  const [month,setMonth]=useState(now.getMonth());
  const [year,setYear]=useState(now.getFullYear());
  const [txs,setTxs]=useState([]);
  const [favs,setFavs]=useState([]);
  const [plMap,setPlMap]=useState({});
  const [plManual,setPlManual]=useState({});
  const [ctbMap,setCtbMap]=useState({});
  const [irrfMap,setIrrfMap]=useState({});
  const [plIn,setPlIn]=useState("");
  const [ctbIn,setCtbIn]=useState("");
  const [irrfIn,setIrrfIn]=useState("");
  const [showForm,setShowForm]=useState(false);
  const [formTipo,setFormTipo]=useState("receita");
  const [editId,setEditId]=useState(null);
  const [showFavPick,setShowFavPick]=useState(false);
  const [notaModal,setNotaModal]=useState(null);
  const [drillModal,setDrillModal]=useState(null);
  const [showSettings,setShowSettings]=useState(false);
  const [showChangePassword,setShowChangePassword]=useState(false);
  const [newPassword,setNewPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [showTaxation,setShowTaxation]=useState(false);
  const [showFavorites,setShowFavorites]=useState(false);
  const [favoriteEdit,setFavoriteEdit]=useState(null);
  const [accountActionBusy,setAccountActionBusy]=useState(false);
  const importFileRef = useRef(null);
  const [hideVal,setHideVal]=useState(false);
  const [toast,setToast]=useState(null);

  const [form,setForm]=useState(()=>createBlankForm(now));

  useEffect(()=>{
    (async()=>{
      const t=sortTransactions(await sGet("pj_tx2")||[]);
      const fv=sortFavorites(await sGet("pj_favs2")||[]);
      const pl=await sGet("pj_pl")||{};
      const pm=await sGet("pj_plm")||{};
      const ct=await sGet("pj_ctb")||{};
      const irrf=await sGet("pj_irrf")||{};
      // Os valores da contabilidade são semeados apenas em um estado
      // já existente do usuário. Assim, "Excluir Todos os Dados" realmente
      // deixa a conta sem dados e não recria valores automaticamente.
      const seededPL = t.length > 0
        ? { ...ACCOUNTING_PL_BY_MONTH, ...pm }
        : pm;
      if (t.length > 0 && JSON.stringify(seededPL) !== JSON.stringify(pm)) {
        await sSet("pj_plm", seededPL);
      }
      setFavs(fv); setCtbMap(ct); setIrrfMap(irrf); setPlManual(seededPL);
      const updated=await cascadePL(t,seededPL);
      setTxs(t); setPlMap(updated);
    })();
  },[]);

  const plKey=`${year}-${String(month+1).padStart(2,"0")}`;

  useEffect(() => {
    // O pró-labore informado pela contabilidade tem prioridade sobre o
    // cálculo automático quando ainda não existe um override manual do usuário.
    const value = Object.prototype.hasOwnProperty.call(plManual, plKey)
      ? plManual[plKey]
      : plMap[plKey];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlIn(storedMoneyInput(value));
  }, [plKey, plMap, plManual]);

  useEffect(() => {
    // Necessário para sincronizar o campo de entrada com o mês selecionado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCtbIn(storedMoneyInput(ctbMap[plKey]));
  }, [plKey, ctbMap]);

  useEffect(() => {
    // Necessário para sincronizar o campo de entrada com o mês selecionado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIrrfIn(storedMoneyInput(irrfMap[plKey]));
  }, [plKey, irrfMap]);

  /* ── Derived ── */
  const financeMonth = calculateMonthlyFinance(txs, year, month);
  const monthTxs = sortTransactions(financeMonth.lancamentos);
  const receitas = financeMonth.receitas;
  const despesas = financeMonth.despesas;
  const distribuicoes = financeMonth.distribuicoes || 0;
  const resultado = financeMonth.resultado;

  // Mapa efetivo do pró-labore: valores da contabilidade corrigem os meses
  // informados, enquanto um override manual do usuário continua tendo prioridade.
  const effectivePlMap = { ...plMap, ...plManual };

  const tributacao = calcTributacao(txs, effectivePlMap, year, month, receitas);
  const {
    rbt12,
    mesesAtividade,
    anexo,
    fatorR,
  } = tributacao;

  const mesesR = mesesAtividade;

  const DAS = tributacao.das;
  const aliq = tributacao.aliquota;

  const PLauto = calcRecommendedPL(txs, effectivePlMap, year, month);
  const hasManualPL = Object.prototype.hasOwnProperty.call(plManual, plKey);
  const PLef = hasManualPL
    ? Math.max(0, Number(plManual[plKey]) || 0)
    : PLauto;

  const INSS = calcINSS(PLef);

  const CTB = Object.prototype.hasOwnProperty.call(ctbMap, plKey)
    ? Math.max(0, Number(ctbMap[plKey]) || 0)
    : 0;

  const IRRFautoData = calcIRRF(PLef, { inss: INSS });
  const IRRFauto = IRRFautoData.valor;
  const hasManualIRRF = Object.prototype.hasOwnProperty.call(irrfMap, plKey);
  const IRRFef = hasManualIRRF
    ? Math.max(0, Number(irrfMap[plKey]) || 0)
    : IRRFauto;

  const totalObrig = DAS + INSS + CTB + IRRFef;

  // Saldo atual é estritamente do mês selecionado, sem carregar o mês anterior.
  // Distribuição de lucros não é despesa e, portanto, não reduz este resultado.
  const saldo = receitas - despesas;

  const allYears = [...new Set([
    year,
    ...txs
      .map(t => new Date(t.data + "T12:00:00").getFullYear())
      .filter(Number.isFinite),
    ...Object.keys(plMap || {}).map(k => Number(String(k).slice(0, 4))).filter(Number.isFinite),
    ...Object.keys(ACCOUNTING_PL_BY_MONTH).map(k => Number(String(k).slice(0, 4))).filter(Number.isFinite),
    ...Object.keys(ctbMap || {}).map(k => Number(String(k).slice(0, 4))).filter(Number.isFinite),
    ...Object.keys(irrfMap || {}).map(k => Number(String(k).slice(0, 4))).filter(Number.isFinite),
  ])].sort((a, b) => b - a);

  /* ── Savers ── */
  const saveTxs=async d=>{
    const sorted=sortTransactions(d);
    setTxs(sorted); await sSet("pj_tx2",sorted);
    const freshM=await sGet("pj_plm")||{};
    const up=await cascadePL(d,freshM);
    setPlMap(up);
  };
  const saveFavs=async d=>{const sorted=sortFavorites(d);setFavs(sorted);await sSet("pj_favs2",sorted);};
  const saveCtb=async d=>{setCtbMap(d);await sSet("pj_ctb",d);};
  const saveIrrf=async d=>{setIrrfMap(d);await sSet("pj_irrf",d);};
  const commitIrrf=async()=>{ const v=parseBRL(irrfIn); await saveIrrf({...irrfMap,[plKey]:v>0?v:0}); };

  const notify=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),2800);};

  const commitPL=async()=>{
    const raw=plIn.trim();
    if(!raw){
      // Limpar override manual — volta ao automático
      const newManual={...plManual}; delete newManual[plKey];
      setPlManual(newManual); await sSet("pj_plm",newManual);
      const up=await cascadePL(txs,newManual);
      setPlMap(up); notify("Voltou ao valor da contabilidade/automático.");
      return;
    }
    const v=parseBRL(raw);
    if(v<SAL_MIN) notify("Abaixo do salário mínimo","warn");
    // Salva como override manual
    const newManual={...plManual,[plKey]:v};
    setPlManual(newManual); await sSet("pj_plm",newManual);
    const up=await cascadePL(txs,newManual);
    setPlMap(up);
    notify("Pró-labore salvo!");
  };
  const commitCtb=async()=>{ await saveCtb({...ctbMap,[plKey]:parseBRL(ctbIn)}); };

  /* ── Form ── */
  const openNew=tipo=>{setEditId(null);setFormTipo(tipo);setForm(createBlankForm());setShowForm(true);};
  const openEdit=tx=>{
    setEditId(tx.id);setFormTipo(tx.tipo);
    setForm({valor:fmtIn(String(Math.round(tx.valor*100))),data:tx.data,nome:tx.nome||"",cnpj:tx.cnpj||"",telefone:tx.telefone||"",cep:tx.cep||"",endereco:tx.endereco||"",email:tx.email||"",especialidade:tx.especialidade||"",dente:tx.dente||"",categoria:tx.categoria||"",descricao:tx.descricao||"",notaGerada:tx.notaGerada||false,numeroNota:tx.numeroNota||"",dataEmissao:tx.dataEmissao||"",taxaISS:tx.taxaISS||"",informadoContab:tx.informadoContab||false,saveAsFav:false});
    setShowForm(true);
  };
  const handleCat=cat=>{
    if(formTipo==="receita"&&cat==="Recebimento de Clientes") setForm(f=>({...f,categoria:cat,descricao:"Prestação de serviço odontológico (8630-5/04) nos dias: "}));
    else setForm(f=>({...f,categoria:cat,descricao:""}));
  };
  const handleSubmit=async()=>{
    if(!form.valor||!form.data){notify("Informe valor e data.","err");return;}
    if(formTipo==="receita"&&!form.nome){notify("Informe o nome da clínica.","err");return;}
    if(formTipo==="despesa"&&!form.categoria){notify("Selecione o tipo de despesa.","err");return;}
    const valor=parseBRL(form.valor); if(valor<=0){notify("Valor inválido.","err");return;}
    const normalizedData = normalizeDateOnly(form.data); if(!normalizedData){notify("Data inválida.","err");return;} const tx={id:editId||cryptoId(),tipo:formTipo,valor,data:normalizedData,nome:form.nome||form.categoria||(formTipo==="distribuicao"?"Distribuição de Lucros":""),cnpj:form.cnpj,telefone:form.telefone,cep:form.cep,endereco:form.endereco,email:form.email,especialidade:form.especialidade,dente:form.dente,categoria:form.categoria,descricao:form.descricao,notaGerada:form.notaGerada,numeroNota:form.notaGerada?form.numeroNota:"",dataEmissao:form.notaGerada?(normalizeDateOnly(form.dataEmissao)||""):"",taxaISS:form.notaGerada?form.taxaISS:"",informadoContab:form.notaGerada?form.informadoContab:false};
    await saveTxs(editId?txs.map(t=>t.id===editId?tx:t):[tx,...txs]);
    if(form.saveAsFav && formTipo!=="distribuicao"){
      const key=formTipo==="receita"?form.nome:form.categoria;
      const fd={id:cryptoId(),tipo:formTipo,nome:key,cnpj:form.cnpj,telefone:form.telefone,cep:form.cep,endereco:form.endereco,email:form.email,especialidade:form.especialidade,categoria:form.categoria};
      const ex=favs.find(f=>f.tipo===formTipo&&f.nome===key);
      await saveFavs(ex?favs.map(f=>f.tipo===formTipo&&f.nome===key?{...fd,id:f.id}:f):[...favs,fd]);
    }
    setShowForm(false); notify(editId?"Atualizado!":"Salvo!");
  };
  const delTx=async id=>{await saveTxs(txs.filter(t=>t.id!==id));notify("Removido.");};
  const applyFav=fav=>{
    if(fav.tipo==="receita") setForm(f=>({...f,nome:fav.nome,cnpj:fav.cnpj||"",telefone:fav.telefone||"",cep:fav.cep||"",endereco:fav.endereco||"",email:fav.email||"",especialidade:fav.especialidade||"",categoria:fav.categoria||""}));
    else setForm(f=>({...f,categoria:fav.nome}));
    setShowFavPick(false);
  };

  const openFavoriteEdit = fav => {
    setFavoriteEdit({ ...fav });
  };

  const saveFavoriteEdit = async () => {
    if (!favoriteEdit) return;
    const name = String(favoriteEdit.nome || "").trim();
    if (!name) { notify("Informe o nome do Favorito.","err"); return; }
    const duplicate = favs.find(f => f.id !== favoriteEdit.id && f.tipo === favoriteEdit.tipo && String(f.nome || "").trim().localeCompare(name,"pt-BR",{sensitivity:"base"}) === 0);
    if (duplicate) { notify("Já existe um Favorito com esse nome.","err"); return; }
    const updated = favs.map(f => f.id === favoriteEdit.id ? {
      ...f,
      nome: name,
      cnpj: favoriteEdit.cnpj || "",
      telefone: favoriteEdit.telefone || "",
      cep: favoriteEdit.cep || "",
      endereco: favoriteEdit.endereco || "",
      email: favoriteEdit.email || "",
      especialidade: favoriteEdit.especialidade || "",
      categoria: favoriteEdit.tipo === "despesa" ? name : (favoriteEdit.categoria || ""),
    } : f);
    await saveFavs(updated);
    setFavoriteEdit(null);
    notify("Favorito atualizado!");
  };

  const deleteFavorite = async id => {
    if (!window.confirm("Excluir este Favorito?\n\nO lançamento salvo não será excluído.")) return;
    await saveFavs(favs.filter(f => f.id !== id));
    setFavoriteEdit(null);
    notify("Favorito excluído.");
  };

  /* ── Export/Import ── */
  const textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
  const textDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;

  const bytesToBase64 = bytes => {
    let binary = "";
    const chunkSize = 0x8000;
    for(let i=0;i<bytes.length;i+=chunkSize){
      binary += String.fromCharCode(...bytes.subarray(i,i+chunkSize));
    }
    return btoa(binary);
  };

  const base64ToBytes = value => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    return bytes;
  };

  const deriveBackupKey = async (password, salt) => {
    if(!window.crypto?.subtle) {
      throw new Error("Seu navegador não oferece suporte à criptografia segura necessária para o backup.");
    }
    const material = await window.crypto.subtle.importKey(
      "raw",
      textEncoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
      {
        name:"PBKDF2",
        salt,
        iterations:250000,
        hash:"SHA-256",
      },
      material,
      {name:"AES-GCM",length:256},
      false,
      ["encrypt","decrypt"]
    );
  };

  const encryptBackup = async (backup,password) => {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(password,salt);
    const plaintext = textEncoder.encode(JSON.stringify(backup));
    const ciphertext = new Uint8Array(
      await window.crypto.subtle.encrypt(
        {name:"AES-GCM",iv},
        key,
        plaintext
      )
    );

    return {
      format:"contabilidade-pj-encrypted-backup",
      version:1,
      algorithm:"AES-256-GCM",
      kdf:"PBKDF2-SHA-256",
      iterations:250000,
      salt:bytesToBase64(salt),
      iv:bytesToBase64(iv),
      data:bytesToBase64(ciphertext),
      encryptedAt:new Date().toISOString(),
    };
  };

  const decryptBackup = async (envelope,password) => {
    if(!envelope ||
       envelope.format!=="contabilidade-pj-encrypted-backup" ||
       envelope.version!==1 ||
       envelope.algorithm!=="AES-256-GCM" ||
       envelope.kdf!=="PBKDF2-SHA-256"){
      throw new Error("Este arquivo não é um backup criptografado compatível.");
    }

    if(envelope.iterations!==250000){
      throw new Error("Parâmetros de segurança do backup não são compatíveis.");
    }

    try{
      const salt=base64ToBytes(envelope.salt);
      const iv=base64ToBytes(envelope.iv);
      const ciphertext=base64ToBytes(envelope.data);
      const key=await deriveBackupKey(password,salt);
      const plainBuffer=await window.crypto.subtle.decrypt(
        {name:"AES-GCM",iv},
        key,
        ciphertext
      );
      return JSON.parse(textDecoder.decode(new Uint8Array(plainBuffer)));
    }catch(e){
      if(e?.message?.includes("backup") || e?.message?.includes("Parâmetros")){
        throw e;
      }
      throw new Error("Senha incorreta ou backup criptografado inválido.");
    }
  };

  const askBackupPassword = (message,confirmation=false) => {
    const first=window.prompt(message);
    if(first===null) return null;
    if(first.length<8){
      throw new Error("A senha do backup precisa ter pelo menos 8 caracteres.");
    }
    if(confirmation){
      const second=window.prompt("Confirme a senha do backup:");
      if(second===null) return null;
      if(second!==first){
        throw new Error("As senhas não coincidem.");
      }
    }
    return first;
  };

  const buildBackup=()=>normalizeBackup({
    version:BACKUP_VERSION,
    schema:"contabilidade-pj-backup",
    txs,
    favs,
    plMap,
    plManual,
    ctbMap,
    irrfMap,
    exportedAt:new Date().toISOString(),
  });

  const doExport=async()=>{
    try{
      const password=askBackupPassword(
        "Crie uma senha para proteger seu backup.\n\nMínimo: 8 caracteres.\n\nEssa senha será necessária para importar o backup.",
        true
      );
      if(password===null) return;

      const backup=buildBackup();
      const encrypted=await encryptBackup(backup,password);
      const json=JSON.stringify(encrypted,null,2);
      const stamp=new Date().toISOString().slice(0,10);
      const filename=`contabilidade-pj-backup-${stamp}.json`;
      const blob=new Blob([json],{type:"application/json;charset=utf-8"});
      const file=new File([blob],filename,{type:"application/json"});

      if(typeof navigator!=="undefined" && navigator.share &&
         typeof navigator.canShare==="function" &&
         navigator.canShare({files:[file]})){
        try{
          await navigator.share({
            title:"Backup Contabilidade PJ",
            text:"Backup criptografado dos dados do aplicativo Contabilidade PJ.",
            files:[file],
          });
          notify("✅ Backup criptografado gerado.","ok");
          return;
        }catch(shareError){
          if(shareError?.name==="AbortError") return;
        }
      }

      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      notify(`✅ Backup criptografado ${filename} gerado.`,"ok");
    }catch(e){
      if(e?.name==="AbortError") return;
      notify(e?.message||"Não foi possível gerar o backup criptografado.","err");
    }
  };

  const restoreBackup=async(text)=>{
    try{
      let parsed;
      try{
        parsed=JSON.parse(text);
      }catch{
        throw new Error("O arquivo selecionado não é um JSON válido.");
      }

      let backupData;

      if(parsed?.format==="contabilidade-pj-encrypted-backup"){
        const password=askBackupPassword(
          "Digite a senha usada para proteger este backup:"
        );
        if(password===null) return;

        backupData=await decryptBackup(parsed,password);
      }else{
        /*
         * Compatibilidade com backups antigos sem criptografia.
         * Novos backups são sempre criptografados.
         */
        const useLegacy=window.confirm(
          "Este é um backup antigo sem criptografia.\n\nDeseja importá-lo mesmo assim?"
        );
        if(!useLegacy) return;
        backupData=parsed;
      }

      // Valida e normaliza TODO o backup antes de qualquer gravação.
      const d=normalizeBackup(backupData);
      const {
        txs:txData,
        favs:favData,
        plMap:plData,
        plManual:manualData,
        ctbMap:ctbData,
        irrfMap:irrfData
      }=d;

      await saveFavs(favData);
      await saveCtb(ctbData);
      await sSet("pj_irrf",irrfData);
      await sSet("pj_plm",manualData);
      await sSet("pj_pl",plData);
      await sSet("pj_tx2",txData);

      setFavs(favData);
      setCtbMap(ctbData);
      setIrrfMap(irrfData);
      setPlManual(manualData);

      const up=await cascadePL(txData,manualData);
      setTxs(txData);
      setPlMap(up);
      await sSet("pj_pl",up);

      setShowSettings(false);
      notify("✅ Backup importado e validado com sucesso!","ok");
    }catch(e){
      notify(
        e?.message ||
        "Arquivo de backup inválido, senha incorreta ou incompatível.",
        "err"
      );
    }
  };

  const handleImportFile=async(event)=>{
    const file=event.target.files?.[0];
    event.target.value="";
    if(!file) return;

    try{
      if(file.size>25*1024*1024){
        throw new Error("O arquivo de backup excede o limite de 25 MB.");
      }

      if(!/\.json$/i.test(file.name)){
        throw new Error("Selecione um arquivo de backup .json.");
      }

      const text=await file.text();
      if(!text.trim()) throw new Error("O arquivo está vazio.");
      await restoreBackup(text);
    }catch(e){
      notify(
        e?.message ||
        "Não foi possível ler o arquivo de backup.",
        "err"
      );
    }
  };

  const favsAtt=sortFavorites(formTipo==="receita"?favs.filter(f=>f.tipo==="receita"):favs.filter(f=>f.tipo==="despesa"));
  const fmtMoney=v=>hideVal?"R$ ···":fmtBRL(v);
  const fmtV=fmtMoney;
  const openTaxation=()=>setShowTaxation(true);
  const goToTaxation=()=>{ setTab("dashboard"); setShowTaxation(true); };
  const nav=[{id:"dashboard",label:"Início",icon:"◎"},{id:"lancamentos",label:"Lançamentos",icon:"≡"},{id:"estatistica",label:"Dados Mensais",icon:"◑"},{id:"anual",label:"Dados Anuais",icon:"▦"},{id:"mais",label:"Mais",icon:"⋯",action:goToTaxation}];

  /* ══ RENDER ══════════════════════════════════════════════ */
  return (
    <div className="app-shell" style={{fontFamily:"Georgia,serif",background:C.bg,minHeight:"100vh",maxWidth:430,margin:"0 auto",position:"relative"}}>
      <style>{`@media print {
        body { background: #fff !important; }
        .app-shell { max-width: none !important; box-shadow: none !important; }
        .app-header, .app-bottom-nav, button[aria-label="Gerar Relatório (PDF)"] { display: none !important; }
        .app-shell > div { position: static !important; }
      }`}</style>

      {/* Header */}
      <div className="app-header" style={{background:"linear-gradient(180deg,#0F1E35,#1A3055)",position:"sticky",top:0,zIndex:30,boxShadow:"0 2px 12px rgba(0,0,0,0.2)"}}>
        <div style={{height:2,background:"linear-gradient(90deg,transparent,#C8A96E,transparent)"}}/>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 16px 10px"}}>
          <img src={LOGO} alt="Marcus Vinícius" style={{height:72,maxWidth:"85%",objectFit:"contain",filter:"drop-shadow(0 2px 8px rgba(0,0,0,0.4))"}}/>
        </div>
        <div style={{height:1,background:"linear-gradient(90deg,transparent,rgba(200,169,110,0.4),transparent)",margin:"0 20px"}}/>
        <div style={{display:"flex",gap:8,padding:"10px 16px 14px",alignItems:"center"}}>
          <select value={month} onChange={e=>setMonth(+e.target.value)} style={{flex:1,background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:10,color:"#F0EBE3",padding:"8px 10px",fontSize:13,fontFamily:"inherit",outline:"none"}}>
            {MONTHS.map((m,i)=><option key={i} value={i} style={{background:"#1A3055"}}>{m}</option>)}
          </select>
          <select value={year} onChange={e=>setYear(+e.target.value)} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:10,color:"#F0EBE3",padding:"8px 10px",fontSize:13,fontFamily:"inherit",width:78,outline:"none"}}>
            {allYears.map(y=><option key={y} value={y} style={{background:"#1A3055"}}>{y}</option>)}
          </select>
          <button onClick={()=>setHideVal(v=>!v)} aria-label={hideVal?"Mostrar valores":"Ocultar valores"} title={hideVal?"Mostrar valores":"Ocultar valores"} style={{background:hideVal?"rgba(200,169,110,0.32)":"rgba(200,169,110,0.2)",border:"1px solid rgba(200,169,110,0.5)",borderRadius:10,padding:"8px 12px",color:"#C8A96E",fontSize:16,cursor:"pointer",flexShrink:0,zIndex:10}}>{hideVal?"👁":"🙈"}</button>
          <button onClick={()=>setShowSettings(true)} aria-label="Configurações" title="Configurações" style={{background:"rgba(200,169,110,0.2)",border:"1px solid rgba(200,169,110,0.5)",borderRadius:10,padding:"8px 12px",color:"#C8A96E",fontSize:16,cursor:"pointer",flexShrink:0,zIndex:10}}>⚙️</button>
        </div>
        <div style={{height:2,background:"linear-gradient(90deg,transparent,#C8A96E,transparent)"}}/>
      </div>

      {/* Content */}
      <div style={{padding:"16px 16px 90px"}}>

        {/* ── DASHBOARD ── */}
        {tab==="dashboard" && (
          <DashTab
            monthTxs={monthTxs} receitas={receitas} despesas={despesas} resultado={resultado}
            saldo={saldo} month={month} year={year} MONTHS={MONTHS}
            totalObrig={totalObrig} C={C} fmtBRL={fmtMoney} openTaxation={openTaxation}
            setNotaModal={setNotaModal}
            contasPagar={getPreviousMonthPayables({
              txs, effectivePlMap, ctbMap, irrfMap, year, month, calcTributacao, calcIRRF
            })}
          />
        )}

        {/* ── LANÇAMENTOS ── */}
        {tab==="lancamentos" && (
          <LancTab
            monthTxs={monthTxs} receitas={receitas} despesas={despesas} resultado={resultado}
            month={month} year={year} MONTHS={MONTHS} C={C} fmtBRL={fmtMoney}
            openNew={openNew} openEdit={openEdit} delTx={delTx}
          />
        )}

        {/* ── ESTATÍSTICA ── */}
        {tab==="anual" && (
          <AnualTab txs={txs} plMap={effectivePlMap} irrfMap={irrfMap} year={year} C={C} fmtBRL={fmtMoney} calcIRRF={calcIRRF} calcTributacao={calcTributacao}/>
        )}

        {tab==="estatistica" && (
          <StatTab
            monthTxs={monthTxs} receitas={receitas} despesas={despesas}
            month={month} year={year} MONTHS={MONTHS} C={C}
            fmtV={fmtV}
            setDrillModal={setDrillModal} fmtBRL={fmtMoney}
          />
        )}
      </div>

      {/* Bottom Nav */}
      <div className="app-bottom-nav" style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"rgba(248,245,241,0.97)",backdropFilter:"blur(14px)",borderTop:`1px solid ${C.border}`,display:"flex",paddingBottom:16,zIndex:40}}>
        {nav.map(n=>(
          <button key={n.id} onClick={()=>n.action?n.action():setTab(n.id)} style={{flex:1,background:"none",border:"none",padding:"12px 0 4px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <span style={{fontSize:20,color:tab===n.id?C.navyMid:"#AAA"}}>{n.icon}</span>
            <span style={{fontSize:10,fontFamily:"inherit",color:tab===n.id?C.navyMid:"#AAA",fontWeight:tab===n.id?"bold":"normal"}}>{n.label}</span>
          </button>
        ))}
      </div>

      {/* Form Modal */}
      {showForm && (
        <Modal onClose={()=>setShowForm(false)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <Pill color={formTipo==="receita"?C.navyMid:formTipo==="despesa"?C.red:C.gold} bg={formTipo==="receita"?C.navyLight:formTipo==="despesa"?C.redLight:"#F8F1E5"}>{formTipo==="receita"?"💰 Receita":formTipo==="despesa"?"💸 Despesa":"💰 Distribuição de Lucro"}</Pill>
              <span style={{fontSize:13,color:"#999"}}>{editId?"Editar":"Novo"}</span>
            </div>
            <div style={{display:"flex",gap:8}}>
              {formTipo!=="distribuicao" && favsAtt.length>0 && <button onClick={()=>setShowFavPick(true)} style={{background:formTipo==="receita"?C.navyLight:C.redLight,border:"none",borderRadius:10,padding:"7px 12px",color:formTipo==="receita"?C.navyMid:C.red,fontSize:13,cursor:"pointer"}}>⭐ Favs</button>}
              <CloseBtn onClick={()=>setShowForm(false)}/>
            </div>
          </div>

          {formTipo==="receita" ? <>
            <Field label="Nome da Clínica *"><input value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="Ex: Clínica OralMax" style={iSt}/></Field>
            <Field label="Especialidade">
              <div style={{display:"flex",gap:8}}>
                {ESPS.map(esp=><button key={esp} onClick={()=>setForm(f=>({...f,especialidade:f.especialidade===esp?"":esp}))} style={{flex:1,padding:"11px",borderRadius:12,border:`2px solid ${form.especialidade===esp?C.navyMid:C.border}`,background:form.especialidade===esp?C.navyLight:"white",color:form.especialidade===esp?C.navyMid:"#AAA",fontFamily:"inherit",fontSize:13,fontWeight:"600",cursor:"pointer"}}>{esp}</button>)}
              </div>
            </Field>
            {form.especialidade==="Endodontia" && (
              <Field label="Unidade Dentária (Dente)"><input value={form.dente||""} onChange={e=>setForm(f=>({...f,dente:e.target.value}))} placeholder="Ex: 36, 46, 11..." style={iSt}/></Field>
            )}
            <Field label="CPF / CNPJ"><input value={form.cnpj} onChange={e=>setForm(f=>({...f,cnpj:fmtDoc(e.target.value)}))} placeholder="00.000.000/0000-00" inputMode="numeric" style={iSt}/></Field>
            <Field label="Telefone"><input value={form.telefone||""} onChange={e=>setForm(f=>({...f,telefone:formatPhone(e.target.value)}))} placeholder="(00) 00000-0000" inputMode="tel" style={iSt}/></Field>
            <Field label="CEP">
              <input value={form.cep||""} onChange={e=>setForm(f=>({...f,cep:formatCep(e.target.value)}))} placeholder="00000-000" inputMode="numeric" style={iSt}/>
            </Field>
            <Field label="Endereço"><input value={form.endereco||""} onChange={e=>setForm(f=>({...f,endereco:e.target.value}))} placeholder="Rua, número, bairro..." style={iSt}/></Field>
            <Field label="E-mail"><input value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="email@exemplo.com" inputMode="email" style={iSt}/></Field>
            <Field label="Descrição da Receita">
              <select value={form.categoria} onChange={e=>handleCat(e.target.value)} style={{...iSt,color:form.categoria?C.text:"#AAA"}}>
                <option value="">Selecione...</option>
                {TIPOS_REC.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Observação">
              <textarea value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} rows={3} placeholder="Detalhes..." style={{...iSt,resize:"none",lineHeight:1.5}}/>
            </Field>
          </> : formTipo==="distribuicao" ? <>
            <Field label="Descrição">
              <input value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} placeholder="Ex: Distribuição de lucros" style={iSt}/>
            </Field>
          </> : <>
            <Field label="Tipo de Despesa *">
              <select value={form.categoria} onChange={e=>setForm(f=>({...f,categoria:e.target.value,nome:e.target.value}))} style={{...iSt,color:form.categoria?C.text:"#AAA"}}>
                <option value="">Selecione...</option>
                {TIPOS_DESP.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Observação"><input value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} placeholder="Detalhes opcionais" style={iSt}/></Field>
          </>}

          <Field label="Valor *">
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:14}}>R$</span>
              <input value={form.valor} onChange={e=>setForm(f=>({...f,valor:fmtIn(e.target.value)}))} placeholder="0,00" inputMode="numeric" style={{...iSt,paddingLeft:38}}/>
            </div>
          </Field>
          <Field label="Data *"><input type="date" value={form.data} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={iSt}/></Field>

          {formTipo==="receita" && (
            <Field label="Nota Fiscal">
              <div style={{display:"flex",gap:8,marginBottom:form.notaGerada?10:0}}>
                <TogBtn active={form.notaGerada} color={C.navyMid} bg={C.navyLight} onClick={()=>setForm(f=>({...f,notaGerada:true}))}>✅ Emitida</TogBtn>
                <TogBtn active={!form.notaGerada} color={C.red} bg={C.redLight} onClick={()=>setForm(f=>({...f,notaGerada:false,numeroNota:""}))}>⏳ Pendente</TogBtn>
              </div>
              {form.notaGerada && <>
                <Field label="Número da NF">
                  <input value={form.numeroNota} onChange={e=>setForm(f=>({...f,numeroNota:e.target.value}))} placeholder="Número da NF" inputMode="numeric" style={iSt}/>
                </Field>
                <Field label="Data de Emissão">
                  <input type="date" value={form.dataEmissao||""} onChange={e=>setForm(f=>({...f,dataEmissao:e.target.value}))} style={iSt}/>
                </Field>
                <Field label="Taxa ISS (%)">
                  <div style={{position:"relative"}}>
                    <input value={form.taxaISS||""} onChange={e=>setForm(f=>({...f,taxaISS:e.target.value.replace(/[^0-9,.]/g,"")}))} placeholder="Ex: 2.5 ou 5" inputMode="decimal" style={{...iSt,paddingRight:36}}/>
                    <span style={{position:"absolute",right:13,top:"50%",transform:"translateY(-50%)",color:"#8B7F72",fontSize:15,fontWeight:"600"}}>%</span>
                  </div>
                </Field>
              </>}
            </Field>
          )}

          {form.notaGerada && (
            <Field label="Informado à Contabilidade">
              <div style={{display:"flex",gap:8}}>
                <TogBtn active={form.informadoContab===true} color="#27AE60" bg="#EAFAF1" onClick={()=>setForm(f=>({...f,informadoContab:true}))}>✅ Sim</TogBtn>
                <TogBtn active={form.informadoContab===false} color={C.red} bg={C.redLight} onClick={()=>setForm(f=>({...f,informadoContab:false}))}>⏳ Não</TogBtn>
              </div>
            </Field>
          )}

          <label style={{display:"flex",alignItems:"center",gap:10,marginBottom:18,cursor:"pointer"}}>
            <ChkBox checked={form.saveAsFav} onChange={v=>setForm(f=>({...f,saveAsFav:v}))}/>
            <span style={{fontSize:13,color:"#666"}}>Salvar nos favoritos</span>
          </label>
          <button onClick={handleSubmit} style={{width:"100%",background:formTipo==="receita"?`linear-gradient(135deg,${C.navy},${C.navyMid})`:formTipo==="despesa"?"linear-gradient(135deg,#962d22,#C0392B)":`linear-gradient(135deg,${C.gold},#B89454)`,color:"white",border:"none",borderRadius:16,padding:"16px",fontSize:16,fontFamily:"inherit",cursor:"pointer",fontWeight:"600"}}>
            {editId?"Salvar Alterações":formTipo==="receita"?"Registrar Receita":formTipo==="despesa"?"Registrar Despesa":"Registrar Distribuição de Lucro"}
          </button>
        </Modal>
      )}

      {/* Fav Picker */}
      {showFavPick && (
        <Modal onClose={()=>setShowFavPick(false)}>
          <p style={{margin:"0 0 14px",fontWeight:"600",color:C.navy,fontSize:15}}>Selecionar Favorito</p>
          {favsAtt.map(fav=>(
            <button key={fav.id} onClick={()=>applyFav(fav)} style={{display:"block",width:"100%",background:"white",border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:8,textAlign:"left",cursor:"pointer",fontFamily:"inherit"}}>
              <p style={{margin:0,fontSize:14,fontWeight:"600",color:C.text}}>{fav.nome}</p>
              {fav.cnpj&&<p style={{margin:"2px 0 0",fontSize:11,color:"#BBB",fontFamily:"monospace"}}>{fav.cnpj}</p>}
            </button>
          ))}
        </Modal>
      )}

      {/* Notas Modal */}
      {notaModal && (()=>{
        const recMes=monthTxs.filter(t=>t.tipo==="receita");
        const configs={
          emitEnviadas: {lista:recMes.filter(t=>t.notaGerada&&t.informadoContab),  label:"Emitidas Enviadas",  color:"#27AE60", bg:"#EAFAF1"},
          emitPendentes:{lista:recMes.filter(t=>t.notaGerada&&!t.informadoContab), label:"Emitidas Pendentes", color:C.navyMid,  bg:C.navyLight},
          pendentes:    {lista:recMes.filter(t=>!t.notaGerada),                    label:"À Emitir",            color:"#E67E22",  bg:"#FFF8F0"},
        };
        const cfg=configs[notaModal];
        if(!cfg) return null;
        return (
          <Modal onClose={()=>setNotaModal(null)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div>
                <Pill color={cfg.color} bg={cfg.bg}>{cfg.label}</Pill>
                <p style={{margin:"8px 0 0",fontSize:11,color:C.muted}}>{MONTHS[month]} {year} · {cfg.lista.length} {cfg.lista.length===1?"nota":"notas"}</p>
              </div>
              <CloseBtn onClick={()=>setNotaModal(null)}/>
            </div>
            {cfg.lista.length===0
              ?<div style={{textAlign:"center",padding:"32px 0",color:"#CCC"}}>
                <p style={{fontSize:36,margin:0}}>📄</p>
                <p style={{margin:"8px 0 0",fontSize:14}}>Nenhuma nota nesta categoria</p>
              </div>
              :cfg.lista.map(tx=>{
                const d=new Date(tx.data+"T12:00:00");
                const isEmit=tx.notaGerada;
                return(
                  <div key={tx.id} onClick={()=>{setNotaModal(null);openEdit(tx);}}
                    style={{background:"white",borderRadius:14,padding:"14px 16px",marginBottom:10,
                    boxShadow:"0 1px 8px rgba(0,0,0,0.05)",borderLeft:`3px solid ${cfg.color}`,cursor:"pointer"}}>
                    <p style={{margin:"0 0 6px",fontSize:10,color:cfg.color,fontWeight:"700",letterSpacing:1}}>TOQUE PARA EDITAR</p>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <p style={{margin:0,fontSize:14,fontWeight:"600",color:C.text}}>{tx.nome}</p>
                        <p style={{margin:"3px 0 0",fontSize:11,color:C.muted}}>{d.getDate().toString().padStart(2,"0")}/{(d.getMonth()+1).toString().padStart(2,"0")}/{d.getFullYear()}</p>
                        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:5}}>
                          {isEmit&&tx.numeroNota&&<span style={{fontSize:11,background:"#EBF5EE",color:C.navyMid,borderRadius:6,padding:"2px 8px",fontWeight:"600"}}>NF #{tx.numeroNota}</span>}
                          {isEmit&&tx.dataEmissao&&<span style={{fontSize:11,background:"#F0F4FF",color:"#2980B9",borderRadius:6,padding:"2px 8px"}}>📅 {tx.dataEmissao.split("-").reverse().join("/")}</span>}
                          {isEmit&&tx.taxaISS&&<span style={{fontSize:11,background:"#FFF8F0",color:"#E67E22",borderRadius:6,padding:"2px 8px"}}>ISS {tx.taxaISS}%</span>}
                          {isEmit&&<span style={{fontSize:11,background:tx.informadoContab?"#EAFAF1":"#FFF0EE",color:tx.informadoContab?"#27AE60":C.red,borderRadius:6,padding:"2px 8px",fontWeight:"600"}}>{tx.informadoContab?"✅ Enviada":"⏳ Não enviada"}</span>}
                        </div>
                      </div>
                      <p style={{margin:0,fontSize:15,fontWeight:"bold",color:cfg.color,flexShrink:0,marginLeft:12}}>{fmtMoney(tx.valor)}</p>
                    </div>
                  </div>
                );
              })
            }
          </Modal>
        );
      })()}

            {drillModal && (
        <Modal onClose={()=>setDrillModal(null)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div>
              <p style={{margin:0,fontSize:16,fontWeight:"600",color:C.navy}}>{drillModal.title}</p>
              <p style={{margin:"3px 0 0",fontSize:11,color:C.muted}}>{drillModal.items.length} lançamentos · {fmtMoney(drillModal.items.reduce((s,t)=>s+t.valor,0))}</p>
            </div>
            <CloseBtn onClick={()=>setDrillModal(null)}/>
          </div>
          {drillModal.items.map(tx=>{
            const d=new Date(tx.data+"T12:00:00"); const isR=tx.tipo==="receita"; const txColor=isR?C.navyMid:tx.tipo==="distribuicao"?C.gold:C.red;
            return (
              <div key={tx.id} style={{background:"white",borderRadius:14,padding:"13px 15px",marginBottom:10,boxShadow:"0 1px 8px rgba(0,0,0,0.05)",borderLeft:`3px solid ${txColor}`}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <div>
                    <p style={{margin:0,fontSize:13,fontWeight:"600",color:C.text}}>{tx.nome||"—"}</p>
                    {tx.especialidade&&<p style={{margin:"1px 0 0",fontSize:11,color:C.gold,fontWeight:"600"}}>{tx.especialidade}{tx.dente?" · Dente "+tx.dente:""}</p>}
                    <p style={{margin:"3px 0 0",fontSize:11,color:C.muted}}>{d.getDate().toString().padStart(2,"0")}/{(d.getMonth()+1).toString().padStart(2,"0")}/{d.getFullYear()}</p>
                  </div>
                  <p style={{margin:0,fontSize:15,fontWeight:"bold",color:isR?C.navyMid:C.red}}>{isR?"+":"-"}{fmtMoney(tx.valor)}</p>
                </div>
              </div>
            );
          })}
        </Modal>
      )}

      {/* Taxation Modal */}
      {showTaxation && (
        <Modal onClose={()=>setShowTaxation(false)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <div>
              <h2 style={{margin:0,fontSize:18,color:C.navy,fontWeight:"normal"}}>Tributação</h2>
              <p style={{margin:"4px 0 0",fontSize:11,color:C.muted}}>{MONTHS[month]} {year}</p>
            </div>
            <CloseBtn onClick={()=>setShowTaxation(false)}/>
          </div>
          <Card style={{boxShadow:"none",border:`1px solid ${C.border}`}}>
            <SmLabel style={{marginBottom:16}}>Impostos &amp; Obrigações</SmLabel>
            <div style={{paddingBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div><p style={{margin:0,fontSize:13,fontWeight:"600",color:C.text}}>DAS — Simples Nacional</p><p style={{margin:"2px 0 0",fontSize:11,color:C.muted}}>Alíquota efetiva: {(aliq*100).toFixed(2)}% (Anexo {anexo})</p></div>
                <p style={{margin:0,fontSize:16,fontWeight:"bold",color:"#E67E22"}}>{fmtMoney(DAS)}</p>
              </div>
              <div style={{background:"#FFFBF0",borderRadius:10,padding:"8px 12px",border:"1px solid #F0E0A0"}}>
                <p style={{margin:0,fontSize:11,color:"#7A5800",lineHeight:1.5}}>📊 RBT12 considerado: <b>{fmtMoney(rbt12)}</b>{mesesR<13&&<span><br/>📈 Regra de início de atividade · {mesesR} {mesesR===1?"mês":"meses"}</span>}</p>
              </div>
            </div>
            <Div/>
            <div style={{paddingBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div><p style={{margin:0,fontSize:13,fontWeight:"600",color:C.text}}>Pró-labore</p><p style={{margin:"2px 0 0",fontSize:11,color:C.muted}}>Fator R: {(fatorR*100).toFixed(2)}% · conforme contabilidade</p></div>
                <p style={{margin:0,fontSize:15,fontWeight:"bold",color:C.navyMid}}>{fmtMoney(PLef)}</p>
              </div>
              <MoneyIn value={plIn||fmtIn(String(Math.round(PLef*100)))} onChange={setPlIn} onBlur={commitPL} placeholder={fmtIn(String(Math.round(PLauto*100)))}/>
              <div style={{background:C.navyLight,borderRadius:10,padding:"8px 12px",marginTop:8}}>
                <p style={{margin:0,fontSize:11,color:C.navyMid,lineHeight:1.5}}>🔒 Automático: pró-labore planejado para levar o próximo Fator R a ≥ 28%, considerando folha + CPP · Deixe em branco para usar o valor automático</p>
              </div>
            </div>
            <Div/>
            <div style={{paddingBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div><p style={{margin:0,fontSize:13,fontWeight:"600",color:C.text}}>INSS do Sócio 🔒</p><p style={{margin:"2px 0 0",fontSize:11,color:C.muted}}>11% sobre {fmtMoney(PLef)} · automático</p></div>
                <p style={{margin:0,fontSize:16,fontWeight:"bold",color:"#8E44AD"}}>{fmtMoney(INSS)}</p>
              </div>
            </div>
            <Div/>
            <div style={{paddingBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div><p style={{margin:0,fontSize:13,fontWeight:"600",color:C.text}}>Contabilidade</p><p style={{margin:"2px 0 0",fontSize:11,color:C.muted}}>Custo mensal do contador</p></div>
                {CTB>0&&<p style={{margin:0,fontSize:14,fontWeight:"bold",color:"#2980B9"}}>{fmtMoney(CTB)}</p>}
              </div>
              <MoneyIn value={ctbIn} onChange={setCtbIn} onBlur={commitCtb} placeholder="0,00"/>
            </div>
            <Div/>
            <div style={{paddingBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div><p style={{margin:0,fontSize:13,fontWeight:"600",color:C.text}}>IRRF</p><p style={{margin:"2px 0 0",fontSize:11,color:C.muted}}>Tabela progressiva 2026 · base: pró-labore − INSS</p></div>
                <p style={{margin:0,fontSize:14,fontWeight:"bold",color:"#C0392B"}}>{fmtMoney(IRRFef)}</p>
              </div>
              <MoneyIn value={irrfIn||fmtIn(String(Math.round(IRRFef*100)))} onChange={setIrrfIn} onBlur={commitIrrf} placeholder={fmtIn(String(Math.round(IRRFauto*100)))}/>
              <div style={{background:"#FFF5F5",borderRadius:10,padding:"8px 12px",marginTop:8}}>
                <p style={{margin:0,fontSize:11,color:"#C0392B",lineHeight:1.6}}>🔒 Tabela 2026 + Lei 15.270/25 · isento até R$ 5.000 · redutor R$ 5.000–7.350 · acima R$ 7.350 tabela normal<br/>Sugestão: {fmtMoney(IRRFauto)}</p>
              </div>
            </div>
            <Div/>
            <div style={{paddingTop:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <p style={{margin:0,fontSize:14,fontWeight:"700",color:C.text}}>Total de Obrigações</p>
              <p style={{margin:0,fontSize:18,fontWeight:"bold",color:C.red}}>{fmtMoney(totalObrig)}</p>
            </div>
          </Card>
        </Modal>
      )}

      {/* Change Password Modal */}
      {showChangePassword && (
        <Modal onClose={()=>setShowChangePassword(false)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <h2 style={{margin:0,fontSize:18,color:C.navy,fontWeight:"normal"}}>🔑 Alterar Senha</h2>
            <CloseBtn onClick={()=>setShowChangePassword(false)}/>
          </div>
          <div style={{display:"grid",gap:12}}>
            <div>
              <label style={{display:"block",fontSize:12,color:C.muted,marginBottom:6}}>Nova senha</label>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={e=>setNewPassword(e.target.value)}
                placeholder="Mínimo de 8 caracteres"
                style={iSt}
              />
            </div>
            <div>
              <label style={{display:"block",fontSize:12,color:C.muted,marginBottom:6}}>Confirmar nova senha</label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e=>setConfirmPassword(e.target.value)}
                placeholder="Digite novamente a nova senha"
                style={iSt}
              />
            </div>
            <button
              onClick={async()=>{
                if(accountActionBusy) return;
                if(newPassword.length<8){
                  notify("A nova senha precisa ter pelo menos 8 caracteres.","err");
                  return;
                }
                if(newPassword!==confirmPassword){
                  notify("As senhas não conferem.","err");
                  return;
                }
                setAccountActionBusy(true);
                try{
                  await updatePassword(newPassword);
                  setNewPassword("");
                  setConfirmPassword("");
                  setShowChangePassword(false);
                  setShowSettings(false);
                  notify("Senha alterada com sucesso.","ok");
                }catch(e){
                  notify(e?.message||"Não foi possível alterar a senha.","err");
                }finally{
                  setAccountActionBusy(false);
                }
              }}
              disabled={accountActionBusy}
              style={{width:"100%",background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,border:"none",borderRadius:14,padding:"14px 16px",color:"white",fontFamily:"inherit",fontSize:14,fontWeight:"700",cursor:accountActionBusy?"wait":"pointer",opacity:accountActionBusy?0.65:1}}
            >
              {accountActionBusy?"Alterando…":"Alterar senha"}
            </button>
          </div>
        </Modal>
      )}

      {/* Favorites Modal */}
      {showFavorites && (
        <Modal onClose={()=>setShowFavorites(false)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <div>
              <h2 style={{margin:0,fontSize:18,color:C.navy,fontWeight:"normal"}}>⭐ Favoritos</h2>
              <p style={{margin:"4px 0 0",fontSize:11,color:C.muted}}>{favs.length} {favs.length===1?"favorito":"favoritos"} · ordem alfabética</p>
            </div>
            <CloseBtn onClick={()=>setShowFavorites(false)}/>
          </div>
          {favs.length===0 ? (
            <div style={{textAlign:"center",padding:"30px 0",color:"#CCC"}}>
              <p style={{fontSize:34,margin:0}}>⭐</p>
              <p style={{margin:"8px 0 0",fontSize:13}}>Nenhum Favorito salvo.</p>
            </div>
          ) : sortFavorites(favs).map(fav=>(
            <div key={fav.id} style={{background:"white",borderRadius:14,padding:"13px 14px",marginBottom:9,border:`1px solid ${C.border}`,boxShadow:"0 1px 7px rgba(0,0,0,0.04)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                <div style={{minWidth:0}}>
                  <p style={{margin:0,fontSize:14,fontWeight:"700",color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{fav.nome}</p>
                  <p style={{margin:"3px 0 0",fontSize:10,color:fav.tipo==="receita"?C.navyMid:C.red}}>{fav.tipo==="receita"?"Receita":"Despesa"}</p>
                </div>
                <div style={{display:"flex",gap:7,flexShrink:0}}>
                  <button onClick={()=>openFavoriteEdit(fav)} style={{background:C.navyLight,border:"none",borderRadius:9,padding:"8px 10px",color:C.navyMid,fontFamily:"inherit",fontSize:12,fontWeight:"700",cursor:"pointer"}}>✏️ Editar</button>
                  <button onClick={()=>deleteFavorite(fav.id)} style={{background:C.redLight,border:"none",borderRadius:9,padding:"8px 10px",color:C.red,fontFamily:"inherit",fontSize:12,fontWeight:"700",cursor:"pointer"}}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </Modal>
      )}

      {/* Favorite Editor Modal */}
      {favoriteEdit && (
        <Modal onClose={()=>setFavoriteEdit(null)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <div>
              <h2 style={{margin:0,fontSize:18,color:C.navy,fontWeight:"normal"}}>✏️ Editar Favorito</h2>
              <p style={{margin:"4px 0 0",fontSize:11,color:C.muted}}>{favoriteEdit.tipo==="receita"?"Receita":"Despesa"}</p>
            </div>
            <CloseBtn onClick={()=>setFavoriteEdit(null)}/>
          </div>
          <Field label={favoriteEdit.tipo==="receita"?"Nome da Clínica *":"Tipo de Despesa *"}>
            <input value={favoriteEdit.nome||""} onChange={e=>setFavoriteEdit(f=>({...f,nome:e.target.value}))} style={iSt}/>
          </Field>
          {favoriteEdit.tipo==="receita" && <>
            <Field label="Especialidade">
              <div style={{display:"flex",gap:8}}>
                {ESPS.map(esp=><button key={esp} onClick={()=>setFavoriteEdit(f=>({...f,especialidade:f.especialidade===esp?"":esp}))} style={{flex:1,padding:"11px",borderRadius:12,border:`2px solid ${favoriteEdit.especialidade===esp?C.navyMid:C.border}`,background:favoriteEdit.especialidade===esp?C.navyLight:"white",color:favoriteEdit.especialidade===esp?C.navyMid:"#AAA",fontFamily:"inherit",fontSize:13,fontWeight:"600",cursor:"pointer"}}>{esp}</button>)}
              </div>
            </Field>
            <Field label="CPF / CNPJ"><input value={favoriteEdit.cnpj||""} onChange={e=>setFavoriteEdit(f=>({...f,cnpj:fmtDoc(e.target.value)}))} inputMode="numeric" style={iSt}/></Field>
            <Field label="Telefone"><input value={favoriteEdit.telefone||""} onChange={e=>setFavoriteEdit(f=>({...f,telefone:formatPhone(e.target.value)}))} inputMode="tel" style={iSt}/></Field>
            <Field label="CEP"><input value={favoriteEdit.cep||""} onChange={e=>setFavoriteEdit(f=>({...f,cep:formatCep(e.target.value)}))} inputMode="numeric" style={iSt}/></Field>
            <Field label="Endereço"><input value={favoriteEdit.endereco||""} onChange={e=>setFavoriteEdit(f=>({...f,endereco:e.target.value}))} style={iSt}/></Field>
            <Field label="E-mail"><input value={favoriteEdit.email||""} onChange={e=>setFavoriteEdit(f=>({...f,email:e.target.value}))} inputMode="email" style={iSt}/></Field>
            <Field label="Descrição da Receita">
              <select value={favoriteEdit.categoria||""} onChange={e=>setFavoriteEdit(f=>({...f,categoria:e.target.value}))} style={{...iSt,color:favoriteEdit.categoria?C.text:"#AAA"}}>
                <option value="">Selecione...</option>
                {TIPOS_REC.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </>}
          <div style={{display:"flex",gap:8,marginTop:4}}>
            <button onClick={saveFavoriteEdit} style={{flex:1,background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,border:"none",borderRadius:14,padding:"14px",color:"white",fontFamily:"inherit",fontSize:14,fontWeight:"700",cursor:"pointer"}}>Salvar alterações</button>
            <button onClick={()=>deleteFavorite(favoriteEdit.id)} style={{background:C.redLight,border:`1px solid ${C.red}`,borderRadius:14,padding:"14px",color:C.red,fontFamily:"inherit",fontSize:14,fontWeight:"700",cursor:"pointer"}}>Excluir</button>
          </div>
        </Modal>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <Modal onClose={()=>setShowSettings(false)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <h2 style={{margin:0,fontSize:18,color:C.navy,fontWeight:"normal"}}>⚙️ Configurações</h2>
            <CloseBtn onClick={()=>setShowSettings(false)}/>
          </div>

          <div style={{display:"grid",gap:10}}>
            <button
              onClick={()=>{setShowSettings(false);setShowFavorites(true);}}
              style={{width:"100%",background:"white",border:`1px solid ${C.border}`,borderRadius:14,padding:"16px",color:C.navyMid,fontFamily:"inherit",fontSize:14,fontWeight:"700",cursor:"pointer",textAlign:"left"}}
            >
              <div style={{fontSize:15,marginBottom:4}}>⭐ Favoritos</div>
              <div style={{fontSize:11,fontWeight:"normal",color:C.muted,lineHeight:1.45}}>Editar ou excluir os favoritos salvos, em ordem alfabética.</div>
            </button>

            <button
              onClick={doExport}
              style={{width:"100%",background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,border:"none",borderRadius:14,padding:"16px",color:"white",fontFamily:"inherit",fontSize:14,fontWeight:"700",cursor:"pointer",textAlign:"left"}}
            >
              <div style={{fontSize:15,marginBottom:4}}>📤 Exportar dados</div>
              <div style={{fontSize:11,fontWeight:"normal",opacity:0.82,lineHeight:1.45}}>Gerar um único arquivo JSON criptografado para guardar ou transferir seus dados.</div>
            </button>

            <button
              onClick={()=>importFileRef.current?.click()}
              style={{width:"100%",background:"linear-gradient(135deg,#2980B9,#3A91C9)",border:"none",borderRadius:14,padding:"16px",color:"white",fontFamily:"inherit",fontSize:14,fontWeight:"700",cursor:"pointer",textAlign:"left"}}
            >
              <div style={{fontSize:15,marginBottom:4}}>📥 Importar dados</div>
              <div style={{fontSize:11,fontWeight:"normal",opacity:0.88,lineHeight:1.45}}>Selecionar um único arquivo JSON criptografado e restaurar os dados salvos.</div>
            </button>
          </div>

          <div style={{borderTop:`1px solid ${C.border}`,marginTop:16,paddingTop:16}}>
            <SmLabel style={{marginBottom:10}}>Segurança</SmLabel>
            <button
              onClick={()=>{setNewPassword("");setConfirmPassword("");setShowChangePassword(true);}}
              style={{width:"100%",background:"white",border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",color:C.navyMid,fontFamily:"inherit",fontSize:14,fontWeight:"700",cursor:"pointer",textAlign:"left"}}
            >
              <div style={{fontSize:15,marginBottom:3}}>🔑 Alterar Senha</div>
              <div style={{fontSize:11,fontWeight:"normal",color:C.muted,lineHeight:1.45}}>Defina uma nova senha para acessar sua conta.</div>
            </button>
          </div>

          <input
            ref={importFileRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            style={{display:"none"}}
          />

          <div style={{borderTop:`1px solid ${C.border}`,marginTop:16,paddingTop:16}}>
            <SmLabel style={{marginBottom:10}}>Dados da conta</SmLabel>
            <div style={{display:"grid",gap:10}}>
              <button
                disabled={accountActionBusy}
                onClick={async()=>{
                  if(accountActionBusy) return;
                  const confirmed=window.confirm("Excluir todos os dados do aplicativo?\n\nIsso removerá os lançamentos, favoritos, pró-labore, contabilidade e IRRF da nuvem e deste dispositivo. Sua conta continuará ativa.");
                  if(!confirmed) return;
                  setAccountActionBusy(true);
                  try{
                    await deleteAllAppData();
                    setTxs([]); setFavs([]); setPlMap({}); setPlManual({}); setCtbMap({}); setIrrfMap({});
                    setShowSettings(false);
                    notify("Todos os dados foram excluídos.","ok");
                  }catch(e){
                    notify(e?.message||"Não foi possível excluir os dados.","err");
                  }finally{
                    setAccountActionBusy(false);
                  }
                }}
                style={{width:"100%",background:"white",border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",color:C.red,fontFamily:"inherit",fontSize:14,fontWeight:"700",cursor:accountActionBusy?"wait":"pointer",textAlign:"left",opacity:accountActionBusy?0.6:1}}
              >
                <div style={{fontSize:15,marginBottom:3}}>🗑️ Excluir Todos os Dados</div>
                <div style={{fontSize:11,fontWeight:"normal",color:C.muted,lineHeight:1.45}}>Remove os dados do aplicativo, mas mantém sua conta.</div>
              </button>

              <button
                disabled={accountActionBusy}
                onClick={async()=>{
                  if(accountActionBusy) return;
                  const confirmed=window.confirm("Excluir sua conta permanentemente?\n\nA conta de autenticação e os dados associados serão apagados. Esta ação não pode ser desfeita.");
                  if(!confirmed) return;
                  const second=window.confirm("Confirma novamente a exclusão PERMANENTE da conta?");
                  if(!second) return;
                  setAccountActionBusy(true);
                  try{
                    const {error}=await supabase.functions.invoke("delete-account");
                    if(error) throw error;
                    await clearStorageCache();
                    try{ await supabase.auth.signOut(); }catch{}
                    window.location.reload();
                  }catch(e){
                    notify(e?.message||"Não foi possível excluir a conta.","err");
                  }finally{
                    setAccountActionBusy(false);
                  }
                }}
                style={{width:"100%",background:C.redLight,border:`1px solid ${C.red}`,borderRadius:14,padding:"14px 16px",color:C.red,fontFamily:"inherit",fontSize:14,fontWeight:"700",cursor:accountActionBusy?"wait":"pointer",textAlign:"left",opacity:accountActionBusy?0.6:1}}
              >
                <div style={{fontSize:15,marginBottom:3}}>⚠️ Excluir Conta</div>
                <div style={{fontSize:11,fontWeight:"normal",color:C.red,lineHeight:1.45}}>Exclui permanentemente a conta e os dados associados.</div>
              </button>
            </div>
          </div>

          <div style={{background:"#FFF8F0",borderRadius:12,padding:"11px 13px",marginTop:14}}>
            <p style={{margin:0,fontSize:11,color:"#8A5A20",lineHeight:1.55}}>
              Os dados importados passam pela validação do aplicativo antes de substituir os dados atuais.
            </p>
          </div>
        </Modal>
      )}

      {/* Toast */}
      {toast && <div style={{position:"fixed",top:72,left:"50%",transform:"translateX(-50%)",background:toast.type==="err"?C.red:toast.type==="warn"?"#E67E22":C.navy,color:"white",borderRadius:12,padding:"12px 20px",fontSize:13,zIndex:100,boxShadow:"0 4px 20px rgba(0,0,0,0.2)",maxWidth:"88vw",textAlign:"center"}}>{toast.msg}</div>}
    </div>
  );
}


/* ─── Contas a Pagar ─────────────────────────────── */
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
function DashTab({monthTxs,receitas,despesas,resultado,saldo,month,year,MONTHS,totalObrig,C,fmtBRL,setNotaModal,openTaxation,contasPagar}){
  return(<>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
      <Card><SmLabel>Receita</SmLabel><BigVal color={C.navyMid}>{fmtBRL(receitas)}</BigVal></Card>
      <Card><SmLabel>Despesas</SmLabel><BigVal color={C.red}>{fmtBRL(despesas)}</BigVal></Card>
    </div>

    <Card style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <SmLabel>Saldo Atual</SmLabel>
          <p style={{margin:"2px 0 0",fontSize:11,color:"#BBB"}}>Receita - Contas a Pagar · {MONTHS[month]} {year}</p>
        </div>
        <div style={{textAlign:"right"}}>
          <p style={{margin:0,fontSize:26,fontWeight:"bold",color:saldo>=0?C.navyMid:C.red,letterSpacing:-1}}>{fmtBRL(saldo)}</p>
          <span style={{fontSize:10,background:saldo>=0?C.navyLight:C.redLight,color:saldo>=0?C.navyMid:C.red,borderRadius:6,padding:"2px 8px",fontWeight:"600"}}>
            {saldo>=0?"▲ Positivo":"▼ Negativo"}
          </span>
        </div>
      </div>
    </Card>
    <Card id="obrigacoes-mensais" style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14}}>
        <div style={{minWidth:0}}>
          <p style={{margin:0,fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Obrigações do mês</p>
          <p style={{margin:"6px 0 0",fontSize:26,fontWeight:"bold",color:C.navyMid,letterSpacing:-0.7}}>{fmtBRL(totalObrig)}</p>
          <p style={{margin:"5px 0 0",fontSize:11,color:C.muted,lineHeight:1.45}}>DAS + INSS + IRRF + Contabilidade</p>
        </div>
        <button onClick={openTaxation} style={{background:"none",border:"none",padding:0,marginTop:10,color:C.navyMid,fontFamily:"inherit",fontSize:13,fontWeight:"700",cursor:"pointer",whiteSpace:"nowrap"}}>Ver Tributação ›</button>
      </div>
    </Card>
    {(()=>{
      const recMes=monthTxs.filter(t=>t.tipo==="receita");
      const emitEnv=recMes.filter(t=>t.notaGerada&&t.informadoContab);
      const emitPend=recMes.filter(t=>t.notaGerada&&!t.informadoContab);
      const naoEmit=recMes.filter(t=>!t.notaGerada);
      const nfBtns=[
        {key:"emitEnviadas",  label:"Emitidas Enviadas",  count:emitEnv.length,  color:"#27AE60",  bg:"#EAFAF1", border:"#A9DFBF"},
        {key:"emitPendentes", label:"Emitidas Pendentes", count:emitPend.length, color:C.navyMid,  bg:C.navyLight,border:"#B8DEC0"},
        {key:"pendentes",     label:"À Emitir",            count:naoEmit.length,  color:"#E67E22", bg:"#FFF8F0", border:"#F0C89A"},
      ];
      return(
        <Card style={{marginBottom:12}}>
          <SmLabel style={{marginBottom:14}}>Notas Fiscais — {MONTHS[month]}</SmLabel>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {nfBtns.map(btn=>(
              <button key={btn.key} onClick={()=>setNotaModal(btn.key)}
                style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:btn.count>0?btn.bg:"#FAFAF8",border:`1.5px solid ${btn.count>0?btn.border:"#E8E0D8"}`,borderRadius:14,padding:"14px 16px",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                <div>
                  <p style={{margin:0,fontSize:13,fontWeight:"700",color:btn.count>0?btn.color:"#CCC"}}>{btn.label}</p>
                  <p style={{margin:"2px 0 0",fontSize:10,color:btn.count>0?btn.color:"#CCC",opacity:0.8}}>toque para ver</p>
                </div>
                <p style={{margin:0,fontSize:28,fontWeight:"bold",color:btn.count>0?btn.color:"#CCC",lineHeight:1}}>{btn.count}</p>
              </button>
            ))}
          </div>
        </Card>
      );
    })()}
    <Card style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:12}}>
        <div>
          <SmLabel>Contas a Pagar</SmLabel>
          <p style={{margin:"4px 0 0",fontSize:11,color:"#BBB"}}>Tributos e obrigações de {contasPagar?.competenceLabel || "mês anterior"}</p>
        </div>
        <div style={{textAlign:"right"}}>
          <p style={{margin:0,fontSize:18,fontWeight:"bold",color:C.navyMid}}>{fmtBRL(contasPagar?.total || 0)}</p>
          <p style={{margin:"2px 0 0",fontSize:9,color:C.muted}}>Total</p>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {(contasPagar?.items || []).map(item=>(
          <div key={item.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FAFAF8",border:`1px solid ${C.border}`,borderRadius:12,padding:"11px 13px"}}>
            <div style={{minWidth:0}}>
              <p style={{margin:0,fontSize:13,fontWeight:"700",color:C.text}}>{item.label}</p>
              <p style={{margin:"3px 0 0",fontSize:10,color:C.muted}}>{item.timing}</p>
            </div>
            <p style={{margin:0,fontSize:13,fontWeight:"bold",color:item.amount>0?C.navyMid:"#BBB"}}>{fmtBRL(item.amount)}</p>
          </div>
        ))}
      </div>
    </Card>
  </>);
}

function LancTab({monthTxs,receitas,despesas,resultado,month,year,MONTHS,C,fmtBRL,openNew,openEdit,delTx}){
  return(<>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
      <button onClick={()=>openNew("receita")} style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,border:"none",borderRadius:16,padding:"16px",color:"white",fontSize:15,fontFamily:"inherit",fontWeight:"700",cursor:"pointer",boxShadow:"0 4px 18px rgba(15,30,53,0.3)"}}>💰 + Receita</button>
      <button onClick={()=>openNew("despesa")} style={{background:"linear-gradient(135deg,#962d22,#C0392B)",border:"none",borderRadius:16,padding:"16px",color:"white",fontSize:15,fontFamily:"inherit",fontWeight:"700",cursor:"pointer",boxShadow:"0 4px 18px rgba(192,57,43,0.3)"}}>💸 + Despesa</button>
    </div>
    <button onClick={()=>openNew("distribuicao")} style={{width:"100%",background:`linear-gradient(135deg,${C.gold},#B89454)`,border:"none",borderRadius:16,padding:"14px 16px",marginBottom:14,color:"white",fontSize:14,fontFamily:"inherit",fontWeight:"700",cursor:"pointer",boxShadow:"0 4px 18px rgba(200,169,110,0.25)"}}>💰 + Distribuição de Lucro</button>
    <div style={{background:"white",borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",gap:12,boxShadow:"0 1px 8px rgba(0,0,0,0.05)"}}>
      <MS label="Receitas" value={receitas} color={C.navyMid} f={fmtBRL}/>
      <div style={{width:1,background:C.border}}/>
      <MS label="Despesas" value={despesas} color={C.red} f={fmtBRL}/>
      <div style={{width:1,background:C.border}}/>
      <MS label="Resultado" value={resultado} color={resultado>=0?C.navyMid:C.red} f={fmtBRL}/>
    </div>
    <p style={{margin:"0 0 10px",fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{MONTHS[month]} {year} · {monthTxs.length} registros</p>
    {monthTxs.length===0
      ?<div style={{background:"white",borderRadius:18,padding:"36px 20px",textAlign:"center",border:"1px dashed #E0D8CE"}}>
        <p style={{fontSize:36,margin:0}}>📋</p>
        <p style={{margin:"8px 0 16px",fontSize:14,color:"#CCC"}}>Nenhum lançamento neste mês</p>
        <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
          <button onClick={()=>openNew("receita")} style={{background:C.navyLight,border:"none",borderRadius:12,padding:"10px 18px",color:C.navyMid,fontSize:13,fontFamily:"inherit",cursor:"pointer",fontWeight:"600"}}>+ Receita</button>
          <button onClick={()=>openNew("despesa")} style={{background:C.redLight,border:"none",borderRadius:12,padding:"10px 18px",color:C.red,fontSize:13,fontFamily:"inherit",cursor:"pointer",fontWeight:"600"}}>+ Despesa</button>
          <button onClick={()=>openNew("distribuicao")} style={{background:"#F8F1E5",border:"none",borderRadius:12,padding:"10px 18px",color:C.gold,fontSize:13,fontFamily:"inherit",cursor:"pointer",fontWeight:"600"}}>+ Distribuição de Lucro</button>
        </div>
      </div>
      :monthTxs.map(tx=><TxCard key={tx.id} tx={tx} onEdit={openEdit} onDelete={delTx} C={C} fmtBRL={fmtBRL} MONTHS={MONTHS}/>)
    }
  </>);
}

function StatTab({monthTxs,receitas,despesas,month,year,MONTHS,C,fmtV,setDrillModal,fmtBRL,DAS,INSS,IRRF,CTB}){
  const stats=getMonthlyStatistics(monthTxs);
  const recMes=stats.receitas;
  const ECOLS={"Endodontia":C.navyMid,"Ortodontia":C.gold,"Outros":C.muted};
  return(<>
    <ReportButton onGenerate={() => generateMonthlyReportPdf({
      year,
      month,
      monthLabel: MONTHS[month],
      stats,
      taxes: { das: DAS, inss: INSS, irrf: IRRF, contabilidade: CTB, proLabore: PLef },
      transactions: monthTxs,
    })} />
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <p style={{margin:0,fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{MONTHS[month]} {year}</p>
    </div>

    {/* Receita por Clínica por Especialidade */}
    <Card style={{marginBottom:12}}>
      <SmLabel style={{marginBottom:14}}>Receita por Clínica</SmLabel>
      {recMes.length===0?<p style={{textAlign:"center",color:"#CCC",fontSize:13,padding:"20px 0"}}>Nenhuma receita neste mês</p>
      :["Endodontia","Ortodontia","Outros"].map(esp=>{
        const items=esp==="Outros"?recMes.filter(t=>!t.especialidade||t.especialidade===""):recMes.filter(t=>t.especialidade===esp);
        if(items.length===0)return null;
        const byC=items.reduce((a,t)=>{a[t.nome]=(a[t.nome]||0)+t.valor;return a;},{});
        const tot=items.reduce((s,t)=>s+t.valor,0);
        return(
          <div key={esp} style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:11,fontWeight:"700",color:ECOLS[esp],letterSpacing:1,textTransform:"uppercase"}}>{esp}</span>
              <span style={{fontSize:12,fontWeight:"bold",color:ECOLS[esp]}}>{fmtV(tot)}</span>
            </div>
            {Object.entries(byC).sort((a,b)=>b[1]-a[1]).map(([nome,val])=>(
              <div key={nome} style={{marginBottom:10,paddingLeft:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:13,color:C.text}}>{nome}</span>
                  <span style={{fontSize:13,fontWeight:"bold",color:ECOLS[esp]}}>{fmtV(val)}</span>
                </div>
                <div style={{height:4,background:"#F0EBE3",borderRadius:4}}>
                  <div style={{height:4,width:`${receitas>0?(val/receitas)*100:0}%`,background:ECOLS[esp],borderRadius:4,opacity:0.8}}/>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </Card>

    {/* Especialidade pie */}
    {(()=>{
      const endo=recMes.filter(t=>t.especialidade==="Endodontia").reduce((s,t)=>s+t.valor,0);
      const orto=recMes.filter(t=>t.especialidade==="Ortodontia").reduce((s,t)=>s+t.valor,0);
      const outros=recMes.filter(t=>!t.especialidade||t.especialidade==="").reduce((s,t)=>s+t.valor,0);
      const tot=endo+orto+outros;
      const data=[endo>0&&{name:"Endodontia",value:endo,color:C.navyMid},orto>0&&{name:"Ortodontia",value:orto,color:C.gold},outros>0&&{name:"Outros",value:outros,color:C.muted}].filter(Boolean);
      if(tot===0)return null;
      return(
        <Card style={{marginBottom:12}}>
          <SmLabel style={{marginBottom:4}}>Receita por Especialidade</SmLabel>
          <p style={{margin:"2px 0 14px",fontSize:11,color:"#BBB"}}>{MONTHS[month]} {year} · toque para detalhar</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart><Pie data={data} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({percent})=>`${(percent*100).toFixed(0)}%`} labelLine={false} onClick={e=>setDrillModal({title:e.name,items:e.name==="Outros"?recMes.filter(t=>!t.especialidade||t.especialidade===""):recMes.filter(t=>t.especialidade===e.name)})}>
              {data.map((e,i)=><Cell key={i} fill={e.color} style={{cursor:"pointer"}}/>)}
            </Pie><Tooltip formatter={v=>fmtBRL(v)}/><Legend onClick={e=>setDrillModal({title:e.value,items:e.value==="Outros"?recMes.filter(t=>!t.especialidade||t.especialidade===""):recMes.filter(t=>t.especialidade===e.value)})} wrapperStyle={{cursor:"pointer"}}/></PieChart>
          </ResponsiveContainer>
          {data.map(d=>(
            <button key={d.name} onClick={()=>setDrillModal({title:d.name,items:d.name==="Outros"?recMes.filter(t=>!t.especialidade||t.especialidade===""):recMes.filter(t=>t.especialidade===d.name)})} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#F8F8F8",borderRadius:10,padding:"10px 14px",border:"1px solid #EEE",borderLeftWidth:4,borderLeftColor:d.color,cursor:"pointer",fontFamily:"inherit",width:"100%",textAlign:"left",marginBottom:8}}>
              <span style={{fontSize:13,color:C.text,fontWeight:"600"}}>{d.name}</span>
              <div style={{textAlign:"right"}}><p style={{margin:0,fontSize:13,fontWeight:"bold",color:d.color}}>{fmtV(d.value)}</p><p style={{margin:0,fontSize:11,color:"#AAA"}}>{tot>0?((d.value/tot)*100).toFixed(1):0}%</p></div>
            </button>
          ))}
        </Card>
      );
    })()}

    {/* Receitas vs Despesas pie */}
    {(()=>{
      const tot=receitas+despesas;
      const data=[receitas>0&&{name:"Receitas",value:receitas,color:C.navyMid},despesas>0&&{name:"Despesas",value:despesas,color:C.red}].filter(Boolean);
      if(tot===0)return null;
      return(
        <Card>
          <SmLabel style={{marginBottom:4}}>Receitas vs Despesas</SmLabel>
          <p style={{margin:"2px 0 14px",fontSize:11,color:"#BBB"}}>{MONTHS[month]} {year} · toque para detalhar</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart><Pie data={data} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({percent})=>`${(percent*100).toFixed(0)}%`} labelLine={false} onClick={e=>setDrillModal({title:e.name,items:monthTxs.filter(t=>e.name==="Receitas"?t.tipo==="receita":t.tipo==="despesa")})}>
              {data.map((e,i)=><Cell key={i} fill={e.color} style={{cursor:"pointer"}}/>)}
            </Pie><Tooltip formatter={v=>fmtBRL(v)}/><Legend onClick={e=>setDrillModal({title:e.value,items:monthTxs.filter(t=>e.value==="Receitas"?t.tipo==="receita":t.tipo==="despesa")})} wrapperStyle={{cursor:"pointer"}}/></PieChart>
          </ResponsiveContainer>
          {data.map(d=>(
            <button key={d.name} onClick={()=>setDrillModal({title:d.name,items:monthTxs.filter(t=>d.name==="Receitas"?t.tipo==="receita":t.tipo==="despesa")})} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#F8F8F8",borderRadius:10,padding:"10px 14px",border:"1px solid #EEE",borderLeftWidth:4,borderLeftColor:d.color,cursor:"pointer",fontFamily:"inherit",width:"100%",textAlign:"left",marginBottom:8}}>
              <span style={{fontSize:13,color:C.text,fontWeight:"600"}}>{d.name}</span>
              <div style={{textAlign:"right"}}><p style={{margin:0,fontSize:13,fontWeight:"bold",color:d.color}}>{fmtV(d.value)}</p><p style={{margin:0,fontSize:11,color:"#AAA"}}>{tot>0?((d.value/tot)*100).toFixed(1):0}%</p></div>
            </button>
          ))}
        </Card>
      );
    })()}
  </>);
}

function ReportButton({label="Gerar Relatório (PDF)", onGenerate}) {
  const [busy,setBusy]=useState(false);
  const handleGenerate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (typeof onGenerate !== "function") throw new Error("Relatório indisponível.");
      const blob = await onGenerate();
      await openPdfBlob(blob);
    } catch (err) {
      console.error(err);
      if (typeof window !== "undefined") {
        window.alert("Não foi possível gerar o PDF. Tente novamente.");
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={handleGenerate}
      aria-label={label}
      disabled={busy}
      style={{
        width:"100%",
        background:"white",
        border:"1px solid #E0D8CE",
        borderRadius:14,
        padding:"12px 14px",
        marginBottom:12,
        color:"#1A3055",
        fontFamily:"inherit",
        fontSize:13,
        fontWeight:"700",
        cursor:busy?"wait":"pointer",
        opacity:busy?0.7:1,
        boxShadow:"0 1px 8px rgba(0,0,0,0.04)"
      }}
    >
      {busy ? "⏳ Gerando PDF..." : `📄 ${label}`}
    </button>
  );
}

function AnualTab({txs,plMap,irrfMap,year,C,fmtBRL,calcIRRF,calcTributacao}){
  const MS=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const [taxDetail,setTaxDetail]=useState(null);
  const data=getAnnualStatistics(txs,plMap,irrfMap,year,calcIRRF,calcTributacao)
    .map((row,i)=>({...row,mes:MS[i]}));

  const fmtK=v=>v>=1000?`R$${(v/1000).toFixed(1)}k`:`R$${v.toFixed(0)}`;
  const pct=v=>`${Number(v||0).toFixed(1)}%`;
  const tooltipStyle={borderRadius:10,border:"none",boxShadow:"0 4px 12px rgba(0,0,0,0.12)",fontSize:12};
  const active=data.filter(d=>d.ativo);
  const best=active.length?active.reduce((a,b)=>b.lucro>a.lucro?b:a):null;
  const worst=active.length?active.reduce((a,b)=>b.lucro<a.lucro?b:a):null;

  const withMovingAverage=(rows,key)=>{
    let values=[];
    return rows.map((row)=>{
      values=[...values,Number(row[key]||0)].slice(-3);
      return {...row,mediaMovel:values.reduce((sum,v)=>sum+v,0)/values.length};
    });
  };

  const charts=[
    {label:"Receita total",key:"receita",color:C.navyMid,format:"money"},
    {label:"Despesas totais",key:"despesa",color:C.red,format:"money"},
    {label:"Lucro líquido",key:"lucro",color:"#2E7D32",format:"money"},
    {label:"Impostos pagos",key:"impostos",color:"#C0392B",format:"money",clickTax:true},
    {label:"Pró-labore",key:"pl",color:C.gold,format:"money"},
    {label:"INSS",key:"inss",color:"#8E44AD",format:"money"},
    {label:"IRRF",key:"irrf",color:"#C0392B",format:"money"},
    {label:"Distribuição de lucros",key:"distribuicao",color:"#B8860B",format:"money"},
    {label:"Margem líquida",key:"margem",color:C.navyMid,format:"percent"},
    {label:"Receita média mensal",key:"mediaReceitaAcumulada",color:"#5D6D7E",format:"money"},
    {label:"Melhor mês",key:"melhorMes",color:"#2E7D32",format:"money",highlight:"best"},
    {label:"Pior mês",key:"piorMes",color:C.red,format:"money",highlight:"worst"},
    {label:"Evolução mês a mês",key:"evolucao",color:"#6C7A89",format:"money",evolution:true},
  ];

  const renderChart=(ch)=>{
    let chartData=active;
    if(ch.key==="melhorMes") chartData=active.map(d=>({...d,melhorMes:d.isMelhor?d.lucro:0}));
    else if(ch.key==="piorMes") chartData=active.map(d=>({...d,piorMes:d.isPior?d.lucro:0}));
    else if(ch.key==="evolucao") chartData=active.map((d,i)=>({...d,evolucao:i===0?0:d.receita-active[i-1].receita}));
    chartData=withMovingAverage(chartData,ch.key);

    const total=ch.key==="evolucao"
      ? chartData.reduce((s,d)=>s+d.evolucao,0)
      : chartData.reduce((s,d)=>s+Number(d[ch.key]||0),0);
    const avg=ch.format==="percent"
      ? chartData.length?chartData.reduce((s,d)=>s+Number(d[ch.key]||0),0)/chartData.length:0
      : ch.key==="mediaReceitaAcumulada"
        ? (active[active.length-1]?.mediaReceitaAcumulada || 0)
        : chartData.length?total/chartData.length:0;
    const headlineValue=ch.key==="mediaReceitaAcumulada"
      ? fmtBRL(avg)
      : ch.format==="percent"
        ? pct(avg)
        : fmtBRL(total);

    return (
      <div key={ch.key} style={{background:"white",borderRadius:18,padding:"18px",marginBottom:12,boxShadow:"0 2px 16px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <p style={{margin:0,fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{ch.label}</p>
          <div style={{textAlign:"right"}}>
            <p style={{margin:0,fontSize:14,fontWeight:"bold",color:ch.color}}>
              {headlineValue}
            </p>
            {ch.format!=="percent" && ch.key!=="evolucao" && ch.key!=="mediaReceitaAcumulada" && <p style={{margin:"2px 0 0",fontSize:10,color:C.muted}}>Média: {fmtBRL(avg)}/mês</p>}
            {ch.key==="mediaReceitaAcumulada" && <p style={{margin:"2px 0 0",fontSize:10,color:C.muted}}>Média acumulada até o mês</p>}
            {ch.key==="evolucao" && <p style={{margin:"2px 0 0",fontSize:10,color:C.muted}}>Variação acumulada</p>}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={chartData} margin={{top:8,right:8,left:-8,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE3" vertical={false}/>
            <XAxis dataKey="mes" tick={{fontSize:10,fill:C.muted}} axisLine={false} tickLine={false}/>
            <YAxis
              tick={{fontSize:9,fill:C.muted}}
              tickFormatter={ch.format==="percent" ? pct : fmtK}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              formatter={(v,name)=>[
                ch.format==="percent"?pct(v):fmtBRL(v),
                name==="mediaMovel"?"Média móvel (3)":ch.label
              ]}
              contentStyle={tooltipStyle}
              labelStyle={{color:C.text,fontWeight:"600"}}
            />
            {ch.key==="mediaReceitaAcumulada" && (
              <ReferenceLine y={active.length?active[active.length-1].mediaReceitaAcumulada:0} stroke={ch.color} strokeDasharray="5 4" strokeWidth={1.5}/>
            )}
            {ch.format==="percent" && <ReferenceLine y={0} stroke="#AAA"/>}
            <Bar
              dataKey={ch.key}
              fill={ch.color}
              radius={[4,4,0,0]}
              maxBarSize={30}
              onClick={(entry)=>{
                const row = entry?.payload || entry;
                if(ch.clickTax && row?.mes) setTaxDetail(row);
              }}
              style={{cursor:ch.clickTax?"pointer":"default"}}
            >
              {(ch.highlight==="best" || ch.highlight==="worst") ? chartData.map((d,i)=>(
                <Cell key={i} fill={d.isMelhor&&ch.highlight==="best" ? "#2E7D32" : d.isPior&&ch.highlight==="worst" ? C.red : ch.color}/>
              )) : null}
            </Bar>
            <Line type="monotone" dataKey="mediaMovel" stroke="#6C7A89" strokeWidth={2} dot={false} activeDot={{r:3}}/>
          </ComposedChart>
        </ResponsiveContainer>
        {ch.key==="melhorMes" && <p style={{margin:"8px 0 0",fontSize:11,color:C.muted}}>Melhor mês: <strong>{best?.mes || "—"}</strong>{best ? ` · ${fmtBRL(best.lucro)}` : ""}</p>}
        {ch.key==="piorMes" && <p style={{margin:"8px 0 0",fontSize:11,color:C.muted}}>Pior mês: <strong>{worst?.mes || "—"}</strong>{worst ? ` · ${fmtBRL(worst.lucro)}` : ""}</p>}
        {ch.clickTax && <p style={{margin:"8px 0 0",fontSize:10,color:"#AAA"}}>Toque em uma barra para ver DAS + INSS + IRRF.</p>}
      </div>
    );
  };

  const groupedData=withMovingAverage(active,"receita").map((d,i)=>({...d,receitaMediaMovel:d.mediaMovel,despesaMediaMovel:0,lucroMediaMovel:0})).map((d,i,arr)=>{ const w=arr.slice(Math.max(0,i-2),i+1); return {...d,despesaMediaMovel:w.reduce((s,x)=>s+x.despesa,0)/w.length,lucroMediaMovel:w.reduce((s,x)=>s+x.lucro,0)/w.length}; });

  return(<>
    <ReportButton onGenerate={() => generateAnnualReportPdf({ year, rows: data })} />
    <p style={{margin:"0 0 14px",fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Dados Anuais · {year}</p>
    {charts.map(renderChart)}
    <div style={{background:"white",borderRadius:18,padding:"18px",marginBottom:12,boxShadow:"0 2px 16px rgba(0,0,0,0.06)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
        <p style={{margin:0,fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Receita × Despesa × Lucro</p>
        <p style={{margin:0,fontSize:14,fontWeight:"bold",color:C.navyMid}}>{fmtBRL(data.reduce((s,d)=>s+d.lucro,0))}</p>
      </div>
      <ResponsiveContainer width="100%" height={200}>
         <ComposedChart data={groupedData} margin={{top:8,right:8,left:-8,bottom:0}}>
           <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE3" vertical={false}/>
           <XAxis dataKey="mes" tick={{fontSize:10,fill:C.muted}} axisLine={false} tickLine={false}/>
           <YAxis tick={{fontSize:9,fill:C.muted}} tickFormatter={fmtK} axisLine={false} tickLine={false} width={48}/>
           <Tooltip
             formatter={(v,n)=>[fmtBRL(v),n==="receita"?"Receita":n==="despesa"?"Despesa":n==="lucro"?"Lucro":n==="receitaMediaMovel"?"Média móvel receita":n==="despesaMediaMovel"?"Média móvel despesa":"Média móvel lucro"]}
             contentStyle={tooltipStyle}
             labelStyle={{color:C.text,fontWeight:"600"}}
           />
           <Bar dataKey="receita" fill={C.navyMid} radius={[4,4,0,0]} maxBarSize={18}/>
           <Bar dataKey="despesa" fill={C.red} radius={[4,4,0,0]} maxBarSize={18}/>
           <Bar dataKey="lucro" fill="#2E7D32" radius={[4,4,0,0]} maxBarSize={18}/>
           <Line type="monotone" dataKey="receitaMediaMovel" stroke={C.navyMid} strokeWidth={2} dot={false}/>
           <Line type="monotone" dataKey="despesaMediaMovel" stroke={C.red} strokeWidth={2} dot={false}/>
           <Line type="monotone" dataKey="lucroMediaMovel" stroke="#2E7D32" strokeWidth={2} dot={false}/>
         </ComposedChart>
       </ResponsiveContainer>
     </div>

    {taxDetail && (
      <Modal onClose={()=>setTaxDetail(null)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <SmLabel>Impostos · {taxDetail.mes}</SmLabel>
            <p style={{margin:"4px 0 0",fontSize:20,fontWeight:"bold",color:C.navyMid}}>{fmtBRL(taxDetail.impostos)}</p>
          </div>
          <CloseBtn onClick={()=>setTaxDetail(null)}/>
        </div>
        {[
          ["DAS",taxDetail.das],
          ["INSS",taxDetail.inss],
          ["IRRF",taxDetail.irrf],
        ].map(([label,value])=>(
          <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"12px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:14,color:C.text,fontWeight:"600"}}>{label}</span>
            <span style={{fontSize:14,color:C.navyMid,fontWeight:"bold"}}>{fmtBRL(value)}</span>
          </div>
        ))}
      </Modal>
    )}
  </>);
}

function TxCard({tx,onEdit,onDelete,C,fmtBRL,MONTHS}){
  const [open,setOpen]=useState(false);
  const d=new Date(tx.data+"T12:00:00");
  const isR=tx.tipo==="receita";
  const isD=tx.tipo==="distribuicao";
  const txColor=isR?C.navyMid:isD?C.gold:C.red;
  const txBg=isR?C.navyLight:isD?"#F8F1E5":C.redLight;
  return(
    <div style={{background:"white",borderRadius:16,padding:"13px 15px",marginBottom:10,boxShadow:"0 1px 8px rgba(0,0,0,0.05)",borderLeft:`3px solid ${txColor}`}}>
      <div style={{display:"flex",alignItems:"center",gap:11}}>
        <div style={{background:txBg,borderRadius:11,padding:"7px 9px",textAlign:"center",minWidth:44}}>
          <p style={{margin:0,fontSize:15,fontWeight:"bold",color:txColor,lineHeight:1}}>{d.getDate().toString().padStart(2,"0")}</p>
          <p style={{margin:0,fontSize:9,color:"#8B7F72",letterSpacing:1}}>{MONTHS[d.getMonth()].slice(0,3).toUpperCase()}</p>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <p style={{margin:0,fontSize:13,fontWeight:"600",color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{tx.nome||"—"}</p>
          {tx.especialidade&&<p style={{margin:"1px 0 0",fontSize:11,color:C.gold,fontWeight:"600"}}>{tx.especialidade}{tx.dente?" · Dente "+tx.dente:""}</p>}
          {tx.descricao&&<p style={{margin:"1px 0 0",fontSize:11,color:"#BBB",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{tx.descricao}</p>}
          {isR&&<span style={{display:"inline-block",marginTop:3,fontSize:10,background:tx.notaGerada?"#EBF5EE":C.redLight,color:tx.notaGerada?C.navyMid:C.red,borderRadius:5,padding:"2px 7px",fontWeight:"600"}}>{tx.notaGerada?`✅ NF${tx.numeroNota?" #"+tx.numeroNota:""}`:   "⏳ NF Pendente"}</span>}
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <p style={{margin:0,fontSize:15,fontWeight:"bold",color:txColor}}>{isR?"+":isD?"":"-"}{fmtBRL(tx.valor)}</p>
          <button onClick={()=>setOpen(!open)} style={{background:"none",border:"none",color:"#CCC",fontSize:13,cursor:"pointer",padding:0}}>{open?"▲":"▾"}</button>
        </div>
      </div>
      {open&&<div style={{borderTop:"1px solid #F0EBE3",marginTop:11,paddingTop:11,display:"flex",gap:8}}>
        <button onClick={()=>onEdit(tx)} style={{flex:1,background:"#F5F5F0",border:"none",borderRadius:10,padding:"10px",color:"#444",fontSize:13,fontFamily:"inherit",cursor:"pointer",fontWeight:"600"}}>✏️ Editar</button>
        <button onClick={()=>onDelete(tx.id)} style={{flex:1,background:C.redLight,border:"none",borderRadius:10,padding:"10px",color:C.red,fontSize:13,fontFamily:"inherit",cursor:"pointer",fontWeight:"600"}}>🗑 Excluir</button>
      </div>}
    </div>
  );
}

/* ─── Micro components ───────────────────────────── */
function Modal({children,onClose}){return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:50,display:"flex",alignItems:"flex-end"}} onClick={e=>e.target===e.currentTarget&&onClose()}><div style={{background:"#FAF7F3",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:430,margin:"0 auto",padding:"22px 20px 44px",boxShadow:"0 -8px 40px rgba(0,0,0,0.18)",maxHeight:"90vh",overflowY:"auto"}}>{children}</div></div>);}
function Card({children,style}){return(<div style={{background:"white",borderRadius:18,padding:"18px",boxShadow:"0 2px 16px rgba(0,0,0,0.06)",...style}}>{children}</div>);}
function SmLabel({children,style}){return(<p style={{margin:0,fontSize:10,color:"#8B7F72",letterSpacing:2,textTransform:"uppercase",...style}}>{children}</p>);}
function BigVal({children,color}){return(<p style={{margin:"6px 0 0",fontSize:20,fontWeight:"bold",color,letterSpacing:-0.5}}>{children}</p>);}
function Field({label,children}){return(<div style={{marginBottom:13}}><label style={{display:"block",fontSize:10,color:"#8B7355",letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>{label}</label>{children}</div>);}
function Div(){return(<div style={{height:1,background:"#E0D8CE",marginBottom:14}}/>);}
function MS({label,value,color,f}){return(<div style={{flex:1,textAlign:"center"}}><p style={{margin:0,fontSize:9,color:"#AAA",letterSpacing:1.5,textTransform:"uppercase"}}>{label}</p><p style={{margin:"4px 0 0",fontSize:12,fontWeight:"bold",color}}>{f(value)}</p></div>);}
function Pill({children,color,bg}){return(<span style={{background:bg,color,borderRadius:10,padding:"5px 14px",fontSize:13,fontWeight:"700"}}>{children}</span>);}
function CloseBtn({onClick}){return(<button onClick={onClick} style={{background:"#EDEDE8",border:"none",borderRadius:50,width:32,height:32,fontSize:15,cursor:"pointer",color:"#555"}}>✕</button>);}
function TogBtn({active,color,bg,onClick,children}){return(<button onClick={onClick} style={{flex:1,padding:"11px",borderRadius:12,border:`2px solid ${active?color:"#E0D8CE"}`,background:active?bg:"white",color:active?color:"#BBB",fontFamily:"inherit",fontSize:13,fontWeight:"600",cursor:"pointer"}}>{children}</button>);}
function ChkBox({checked,onChange}){return(<div onClick={()=>onChange(!checked)} style={{width:22,height:22,borderRadius:6,border:`2px solid ${checked?"#1A3055":"#CCC"}`,background:checked?"#1A3055":"white",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>{checked&&<span style={{color:"white",fontSize:13}}>✓</span>}</div>);}
function MoneyIn({value,onChange,onBlur,placeholder}){return(<div style={{position:"relative"}}><span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:"#8B7F72",fontSize:14}}>R$</span><input value={value} onChange={e=>onChange(e.target.value.replace(/[^0-9,]/g,""))} onBlur={onBlur} inputMode="numeric" placeholder={placeholder} style={{width:"100%",background:"white",border:"1px solid #E0D8CE",borderRadius:12,padding:"12px 14px 12px 38px",fontSize:15,fontFamily:"inherit",color:"#1A1A1A",outline:"none",boxSizing:"border-box"}}/></div>);}
