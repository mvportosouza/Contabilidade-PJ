'use client';
import { useState, useEffect, useRef } from "react";
import { deleteAllAppData, sGet, sSet, clearStorageCache } from "../lib/storage";
import { ACCOUNTING_PL_BY_MONTH } from "../lib/accounting";
import { supabase } from "../lib/supabaseClient";
import { BACKUP_VERSION, cryptoId, normalizeBackup, normalizeDateOnly } from "../lib/validators";
import { calculateMonthlyFinance, calculateAccumulatedCash } from "../lib/finance";
import { getMonthlyStatistics, getAnnualStatistics } from "../lib/statistics";
import {
  calcINSS,
  calcIRRF,
  calcRecommendedPL,
  calcTributacao,
  SALARIO_MINIMO_2026,
} from "../lib/taxes";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";

/* ─── Logo ─────────────────────────────────────── */
const LOGO = "/assets/logo-horizontal.jpeg";

/* ─── Constants ─────────────────────────────────── */
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const TIPOS_DESP = ["DAS","Pró-Labore","Distribuição de Lucros","INSS","Taxa","Imposto","Conta","Contabilidade","Escritório Virtual","Material","Outros"];
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
  const [showTaxation,setShowTaxation]=useState(false);
  const [accountActionBusy,setAccountActionBusy]=useState(false);
  const importFileRef = useRef(null);
  const [hideVal,setHideVal]=useState(false);
  const [toast,setToast]=useState(null);

  const [form,setForm]=useState(()=>createBlankForm(now));

  useEffect(()=>{
    (async()=>{
      const t=await sGet("pj_tx2")||[];
      const fv=await sGet("pj_favs2")||[];
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
  const monthTxs = financeMonth.lancamentos;
  const receitas = financeMonth.receitas;
  const despesas = financeMonth.despesas;
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

  // Saldo de caixa acumulado até o período selecionado.
  // Somente movimentações efetivamente lançadas alteram o caixa.
  // DAS/INSS/IRRF/contabilidade calculados acima são obrigações/provisões;
  // quando forem pagos, o pagamento deve ser lançado como despesa.
  const saldo = calculateAccumulatedCash(txs, year, month, 0);

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
    setTxs(d); await sSet("pj_tx2",d);
    const fresh=await sGet("pj_pl")||{};
    const freshM=await sGet("pj_plm")||{};
    const up=await cascadePL(d,freshM);
    setPlMap(up);
  };
  const saveFavs=async d=>{setFavs(d);await sSet("pj_favs2",d);};
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
    const normalizedData = normalizeDateOnly(form.data); if(!normalizedData){notify("Data inválida.","err");return;} const tx={id:editId||cryptoId(),tipo:formTipo,valor,data:normalizedData,nome:form.nome||form.categoria,cnpj:form.cnpj,telefone:form.telefone,cep:form.cep,endereco:form.endereco,email:form.email,especialidade:form.especialidade,dente:form.dente,categoria:form.categoria,descricao:form.descricao,notaGerada:form.notaGerada,numeroNota:form.notaGerada?form.numeroNota:"",dataEmissao:form.notaGerada?(normalizeDateOnly(form.dataEmissao)||""):"",taxaISS:form.notaGerada?form.taxaISS:"",informadoContab:form.notaGerada?form.informadoContab:false};
    await saveTxs(editId?txs.map(t=>t.id===editId?tx:t):[tx,...txs]);
    if(form.saveAsFav){
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

  const favsAtt=formTipo==="receita"?favs.filter(f=>f.tipo==="receita"):favs.filter(f=>f.tipo==="despesa");
  const fmtV=v=>hideVal?"R$ ···":fmtBRL(v);
  const openTaxation=()=>setShowTaxation(true);
  const goToTaxation=()=>{ setTab("dashboard"); setShowTaxation(true); };
  const nav=[{id:"dashboard",label:"Início",icon:"◎"},{id:"lancamentos",label:"Lançamentos",icon:"≡"},{id:"estatistica",label:"Estatística",icon:"◑"},{id:"anual",label:"Anual",icon:"▦"},{id:"mais",label:"Mais",icon:"⋯",action:goToTaxation}];

  /* ══ RENDER ══════════════════════════════════════════════ */
  return (
    <div style={{fontFamily:"Georgia,serif",background:C.bg,minHeight:"100vh",maxWidth:430,margin:"0 auto",position:"relative"}}>

      {/* Header */}
      <div style={{background:"linear-gradient(180deg,#0F1E35,#1A3055)",position:"sticky",top:0,zIndex:30,boxShadow:"0 2px 12px rgba(0,0,0,0.2)"}}>
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
          <button onClick={()=>setShowSettings(true)} aria-label="Configurações" style={{background:"rgba(200,169,110,0.2)",border:"1px solid rgba(200,169,110,0.5)",borderRadius:10,padding:"8px 12px",color:"#C8A96E",fontSize:16,cursor:"pointer",flexShrink:0,zIndex:10}}>⚙️</button>
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
            totalObrig={totalObrig} C={C} fmtBRL={fmtBRL} openTaxation={openTaxation}
            setNotaModal={setNotaModal}
          />
        )}

        {/* ── LANÇAMENTOS ── */}
        {tab==="lancamentos" && (
          <LancTab
            monthTxs={monthTxs} receitas={receitas} despesas={despesas} resultado={resultado}
            month={month} year={year} MONTHS={MONTHS} C={C} fmtBRL={fmtBRL}
            openNew={openNew} openEdit={openEdit} delTx={delTx}
          />
        )}

        {/* ── ESTATÍSTICA ── */}
        {tab==="anual" && (
          <AnualTab txs={txs} plMap={effectivePlMap} irrfMap={irrfMap} year={year} C={C} fmtBRL={fmtBRL} calcIRRF={calcIRRF}/>
        )}

        {tab==="estatistica" && (
          <StatTab
            monthTxs={monthTxs} receitas={receitas} despesas={despesas}
            month={month} year={year} MONTHS={MONTHS} C={C}
            fmtV={fmtV} hideVal={hideVal} setHideVal={setHideVal}
            setDrillModal={setDrillModal} fmtBRL={fmtBRL}
          />
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"rgba(248,245,241,0.97)",backdropFilter:"blur(14px)",borderTop:`1px solid ${C.border}`,display:"flex",paddingBottom:16,zIndex:40}}>
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
              <Pill color={formTipo==="receita"?C.navyMid:C.red} bg={formTipo==="receita"?C.navyLight:C.redLight}>{formTipo==="receita"?"💰 Receita":"💸 Despesa"}</Pill>
              <span style={{fontSize:13,color:"#999"}}>{editId?"Editar":"Novo"}</span>
            </div>
            <div style={{display:"flex",gap:8}}>
              {favsAtt.length>0 && <button onClick={()=>setShowFavPick(true)} style={{background:formTipo==="receita"?C.navyLight:C.redLight,border:"none",borderRadius:10,padding:"7px 12px",color:formTipo==="receita"?C.navyMid:C.red,fontSize:13,cursor:"pointer"}}>⭐ Favs</button>}
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
          <button onClick={handleSubmit} style={{width:"100%",background:formTipo==="receita"?`linear-gradient(135deg,${C.navy},${C.navyMid})`:"linear-gradient(135deg,#962d22,#C0392B)",color:"white",border:"none",borderRadius:16,padding:"16px",fontSize:16,fontFamily:"inherit",cursor:"pointer",fontWeight:"600"}}>
            {editId?"Salvar Alterações":formTipo==="receita"?"Registrar Receita":"Registrar Despesa"}
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
                      <p style={{margin:0,fontSize:15,fontWeight:"bold",color:cfg.color,flexShrink:0,marginLeft:12}}>{fmtBRL(tx.valor)}</p>
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
              <p style={{margin:"3px 0 0",fontSize:11,color:C.muted}}>{drillModal.items.length} lançamentos · {fmtBRL(drillModal.items.reduce((s,t)=>s+t.valor,0))}</p>
            </div>
            <CloseBtn onClick={()=>setDrillModal(null)}/>
          </div>
          {drillModal.items.map(tx=>{
            const d=new Date(tx.data+"T12:00:00"); const isR=tx.tipo==="receita";
            return (
              <div key={tx.id} style={{background:"white",borderRadius:14,padding:"13px 15px",marginBottom:10,boxShadow:"0 1px 8px rgba(0,0,0,0.05)",borderLeft:`3px solid ${isR?C.navyMid:C.red}`}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <div>
                    <p style={{margin:0,fontSize:13,fontWeight:"600",color:C.text}}>{tx.nome||"—"}</p>
                    {tx.especialidade&&<p style={{margin:"1px 0 0",fontSize:11,color:C.gold,fontWeight:"600"}}>{tx.especialidade}{tx.dente?" · Dente "+tx.dente:""}</p>}
                    <p style={{margin:"3px 0 0",fontSize:11,color:C.muted}}>{d.getDate().toString().padStart(2,"0")}/{(d.getMonth()+1).toString().padStart(2,"0")}/{d.getFullYear()}</p>
                  </div>
                  <p style={{margin:0,fontSize:15,fontWeight:"bold",color:isR?C.navyMid:C.red}}>{isR?"+":"-"}{fmtBRL(tx.valor)}</p>
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
                <p style={{margin:0,fontSize:16,fontWeight:"bold",color:"#E67E22"}}>{fmtBRL(DAS)}</p>
              </div>
              <div style={{background:"#FFFBF0",borderRadius:10,padding:"8px 12px",border:"1px solid #F0E0A0"}}>
                <p style={{margin:0,fontSize:11,color:"#7A5800",lineHeight:1.5}}>📊 RBT12 considerado: <b>{fmtBRL(rbt12)}</b>{mesesR<13&&<span><br/>📈 Regra de início de atividade · {mesesR} {mesesR===1?"mês":"meses"}</span>}</p>
              </div>
            </div>
            <Div/>
            <div style={{paddingBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div><p style={{margin:0,fontSize:13,fontWeight:"600",color:C.text}}>Pró-labore</p><p style={{margin:"2px 0 0",fontSize:11,color:C.muted}}>Fator R: {(fatorR*100).toFixed(2)}% · conforme contabilidade</p></div>
                <p style={{margin:0,fontSize:15,fontWeight:"bold",color:C.navyMid}}>{fmtBRL(PLef)}</p>
              </div>
              <MoneyIn value={plIn||fmtIn(String(Math.round(PLef*100)))} onChange={setPlIn} onBlur={commitPL} placeholder={fmtIn(String(Math.round(PLauto*100)))}/>
              <div style={{background:C.navyLight,borderRadius:10,padding:"8px 12px",marginTop:8}}>
                <p style={{margin:0,fontSize:11,color:C.navyMid,lineHeight:1.5}}>🔒 Automático: pró-labore planejado para levar o próximo Fator R a ≥ 28%, considerando folha + CPP · Deixe em branco para usar o valor automático</p>
              </div>
            </div>
            <Div/>
            <div style={{paddingBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div><p style={{margin:0,fontSize:13,fontWeight:"600",color:C.text}}>INSS do Sócio 🔒</p><p style={{margin:"2px 0 0",fontSize:11,color:C.muted}}>11% sobre {fmtBRL(PLef)} · automático</p></div>
                <p style={{margin:0,fontSize:16,fontWeight:"bold",color:"#8E44AD"}}>{fmtBRL(INSS)}</p>
              </div>
            </div>
            <Div/>
            <div style={{paddingBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div><p style={{margin:0,fontSize:13,fontWeight:"600",color:C.text}}>Contabilidade</p><p style={{margin:"2px 0 0",fontSize:11,color:C.muted}}>Custo mensal do contador</p></div>
                {CTB>0&&<p style={{margin:0,fontSize:14,fontWeight:"bold",color:"#2980B9"}}>{fmtBRL(CTB)}</p>}
              </div>
              <MoneyIn value={ctbIn} onChange={setCtbIn} onBlur={commitCtb} placeholder="0,00"/>
            </div>
            <Div/>
            <div style={{paddingBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div><p style={{margin:0,fontSize:13,fontWeight:"600",color:C.text}}>IRRF</p><p style={{margin:"2px 0 0",fontSize:11,color:C.muted}}>Tabela progressiva 2026 · base: pró-labore − INSS</p></div>
                <p style={{margin:0,fontSize:14,fontWeight:"bold",color:"#C0392B"}}>{fmtBRL(IRRFef)}</p>
              </div>
              <MoneyIn value={irrfIn||fmtIn(String(Math.round(IRRFef*100)))} onChange={setIrrfIn} onBlur={commitIrrf} placeholder={fmtIn(String(Math.round(IRRFauto*100)))}/>
              <div style={{background:"#FFF5F5",borderRadius:10,padding:"8px 12px",marginTop:8}}>
                <p style={{margin:0,fontSize:11,color:"#C0392B",lineHeight:1.6}}>🔒 Tabela 2026 + Lei 15.270/25 · isento até R$ 5.000 · redutor R$ 5.000–7.350 · acima R$ 7.350 tabela normal<br/>Sugestão: {fmtBRL(IRRFauto)}</p>
              </div>
            </div>
            <Div/>
            <div style={{paddingTop:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <p style={{margin:0,fontSize:14,fontWeight:"700",color:C.text}}>Total de Obrigações</p>
              <p style={{margin:0,fontSize:18,fontWeight:"bold",color:C.red}}>{fmtBRL(totalObrig)}</p>
            </div>
          </Card>
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

/* ─── Tab Components ─────────────────────────────── */
function DashTab({monthTxs,receitas,despesas,resultado,saldo,month,year,MONTHS,totalObrig,C,fmtBRL,setNotaModal,openTaxation}){
  return(<>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
      <Card><SmLabel>Receita</SmLabel><BigVal color={C.navyMid}>{fmtBRL(receitas)}</BigVal></Card>
      <Card><SmLabel>Despesas</SmLabel><BigVal color={C.red}>{fmtBRL(despesas)}</BigVal></Card>
    </div>

    <Card style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <SmLabel>Saldo Acumulado</SmLabel>
          <p style={{margin:"2px 0 0",fontSize:11,color:"#BBB"}}>Resultado acumulado dos lançamentos até {MONTHS[month]} {year}</p>
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
          <p style={{margin:"5px 0 0",fontSize:11,color:C.muted,lineHeight:1.45}}>DAS + INSS + IRRF + contabilidade</p>
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
        {key:"pendentes",     label:"À Emitir",            count:naoEmit.length,  color:"#E67E22",  bg:"#FFF8F0", border:"#F0C89A"},
      ];
      return(
        <Card>
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
  </>);
}

function LancTab({monthTxs,receitas,despesas,resultado,month,year,MONTHS,C,fmtBRL,openNew,openEdit,delTx}){
  return(<>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
      <button onClick={()=>openNew("receita")} style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,border:"none",borderRadius:16,padding:"16px",color:"white",fontSize:15,fontFamily:"inherit",fontWeight:"700",cursor:"pointer",boxShadow:"0 4px 18px rgba(15,30,53,0.3)"}}>💰 + Receita</button>
      <button onClick={()=>openNew("despesa")} style={{background:"linear-gradient(135deg,#962d22,#C0392B)",border:"none",borderRadius:16,padding:"16px",color:"white",fontSize:15,fontFamily:"inherit",fontWeight:"700",cursor:"pointer",boxShadow:"0 4px 18px rgba(192,57,43,0.3)"}}>💸 + Despesa</button>
    </div>
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
        <div style={{display:"flex",gap:8,justifyContent:"center"}}>
          <button onClick={()=>openNew("receita")} style={{background:C.navyLight,border:"none",borderRadius:12,padding:"10px 18px",color:C.navyMid,fontSize:13,fontFamily:"inherit",cursor:"pointer",fontWeight:"600"}}>+ Receita</button>
          <button onClick={()=>openNew("despesa")} style={{background:C.redLight,border:"none",borderRadius:12,padding:"10px 18px",color:C.red,fontSize:13,fontFamily:"inherit",cursor:"pointer",fontWeight:"600"}}>+ Despesa</button>
        </div>
      </div>
      :monthTxs.map(tx=><TxCard key={tx.id} tx={tx} onEdit={openEdit} onDelete={delTx} C={C} fmtBRL={fmtBRL} MONTHS={MONTHS}/>)
    }
  </>);
}

function StatTab({monthTxs,receitas,despesas,month,year,MONTHS,C,fmtV,hideVal,setHideVal,setDrillModal,fmtBRL}){
  const stats=getMonthlyStatistics(monthTxs);
  const recMes=stats.receitas;
  const ECOLS={"Endodontia":C.navyMid,"Ortodontia":C.gold,"Outros":C.muted};
  return(<>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <p style={{margin:0,fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{MONTHS[month]} {year}</p>
      <button onClick={()=>setHideVal(v=>!v)} style={{background:hideVal?C.navyMid:"white",border:`1.5px solid ${hideVal?C.navyMid:C.border}`,borderRadius:10,padding:"7px 14px",color:hideVal?"white":C.muted,fontSize:12,fontFamily:"inherit",fontWeight:"600",cursor:"pointer"}}>
        {hideVal?"👁 Mostrar valores":"🙈 Ocultar valores"}
      </button>
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

function AnualTab({txs,plMap,irrfMap,year,C,fmtBRL,calcIRRF}){
  const MS=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const data=getAnnualStatistics(txs,plMap,irrfMap,year,calcIRRF).map((row,i)=>({...row,mes:MS[i]})).filter(d=>d.receita>0||d.pl>0);

  if(data.length===0) return(
    <div style={{background:"white",borderRadius:18,padding:"40px 20px",textAlign:"center",border:"1px dashed #E0D8CE"}}>
      <p style={{fontSize:36,margin:0}}>📊</p>
      <p style={{margin:"8px 0 0",fontSize:14,color:"#CCC"}}>Nenhum dado em {year}</p>
    </div>
  );

  const charts=[
    {label:"Receita Mensal",    key:"receita", color:"#1A3055"},
    {label:"Pró-labore Mensal", key:"pl",      color:"#C8A96E"},
    {label:"INSS Mensal",       key:"inss",    color:"#8E44AD"},
    {label:"IRRF Mensal",       key:"irrf",    color:"#C0392B"},
  ];
  const fmtK=v=>v>=1000?`R$${(v/1000).toFixed(1)}k`:`R$${v.toFixed(0)}`;

  return(<>
    <p style={{margin:"0 0 14px",fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Visão Anual · {year}</p>
    {charts.map(ch=>{
      const total=data.reduce((s,d)=>s+d[ch.key],0);
      const media=data.length>0?total/data.length:0;
      return(
        <div key={ch.key} style={{background:"white",borderRadius:18,padding:"18px",marginBottom:12,boxShadow:"0 2px 16px rgba(0,0,0,0.06)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
            <p style={{margin:0,fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{ch.label}</p>
            <div style={{textAlign:"right"}}>
              <p style={{margin:0,fontSize:14,fontWeight:"bold",color:ch.color}}>{fmtBRL(total)}</p>
              <p style={{margin:"2px 0 0",fontSize:10,color:C.muted}}>Média: {fmtBRL(media)}/mês</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data} margin={{top:8,right:8,left:-8,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE3" vertical={false}/>
              <XAxis dataKey="mes" tick={{fontSize:10,fill:C.muted}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:9,fill:C.muted}} tickFormatter={fmtK} axisLine={false} tickLine={false} width={48}/>
              <Tooltip
                formatter={v=>[fmtBRL(v)]}
                contentStyle={{borderRadius:10,border:"none",boxShadow:"0 4px 12px rgba(0,0,0,0.12)",fontSize:12}}
                labelStyle={{color:C.text,fontWeight:"600"}}
              />
              <ReferenceLine
                y={media}
                stroke={ch.color}
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{value:`Média`,position:"insideTopRight",fontSize:9,fill:ch.color,fontWeight:"600"}}
              />
              <Bar dataKey={ch.key} fill={ch.color} radius={[4,4,0,0]} maxBarSize={36}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    })}
  </>);
}

function TxCard({tx,onEdit,onDelete,C,fmtBRL,MONTHS}){
  const [open,setOpen]=useState(false);
  const d=new Date(tx.data+"T12:00:00"); const isR=tx.tipo==="receita";
  return(
    <div style={{background:"white",borderRadius:16,padding:"13px 15px",marginBottom:10,boxShadow:"0 1px 8px rgba(0,0,0,0.05)",borderLeft:`3px solid ${isR?C.navyMid:C.red}`}}>
      <div style={{display:"flex",alignItems:"center",gap:11}}>
        <div style={{background:isR?C.navyLight:C.redLight,borderRadius:11,padding:"7px 9px",textAlign:"center",minWidth:44}}>
          <p style={{margin:0,fontSize:15,fontWeight:"bold",color:isR?C.navyMid:C.red,lineHeight:1}}>{d.getDate().toString().padStart(2,"0")}</p>
          <p style={{margin:0,fontSize:9,color:"#8B7F72",letterSpacing:1}}>{MONTHS[d.getMonth()].slice(0,3).toUpperCase()}</p>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <p style={{margin:0,fontSize:13,fontWeight:"600",color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{tx.nome||"—"}</p>
          {tx.especialidade&&<p style={{margin:"1px 0 0",fontSize:11,color:C.gold,fontWeight:"600"}}>{tx.especialidade}{tx.dente?" · Dente "+tx.dente:""}</p>}
          {tx.descricao&&<p style={{margin:"1px 0 0",fontSize:11,color:"#BBB",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{tx.descricao}</p>}
          {isR&&<span style={{display:"inline-block",marginTop:3,fontSize:10,background:tx.notaGerada?"#EBF5EE":C.redLight,color:tx.notaGerada?C.navyMid:C.red,borderRadius:5,padding:"2px 7px",fontWeight:"600"}}>{tx.notaGerada?`✅ NF${tx.numeroNota?" #"+tx.numeroNota:""}`:   "⏳ NF Pendente"}</span>}
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <p style={{margin:0,fontSize:15,fontWeight:"bold",color:isR?C.navyMid:C.red}}>{isR?"+":"-"}{fmtBRL(tx.valor)}</p>
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
