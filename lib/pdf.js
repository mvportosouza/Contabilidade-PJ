/**
 * Gerador de PDF sem dependências externas.
 * Produz um PDF simples, compatível com Safari/iOS e PWA, evitando depender
 * de window.print(), que não é confiável em alguns contextos móveis.
 */

const MONTHS = [
  "Janeiro","Fevereiro","Marco","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

const money = (v) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL"
}).format(Number(v) || 0);

const percent = (v) => `${(Number(v) || 0).toFixed(1)}%`;

function ascii(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/×/g, "x")
    .replace(/·/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, "");
}

function pdfEscape(value) {
  return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(text, max = 88) {
  const words = ascii(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!word) continue;
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

function makePdf(pageLines) {
  const pages = pageLines.length ? pageLines : [["Relatorio vazio"]];
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };

  const catalog = add("");
  const pagesObj = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageRefs = [];

  for (const lines of pages) {
    const commands = [
      "BT",
      "/F1 10 Tf",
      "50 790 Td",
      "14 TL",
    ];
    lines.forEach((line, index) => {
      if (index > 0) commands.push("T*");
      commands.push(`(${pdfEscape(line)}) Tj`);
    });
    commands.push("ET");
    const stream = commands.join("\n");
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const page = add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`);
    pageRefs.push(page);
  }

  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageRefs.map(n => `${n} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function linesToPages(lines, perPage = 52) {
  const expanded = [];
  lines.forEach((line) => {
    const wrapped = wrap(line, 88);
    if (wrapped.length) expanded.push(...wrapped);
    else expanded.push("");
  });
  const pages = [];
  for (let i = 0; i < expanded.length; i += perPage) pages.push(expanded.slice(i, i + perPage));
  return pages;
}

export function generateMonthlyReportPdf({
  year,
  month,
  monthLabel = MONTHS[month] || "",
  stats,
  taxes = {},
  transactions = [],
}) {
  const lines = [
    "CONTABILIDADE PJ",
    `RELATORIO MENSAL - ${monthLabel.toUpperCase()} ${year}`,
    "",
    "RESUMO FINANCEIRO",
    `Receita total: ${money(stats?.receitaTotal)}`,
    `Despesas totais: ${money(stats?.despesaTotal)}`,
    `Lucro liquido: ${money(stats?.resultado)}`,
    `Distribuicao de lucros: ${money(stats?.distribuicaoTotal)}`,
    `Margem liquida: ${percent((stats?.resultado / (stats?.receitaTotal || 1)) * 100)}`,
    "",
    "IMPOSTOS E OBRIGACOES",
    `DAS: ${money(taxes.das)}`,
    `INSS: ${money(taxes.inss)}`,
    `IRRF: ${money(taxes.irrf)}`,
    `Contabilidade: ${money(taxes.contabilidade)}`,
    `Total: ${money((taxes.das || 0) + (taxes.inss || 0) + (taxes.irrf || 0) + (taxes.contabilidade || 0))}`,
    "",
    "LANCAMENTOS DO MES",
  ];

  const sorted = [...(transactions || [])].sort((a,b) => String(a.data).localeCompare(String(b.data)));
  if (!sorted.length) lines.push("Nenhum lancamento registrado neste mes.");
  sorted.forEach((tx) => {
    const tipo = tx.tipo === "receita" ? "RECEITA" : tx.tipo === "distribuicao" ? "DISTRIBUICAO" : "DESPESA";
    lines.push(`${tx.data || "-"} | ${tipo} | ${money(tx.valor)} | ${tx.nome || tx.categoria || "-"}`);
  });

  lines.push("", "Relatorio gerado pelo aplicativo Contabilidade-PJ.");
  return makePdf(linesToPages(lines));
}

export function generateAnnualReportPdf({ year, rows = [] }) {
  const active = rows.filter((r) => r?.ativo);
  const receita = active.reduce((s,r) => s + Number(r.receita || 0), 0);
  const despesa = active.reduce((s,r) => s + Number(r.despesa || 0), 0);
  const lucro = active.reduce((s,r) => s + Number(r.lucro || 0), 0);
  const impostos = active.reduce((s,r) => s + Number(r.impostos || 0), 0);
  const distribuicao = active.reduce((s,r) => s + Number(r.distribuicao || 0), 0);
  const media = active.filter(r => Number(r.receita || 0) > 0);
  const mediaReceita = media.length ? receita / media.length : 0;
  const melhor = active.length ? active.reduce((a,b) => b.lucro > a.lucro ? b : a) : null;
  const pior = active.length ? active.reduce((a,b) => b.lucro < a.lucro ? b : a) : null;

  const lines = [
    "CONTABILIDADE PJ",
    `RELATORIO ANUAL - ${year}`,
    "",
    "RESUMO DO ANO",
    `Receita total: ${money(receita)}`,
    `Despesas totais: ${money(despesa)}`,
    `Lucro liquido: ${money(lucro)}`,
    `Impostos pagos: ${money(impostos)}`,
    `Distribuicao de lucros: ${money(distribuicao)}`,
    `Margem liquida: ${percent((lucro / (receita || 1)) * 100)}`,
    `Receita media mensal (meses com receita): ${money(mediaReceita)}`,
    `Melhor mes: ${melhor ? `${melhor.mes} - ${money(melhor.lucro)}` : "-"}`,
    `Pior mes: ${pior ? `${pior.mes} - ${money(pior.lucro)}` : "-"}`,
    "",
    "DADOS MENSAIS",
    "Mes | Receita | Despesa | Lucro | Impostos | Pro-labore | INSS | IRRF | Distribuicao | Margem",
  ];

  rows.forEach((r) => {
    lines.push(
      `${r.mes || "-"} | ${money(r.receita)} | ${money(r.despesa)} | ${money(r.lucro)} | ${money(r.impostos)} | ${money(r.pl)} | ${money(r.inss)} | ${money(r.irrf)} | ${money(r.distribuicao)} | ${percent(r.margem)}`
    );
  });

  lines.push(
    "",
    "DETALHAMENTO DOS IMPOSTOS",
    "Mes | DAS | INSS | IRRF | Total",
  );
  rows.forEach((r) => {
    lines.push(`${r.mes || "-"} | ${money(r.das)} | ${money(r.inss)} | ${money(r.irrf)} | ${money(r.impostos)}`);
  });

  lines.push(
    "",
    "Observacao: os meses sem dados permanecem no modelo anual, mas nao sao exibidos nos graficos.",
    "A linha de tendencia dos graficos utiliza media movel de 3 meses com dados lancados.",
    "Relatorio gerado pelo aplicativo Contabilidade-PJ."
  );

  return makePdf(linesToPages(lines));
}

export async function openPdfBlob(blob) {
  if (!(blob instanceof Blob)) throw new Error("PDF invalido.");
  const filename = "contabilidade-pj-relatorio.pdf";

  if (typeof navigator !== "undefined" && navigator.share && typeof File !== "undefined") {
    try {
      const file = new File([blob], filename, { type: "application/pdf" });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Relatorio Contabilidade-PJ" });
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  if (typeof document !== "undefined") {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
