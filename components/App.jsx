'use client';
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { deleteAllAppData, sGet, sSet, replaceState } from "../lib/storage";
import { updatePassword, deleteAccount } from "../lib/auth";
import { ACCOUNTING_PL_BY_MONTH, reconcileLegacyAccountingPL } from "../lib/accounting";
import { BACKUP_VERSION, MAX_BACKUP_BYTES, cryptoId, normalizeBackup, normalizeDateOnly } from "../lib/validators";
import { calculateMonthlyDividends, withCalculatedDividendHistory } from "../lib/dividends";
import { calculateMonthlyFinance } from "../lib/finance";
import {
  calcINSS,
  calcIRRF,
  calcRecommendedPL,
  calcTributacao,
} from "../lib/taxes";
import {
  LOGO, MONTHS, TIPOS_DESP, TIPOS_REC, ESPS, SAL_MIN, C, iSt,
  fmtBRL, parseBRL, fmtIn, fmtDoc, createBlankForm, formatPhone, formatCep,
  storedMoneyInput, cascadePL, sortTransactions, sortFavorites,
  getPreviousMonthPayables,
} from "./appShared";
import {
  Modal, Card, SmLabel, Field, Div, Pill, CloseBtn,
  TogBtn, ChkBox, MoneyIn,
} from "./AppUI";
import { DashTab } from "./Dashboard/HomeTab";
import { LancTab } from "./Dashboard/FinanceTab";
import { StatTab } from "./Dashboard/StatisticsTab";
import { AnualTab } from "./Dashboard/AnnualTab";
import { TxCard } from "./Transactions/TransactionCard";

function App() {
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
  const hydratedRef = useRef(false);

  useEffect(()=>{
    (async()=>{
      const t=sortTransactions(withCalculatedDividendHistory(await sGet("pj_tx2")||[]));
      const fv=sortFavorites(await sGet("pj_favs2")||[]);
      const pl=await sGet("pj_pl")||{};
      const pmStored=await sGet("pj_plm")||{};
      const pm=reconcileLegacyAccountingPL(pmStored);
      if (JSON.stringify(pm) !== JSON.stringify(pmStored)) {
        await sSet("pj_plm", pm);
      }
      const ct=await sGet("pj_ctb")||{};
      const storedIrrf=await sGet("pj_irrf")||{};
      // IRRF manual só existe quando há um valor efetivamente informado.
      // Zeros antigos não podem sobrescrever o cálculo automático de 2026.
      const irrf=Object.fromEntries(
        Object.entries(storedIrrf).filter(([, value]) => Number(value) > 0)
      );
      if (JSON.stringify(irrf) !== JSON.stringify(storedIrrf)) {
        await sSet("pj_irrf", irrf);
      }
      // Os valores de referência são semeados apenas em um estado
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
       hydratedRef.current = true;
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
  const dividendGroups = calculateMonthlyDividends(txs, year, month);
  const dividendSummary = {
    total: dividendGroups.reduce((s,g)=>s+g.total,0),
    taxableTotal: dividendGroups.reduce((s,g)=>s+g.taxableTotal,0),
    irrf: dividendGroups.reduce((s,g)=>s+g.irrf,0),
    groups: dividendGroups,
  };

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
  // O cálculo automático de 2026 é a regra padrão. Um override manual só
  // deve existir quando houver um valor positivo salvo pelo usuário.
  const manualIRRF = Number(irrfMap?.[plKey]);
  const hasManualIRRF = Number.isFinite(manualIRRF) && manualIRRF > 0;
  const IRRFef = hasManualIRRF ? manualIRRF : IRRFauto;

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
    const sorted=sortTransactions(withCalculatedDividendHistory(d));
    setTxs(sorted); await sSet("pj_tx2",sorted);
    const freshM=await sGet("pj_plm")||{};
    const up=await cascadePL(sorted,freshM);
    setPlMap(up);
  };
  const saveFavs=async d=>{const sorted=sortFavorites(d);setFavs(sorted);await sSet("pj_favs2",sorted);};
  const saveCtb=async d=>{setCtbMap(d);await sSet("pj_ctb",d);};
  const saveIrrf=async d=>{setIrrfMap(d);await sSet("pj_irrf",d);};
  const commitIrrf=async()=>{
    const v=parseBRL(irrfIn);
    const next={...irrfMap};
    if(v>0){
      next[plKey]=v;
    } else {
      // Campo vazio/zero remove o override e devolve o cálculo automático.
      delete next[plKey];
    }
    await saveIrrf(next);
  };

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
    setForm({valor:fmtIn(String(Math.round(tx.valor*100))),data:tx.data,nome:tx.nome||"",cnpj:tx.cnpj||"",telefone:tx.telefone||"",cep:tx.cep||"",endereco:tx.endereco||"",email:tx.email||"",especialidade:tx.especialidade||"",dente:tx.dente||"",categoria:tx.categoria||"",descricao:tx.descricao||"",notaGerada:tx.notaGerada||false,numeroNota:tx.numeroNota||"",dataEmissao:tx.dataEmissao||"",taxaISS:tx.taxaISS||"",informadoContab:tx.informadoContab||false,saveAsFav:false,
      beneficiarioNome:tx.beneficiarioNome||tx.nome||"",beneficiarioCpf:tx.beneficiarioCpf||"",
      pjCnpj:tx.pjCnpj||tx.cnpj||"",origemLucro:tx.origemLucro||"apurados_2026",
      aprovacaoDistribuicao:tx.aprovacaoDistribuicao||"",pagamentoPrevistoOriginal:tx.pagamentoPrevistoOriginal||""});
    setShowForm(true);
  };
  const handleCat=cat=>{
    if(formTipo==="receita"&&cat==="Recebimento de Clientes") setForm(f=>({...f,categoria:cat,descricao:"Prestação de serviço odontológico (8630-5/04) nos dias: "}));
    else setForm(f=>({...f,categoria:cat,descricao:""}));
  };
  const handleSubmit=async()=>{
    // Wait for the initial asynchronous storage hydration. Without this
    // guard, a very fast first submission can race with the hydration effect
    // and have its newly saved favorite overwritten in React state.
    const hydrationDeadline = Date.now() + 15_000;
    while (!hydratedRef.current && Date.now() < hydrationDeadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!hydratedRef.current) {
      notify("Aguarde o carregamento dos dados terminar.","err");
      return;
    }
    if(!form.valor||!form.data){notify("Informe valor e data.","err");return;}
    if(formTipo==="receita"&&!form.nome){notify("Informe o nome da clínica.","err");return;}
    if(formTipo==="despesa"&&!form.categoria){notify("Selecione o tipo de despesa.","err");return;}
    if(formTipo==="distribuicao"){
      if(!form.beneficiarioNome?.trim()){notify("Informe o beneficiário.","err");return;}
      if(String(form.beneficiarioCpf||"").replace(/\D/g,"").length!==11){notify("Informe um CPF válido do beneficiário.","err");return;}
      if(String(form.pjCnpj||"").replace(/\D/g,"").length!==14){notify("Informe o CNPJ da PJ pagadora.","err");return;}
      if(form.origemLucro==="anteriores_2025" && (!form.aprovacaoDistribuicao || form.aprovacaoDistribuicao > "2025-12-31" || !form.pagamentoPrevistoOriginal || form.pagamentoPrevistoOriginal < "2026-01-01" || form.pagamentoPrevistoOriginal > "2028-12-31")){notify("Para usar o tratamento de lucro anterior, informe aprovação até 31/12/2025 e pagamento original entre 2026 e 2028.","err");return;}
    }
    const valor=parseBRL(form.valor); if(valor<=0){notify("Valor inválido.","err");return;}
    const normalizedData = normalizeDateOnly(form.data); if(!normalizedData){notify("Data inválida.","err");return;} const tx={id:editId||cryptoId(),tipo:formTipo,valor,data:normalizedData,nome:form.nome||form.categoria||(formTipo==="distribuicao"?"Distribuição de Lucros":""),cnpj:form.cnpj,telefone:form.telefone,cep:form.cep,endereco:form.endereco,email:form.email,especialidade:form.especialidade,dente:form.dente,categoria:form.categoria,descricao:form.descricao,notaGerada:form.notaGerada,numeroNota:form.notaGerada?form.numeroNota:"",dataEmissao:form.notaGerada?(normalizeDateOnly(form.dataEmissao)||""):"",taxaISS:form.notaGerada?form.taxaISS:"",informadoContab:form.notaGerada?form.informadoContab:false,
      beneficiarioNome:formTipo==="distribuicao"?(form.beneficiarioNome||""):"",
      beneficiarioCpf:formTipo==="distribuicao"?(form.beneficiarioCpf||""):"",
      pjCnpj:formTipo==="distribuicao"?(form.pjCnpj||""):"",
      origemLucro:formTipo==="distribuicao"?(form.origemLucro||"apurados_2026"):"",
      aprovacaoDistribuicao:formTipo==="distribuicao"?(normalizeDateOnly(form.aprovacaoDistribuicao)||""):"",
      pagamentoPrevistoOriginal:formTipo==="distribuicao"?(normalizeDateOnly(form.pagamentoPrevistoOriginal)||""):"",
      irrfDistribuicao:0, valorLiquidoDistribuicao:formTipo==="distribuicao"?valor:0};
    const nextTxs = editId ? txs.map(t=>t.id===editId?tx:t) : [tx,...txs];
    await saveTxs(nextTxs);
    if(form.saveAsFav && formTipo!=="distribuicao"){
      const key=formTipo==="receita"?form.nome:form.categoria;
      const fd={id:cryptoId(),tipo:formTipo,nome:key,cnpj:form.cnpj,telefone:form.telefone,cep:form.cep,endereco:form.endereco,email:form.email,especialidade:form.especialidade,categoria:form.categoria};

      // Re-read the persisted favorites before composing the next state.
      // This prevents a just-loaded React state snapshot from overwriting a
      // favorite when the form is submitted immediately after app hydration.
      const currentFavs = await sGet("pj_favs2") || [];
      const ex=currentFavs.find(f=>f.tipo===formTipo&&f.nome===key);
      const nextFavs=ex
        ? currentFavs.map(f=>f.tipo===formTipo&&f.nome===key?{...fd,id:f.id}:f)
        : [...currentFavs,fd];

      await saveFavs(nextFavs);
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
    let binary="";
    const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk){
      binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
    }
    return btoa(binary);
  };

  const base64ToBytes = value => {
    if(typeof value!=="string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length%4!==0){
      throw new Error("Backup criptografado inválido.");
    }
    const binary=atob(value);
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    return bytes;
  };

  const sha256Hex = async bytes => {
    if(!window.crypto?.subtle) throw new Error("Seu navegador não oferece suporte à validação de integridade do backup.");
    const digest=await window.crypto.subtle.digest("SHA-256",bytes);
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
  };

  const deriveBackupKey = async (password, salt) => {
    if(!window.crypto?.subtle) {
      throw new Error("Seu navegador não oferece suporte à criptografia segura necessária para o backup.");
    }
    const material=await window.crypto.subtle.importKey(
      "raw", textEncoder.encode(password), "PBKDF2", false, ["deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
      {name:"PBKDF2",salt,iterations:250000,hash:"SHA-256"},
      material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]
    );
  };

  const encryptBackup = async (backup,password) => {
    const salt=window.crypto.getRandomValues(new Uint8Array(16));
    const iv=window.crypto.getRandomValues(new Uint8Array(12));
    const key=await deriveBackupKey(password,salt);
    const plaintext=textEncoder.encode(JSON.stringify(backup));
    if(plaintext.byteLength>MAX_BACKUP_BYTES) {
      throw new Error("O backup excede o limite de 5 MB.");
    }
    const checksum=await sha256Hex(plaintext);
    const ciphertext=new Uint8Array(await window.crypto.subtle.encrypt({name:"AES-GCM",iv},key,plaintext));

    return {
      format:"contabilidade-pj-encrypted-backup",
      version:2,
      algorithm:"AES-256-GCM",
      kdf:"PBKDF2-SHA-256",
      iterations:250000,
      salt:bytesToBase64(salt),
      iv:bytesToBase64(iv),
      data:bytesToBase64(ciphertext),
      integrity:{algorithm:"SHA-256",value:checksum},
      backupVersion:backup.version,
      encryptedAt:new Date().toISOString(),
    };
  };

  const decryptBackup = async (envelope,password) => {
    if(!envelope || typeof envelope!=="object" || Array.isArray(envelope) ||
       envelope.format!=="contabilidade-pj-encrypted-backup" ||
       ![1,2].includes(envelope.version) ||
       envelope.algorithm!=="AES-256-GCM" ||
       envelope.kdf!=="PBKDF2-SHA-256" || envelope.iterations!==250000){
      throw new Error("Este arquivo não é um backup criptografado compatível.");
    }

    if(envelope.version===2){
      if(!envelope.integrity || envelope.integrity.algorithm!=="SHA-256" ||
         typeof envelope.integrity.value!=="string" || !/^[a-f0-9]{64}$/.test(envelope.integrity.value)){
        throw new Error("Backup inválido: integridade ausente ou inválida.");
      }
      if(!Number.isInteger(envelope.backupVersion) || envelope.backupVersion<1 || envelope.backupVersion>BACKUP_VERSION){
        throw new Error("Versão do backup inválida.");
      }
    }

    try{
      const salt=base64ToBytes(envelope.salt);
      const iv=base64ToBytes(envelope.iv);
      if(salt.byteLength!==16 || iv.byteLength!==12) throw new Error("Parâmetros de segurança inválidos.");
      const ciphertext=base64ToBytes(envelope.data);
      if(ciphertext.byteLength<16 || ciphertext.byteLength>MAX_BACKUP_BYTES*2){
        throw new Error("Backup criptografado inválido ou acima do limite permitido.");
      }
      const key=await deriveBackupKey(password,salt);
      const plainBuffer=await window.crypto.subtle.decrypt({name:"AES-GCM",iv},key,ciphertext);
      if(plainBuffer.byteLength>MAX_BACKUP_BYTES) throw new Error("O backup excede o limite de 5 MB.");
      const plainBytes=new Uint8Array(plainBuffer);
      if(envelope.version===2){
        const checksum=await sha256Hex(plainBytes);
        if(checksum!==envelope.integrity.value) throw new Error("Backup corrompido: falha de integridade.");
      }
      return JSON.parse(textDecoder.decode(plainBytes));
    }catch(e){
      if(e?.message?.includes("integridade") || e?.message?.includes("limite") || e?.message?.includes("inválido") || e?.message?.includes("Parâmetros")) throw e;
      throw new Error("Senha incorreta ou backup criptografado inválido.");
    }
  };

  const askBackupPassword = (message,confirmation=false) => {
    const first=window.prompt(message);
    if(first===null) return null;
    if(first.length<8) throw new Error("A senha do backup precisa ter pelo menos 8 caracteres.");
    if(confirmation){
      const second=window.prompt("Confirme a senha do backup:");
      if(second===null) return null;
      if(second!==first) throw new Error("As senhas não coincidem.");
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
        "Crie uma senha para proteger seu backup.\n\nMínimo: 8 caracteres.\n\nEssa senha será necessária para importar o backup.",true
      );
      if(password===null) return;

      const backup=buildBackup();
      const plaintextSize=textEncoder.encode(JSON.stringify(backup)).byteLength;
      if(plaintextSize>MAX_BACKUP_BYTES) throw new Error("O backup excede o limite de 5 MB.");
      const encrypted=await encryptBackup(backup,password);
      const json=JSON.stringify(encrypted,null,2);
      const byteSize=textEncoder.encode(json).byteLength;
      if(byteSize>MAX_BACKUP_BYTES) throw new Error("O arquivo de backup criptografado excede o limite de 5 MB.");
      const stamp=new Date().toISOString().slice(0,10);
      const filename=`contabilidade-pj-backup-${stamp}.json`;
      const blob=new Blob([json],{type:"application/json;charset=utf-8"});
      const file=new File([blob],filename,{type:"application/json"});

      if(typeof navigator!=="undefined" && navigator.share && typeof navigator.canShare==="function" && navigator.canShare({files:[file]})){
        try{
          await navigator.share({title:"Backup Contabilidade PJ",text:"Backup criptografado dos dados do aplicativo Contabilidade PJ.",files:[file]});
          notify("✅ Backup criptografado gerado.","ok");
          return;
        }catch(shareError){ if(shareError?.name==="AbortError") return; }
      }

      const url=URL.createObjectURL(blob);
      const a=document.createElement("a"); a.href=url; a.download=filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      notify(`✅ Backup criptografado ${filename} gerado.` ,"ok");
    }catch(e){
      if(e?.name==="AbortError") return;
      notify(e?.message||"Não foi possível gerar o backup criptografado.","err");
    }
  };

  const restoreBackup=async(text)=>{
    try{
      if(typeof text!=="string") throw new Error("Arquivo de backup inválido.");
      const byteLength=textEncoder.encode(text).byteLength;
      if(byteLength>MAX_BACKUP_BYTES) throw new Error("O arquivo de backup excede o limite de 5 MB.");
      if(!text.trim()) throw new Error("O arquivo está vazio.");

      let parsed;
      try{ parsed=JSON.parse(text); }
      catch{ throw new Error("O arquivo selecionado não é um JSON válido."); }

      let backupData;
      if(parsed?.format==="contabilidade-pj-encrypted-backup"){
        const password=askBackupPassword("Digite a senha usada para proteger este backup:");
        if(password===null) return;
        backupData=await decryptBackup(parsed,password);
      }else{
        const useLegacy=window.confirm("Este é um backup antigo sem criptografia.\n\nDeseja importá-lo mesmo assim?");
        if(!useLegacy) return;
        backupData=parsed;
      }

      // Strict validation happens before any write, including type checks,
      // version/schema checks, unknown-field checks and collection limits.
      const d=normalizeBackup(backupData);
      const {txs:txData,favs:favData,plMap:plData,plManual:manualData,ctbMap:ctbData,irrfMap:irrfData}=d;
      const up=await cascadePL(txData,manualData);

      // One storage transaction replaces the complete application state.
      // No individual backup field is persisted before this point.
      await replaceState({
        pj_tx2:txData,
        pj_favs2:favData,
        pj_pl:up,
        pj_plm:manualData,
        pj_ctb:ctbData,
        pj_irrf:irrfData,
      });

      setFavs(favData);
      setCtbMap(ctbData);
      setIrrfMap(irrfData);
      setPlManual(manualData);
      setTxs(txData);
      setPlMap(up);

      setShowSettings(false);
      notify("✅ Backup importado e validado com sucesso!","ok");
    }catch(e){
      notify(e?.message||"Arquivo de backup inválido, senha incorreta ou incompatível.","err");
    }
  };

  const handleImportFile=async(event)=>{
    const file=event.target.files?.[0];
    event.target.value="";
    if(!file) return;

    try{
      if(file.size>MAX_BACKUP_BYTES) throw new Error("O arquivo de backup excede o limite de 5 MB.");
      if(!/\.json$/i.test(file.name)) throw new Error("Selecione um arquivo de backup .json.");
      const text=await file.text();
      if(new TextEncoder().encode(text).byteLength>MAX_BACKUP_BYTES) throw new Error("O arquivo de backup excede o limite de 5 MB.");
      await restoreBackup(text);
    }catch(e){
      notify(e?.message||"Não foi possível ler o arquivo de backup.","err");
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
          <Image
            src={LOGO}
            alt="Marcus Vinícius"
            width={1774}
            height={473}
            priority
            style={{height:72,width:"auto",maxWidth:"85%",objectFit:"contain",filter:"drop-shadow(0 2px 8px rgba(0,0,0,0.4))"}}
          />
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
            setNotaModal={setNotaModal} dividendSummary={dividendSummary}
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
            dividendSummary={dividendSummary}
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
            DAS={DAS} INSS={INSS} IRRF={IRRFef} CTB={CTB} PLef={PLef}
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
            <Field label="Beneficiário *">
              <input value={form.beneficiarioNome} onChange={e=>setForm(f=>({...f,beneficiarioNome:e.target.value}))} placeholder="Nome do sócio / beneficiário" style={iSt}/>
            </Field>
            <Field label="CPF do Beneficiário *">
              <input value={form.beneficiarioCpf} onChange={e=>setForm(f=>({...f,beneficiarioCpf:fmtDoc(e.target.value)}))} placeholder="000.000.000-00" inputMode="numeric" style={iSt}/>
            </Field>
            <Field label="CNPJ da PJ Pagadora *">
              <input value={form.pjCnpj} onChange={e=>setForm(f=>({...f,pjCnpj:fmtDoc(e.target.value)}))} placeholder="00.000.000/0000-00" inputMode="numeric" style={iSt}/>
            </Field>
            <Field label="Origem do Lucro *">
              <div style={{display:"flex",gap:8}}>
                <TogBtn active={form.origemLucro==="apurados_2026"} color={C.navyMid} bg={C.navyLight} onClick={()=>setForm(f=>({...f,origemLucro:"apurados_2026"}))}>Apurados em 2026</TogBtn>
                <TogBtn active={form.origemLucro==="anteriores_2025"} color={C.gold} bg="#F8F1E5" onClick={()=>setForm(f=>({...f,origemLucro:"anteriores_2025"}))}>Anteriores</TogBtn>
              </div>
            </Field>
            {form.origemLucro==="anteriores_2025" && <>
              <Field label="Data da aprovação *">
                <input type="date" value={form.aprovacaoDistribuicao||""} onChange={e=>setForm(f=>({...f,aprovacaoDistribuicao:e.target.value}))} style={iSt}/>
              </Field>
              <Field label="Pagamento previsto originalmente">
                <input type="date" value={form.pagamentoPrevistoOriginal||""} onChange={e=>setForm(f=>({...f,pagamentoPrevistoOriginal:e.target.value}))} style={iSt}/>
              </Field>
              <div style={{background:"#F8F1E5",borderRadius:12,padding:"11px 13px",marginBottom:13,fontSize:11,color:"#795E2D",lineHeight:1.45}}>
                Lucros apurados até 31/12/2025 só ficam fora do IRRF de 2026 quando a distribuição foi aprovada até 31/12/2025 e o pagamento observa as condições do ato de aprovação.
              </div>
            </>}
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
                <div><p style={{margin:0,fontSize:13,fontWeight:"600",color:C.text}}>IRRF PF</p><p style={{margin:"2px 0 0",fontSize:11,color:C.muted}}>Tabela progressiva 2026 · base: pró-labore − INSS</p></div>
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
                    await deleteAccount();
                    window.location.replace("/");

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


export default App;
