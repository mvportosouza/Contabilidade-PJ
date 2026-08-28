import { MS } from "../AppUI";
import { TxCard } from "../Transactions/TransactionCard";

export function LancTab({monthTxs,receitas,despesas,resultado,month,year,MONTHS,C,fmtBRL,openNew,openEdit,delTx}){
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
