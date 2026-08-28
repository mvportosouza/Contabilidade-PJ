import { useState } from "react";
import { openPdfBlob } from "../../lib/pdf";
export function ReportButton({label="Gerar Relatório (PDF)", onGenerate}) {
  const [busy,setBusy]=useState(false);
  const handleGenerate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (typeof onGenerate !== "function") throw new Error("Relatório indisponível.");
      const blob = await onGenerate();
      if (!(blob instanceof Blob) || blob.type !== "application/pdf" || blob.size < 100) {
        throw new Error("O relatório PDF não foi gerado corretamente.");
      }
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
