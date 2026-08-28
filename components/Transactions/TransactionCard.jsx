import { useState } from "react";
import { C, fmtBRL, MONTHS } from "../appShared";

export function TxCard({tx,onEdit,onDelete,C,fmtBRL,MONTHS}){
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
