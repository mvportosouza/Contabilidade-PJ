/**
 * Relatórios PDF do Contabilidade-PJ.
 *
 * O gerador é independente de window.print() e não adiciona dependências ao
 * projeto. Os gráficos são desenhados no próprio PDF, usando os mesmos dados
 * exibidos nos gráficos do aplicativo.
 */

const MONTHS = [
  "Janeiro","Fevereiro","Marco","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];
const SHORT_MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const money = (v) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL"
}).format(Number(v) || 0);
const percent = (v) => `${(Number(v) || 0).toFixed(1)}%`;

const COLORS = {
  navy: [0.102, 0.188, 0.333],
  navyMid: [0.102, 0.188, 0.333],
  gold: [0.784, 0.663, 0.431],
  red: [0.753, 0.224, 0.169],
  green: [0.180, 0.490, 0.196],
  purple: [0.557, 0.267, 0.678],
  muted: [0.545, 0.498, 0.447],
  grid: [0.91, 0.89, 0.85],
  text: [0.10, 0.10, 0.10],
  white: [1, 1, 1],
};

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

function fmtShort(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000000) return `R$${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `R$${(n / 1000).toFixed(1)}k`;
  return `R$${n.toFixed(0)}`;
}

function rgb([r, g, b]) { return `${r} ${g} ${b}`; }
function setFill(color) { return `${rgb(color)} rg`; }
function setStroke(color) { return `${rgb(color)} RG`; }
function rect(x, y, w, h, fill = null, stroke = null, width = 1) {
  const out = [];
  if (fill) out.push(setFill(fill));
  if (stroke) out.push(setStroke(stroke), `${width} w`);
  out.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
  out.push(fill && stroke ? "B" : fill ? "f" : "S");
  return out.join("\n");
}
function line(x1, y1, x2, y2, color = COLORS.grid, width = 1) {
  return `${setStroke(color)}\n${width} w\n${x1.toFixed(2)} ${y1.toFixed(2)} m\n${x2.toFixed(2)} ${y2.toFixed(2)} l\nS`;
}
function text(x, y, value, size = 9, color = COLORS.text, bold = false) {
  return `${setFill(color)}\nBT\n/${bold ? "F2" : "F1"} ${size} Tf\n${x.toFixed(2)} ${y.toFixed(2)} Td\n(${pdfEscape(value)}) Tj\nET`;
}

function circleArcSegment(cx, cy, r, start, end) {
  const delta = end - start;
  const c = 4 / 3 * Math.tan(delta / 4);
  const x0 = cx + r * Math.cos(start);
  const y0 = cy + r * Math.sin(start);
  const x3 = cx + r * Math.cos(end);
  const y3 = cy + r * Math.sin(end);
  const x1 = x0 - c * r * Math.sin(start);
  const y1 = y0 + c * r * Math.cos(start);
  const x2 = x3 + c * r * Math.sin(end);
  const y2 = y3 - c * r * Math.cos(end);
  return { x0, y0, x1, y1, x2, y2, x3, y3 };
}

function pieSlice(cx, cy, r, start, end, color) {
  const total = end - start;
  const segments = Math.max(1, Math.ceil(Math.abs(total) / (Math.PI / 2)));
  const step = total / segments;
  const first = circleArcSegment(cx, cy, r, start, start + step);
  const commands = [
    setFill(color),
    `${cx.toFixed(2)} ${cy.toFixed(2)} m`,
    `${first.x0.toFixed(2)} ${first.y0.toFixed(2)} l`,
  ];
  for (let i = 0; i < segments; i += 1) {
    const a0 = start + step * i;
    const a1 = start + step * (i + 1);
    const p = circleArcSegment(cx, cy, r, a0, a1);
    commands.push(`${p.x1.toFixed(2)} ${p.y1.toFixed(2)} ${p.x2.toFixed(2)} ${p.y2.toFixed(2)} ${p.x3.toFixed(2)} ${p.y3.toFixed(2)} c`);
  }
  commands.push(`${cx.toFixed(2)} ${cy.toFixed(2)} l`, "f");
  return commands.join("\n");
}

function movingAverage(rows, key) {
  const values = [];
  return rows.map((row) => {
    values.push(Number(row?.[key]) || 0);
    const last = values.slice(-3);
    return { ...row, mediaMovel: last.reduce((s, v) => s + v, 0) / last.length };
  });
}

function barChart(commands, x, y, w, h, rows, key, title, color, formatter = fmtShort, options = {}) {
  const filtered = Array.isArray(rows) ? rows.filter(r => r?.ativo !== false) : [];
  commands.push(text(x, y + h - 14, title, 10, COLORS.text, true));
  if (!filtered.length) {
    commands.push(text(x + 8, y + h / 2, "Sem dados", 9, COLORS.muted));
    return;
  }
  const chartX = x + 34;
  const chartY = y + 24;
  const chartW = w - 42;
  const chartH = h - 50;
  const vals = filtered.map(r => Number(r?.[key]) || 0);
  const ma = movingAverage(filtered, key);
  const avg = ma.map(r => Number(r.mediaMovel) || 0);
  const minValue = Math.min(0, ...vals, ...avg);
  const maxValue = Math.max(0, ...vals, ...avg);
  const range = Math.max(1, maxValue - minValue);
  const scale = (chartH * 0.82) / range;
  const zeroY = chartY + (-minValue) * scale;
  const slot = chartW / filtered.length;
  const barW = Math.max(4, Math.min(22, slot * 0.52));
  for (let i = 0; i < 4; i += 1) {
    const gy = chartY + (chartH * i) / 3;
    commands.push(line(chartX, gy, chartX + chartW, gy, COLORS.grid, 0.5));
  }
  filtered.forEach((row, i) => {
    const v = Number(row?.[key]) || 0;
    const bh = Math.abs(v) * scale;
    const bx = chartX + slot * i + (slot - barW) / 2;
    const by = v >= 0 ? zeroY : zeroY - bh;
    commands.push(rect(bx, by, barW, Math.max(0.8, bh), color));
    if (filtered.length <= 8 || i % Math.ceil(filtered.length / 8) === 0) {
      commands.push(text(bx - 2, chartY - 11, row.mesLabel || SHORT_MONTHS[row.mesIndex ?? i] || "", 7, COLORS.muted));
    }
  });
  if (options.showMovingAverage !== false) {
    ma.forEach((row, i) => {
      if (i === 0) return;
      const prev = ma[i - 1];
      const x1 = chartX + slot * (i - 1) + slot / 2;
      const x2 = chartX + slot * i + slot / 2;
      const y1 = zeroY + Number(prev.mediaMovel || 0) * scale;
      const y2 = zeroY + Number(row.mediaMovel || 0) * scale;
      commands.push(line(x1, y1, x2, y2, COLORS.muted, 1.4));
    });
    commands.push(text(chartX + chartW - 80, y + 8, "Media movel (3)", 7, COLORS.muted));
  }
  commands.push(text(x + 2, chartY + chartH - 2, formatter(maxValue), 7, COLORS.muted));
}

function pieChart(commands, x, y, w, h, data, title) {
  commands.push(text(x, y + h - 14, title, 10, COLORS.text, true));
  const total = data.reduce((s, d) => s + Math.max(0, Number(d.value) || 0), 0);
  if (!total) {
    commands.push(text(x + 8, y + h / 2, "Sem dados", 9, COLORS.muted));
    return;
  }
  const cx = x + w * 0.32;
  const cy = y + h * 0.47;
  const r = Math.min(w, h) * 0.27;
  let angle = Math.PI / 2;
  data.forEach((d) => {
    const value = Math.max(0, Number(d.value) || 0);
    if (!value) return;
    const next = angle - (value / total) * Math.PI * 2;
    commands.push(pieSlice(cx, cy, r, next, angle, d.color));
    angle = next;
  });
  let ly = y + h - 36;
  data.forEach((d) => {
    const value = Math.max(0, Number(d.value) || 0);
    if (!value) return;
    commands.push(rect(x + w * 0.57, ly - 2, 7, 7, d.color));
    commands.push(text(x + w * 0.57 + 12, ly, `${d.name}: ${percent((value / total) * 100)}  ${money(value)}`, 8, COLORS.text));
    ly -= 14;
  });
}

function horizontalBars(commands, x, y, w, h, items, title) {
  commands.push(text(x, y + h - 14, title, 10, COLORS.text, true));
  const valid = (items || []).filter(item => Number(item.value || 0) > 0);
  if (!valid.length) {
    commands.push(text(x + 8, y + h / 2, "Sem dados", 9, COLORS.muted));
    return;
  }
  const max = Math.max(1, ...valid.map(item => Number(item.value || 0)));
  const labelW = 145;
  const barW = w - labelW - 55;
  const rowH = Math.min(30, (h - 30) / valid.length);
  valid.forEach((item, i) => {
    const yy = y + h - 34 - i * rowH;
    const value = Number(item.value || 0);
    const width = barW * value / max;
    commands.push(text(x, yy + 4, item.label, 7.5, COLORS.text));
    commands.push(rect(x + labelW, yy, Math.max(1, width), 11, item.color || COLORS.navyMid));
    commands.push(text(x + labelW + barW + 5, yy + 3, money(value), 7.5, item.color || COLORS.text, true));
  });
}

function comboChart(commands, x, y, w, h, rows) {
  const active = rows.filter(r => r?.ativo !== false);
  commands.push(text(x, y + h - 14, "Receita x Despesa x Lucro", 10, COLORS.text, true));
  if (!active.length) {
    commands.push(text(x + 8, y + h / 2, "Sem dados", 9, COLORS.muted));
    return;
  }
  const chartX = x + 34, chartY = y + 24, chartW = w - 42, chartH = h - 50;
  const series = ["receita", "despesa", "lucro"];
  const colors = [COLORS.navyMid, COLORS.red, COLORS.green];
  const max = Math.max(1, ...active.flatMap(r => series.map(k => Math.abs(Number(r[k]) || 0))));
  const scale = chartH * 0.82 / max;
  const slot = chartW / active.length;
  const bw = Math.max(2, Math.min(9, slot / 4));
  active.forEach((r, i) => {
    series.forEach((key, j) => {
      const v = Number(r[key]) || 0;
      const bh = Math.abs(v) * scale;
      const bx = chartX + slot * i + slot / 2 + (j - 1) * (bw + 1) - bw / 2;
      commands.push(rect(bx, chartY, bw, Math.max(0.8, bh), colors[j]));
    });
    if (active.length <= 8 || i % Math.ceil(active.length / 8) === 0) {
      commands.push(text(chartX + slot * i + slot / 2 - 7, chartY - 11, r.mesLabel || SHORT_MONTHS[r.mesIndex ?? i] || "", 7, COLORS.muted));
    }
  });
  ["receita", "despesa", "lucro"].forEach((key, j) => {
    const ma = movingAverage(active, key);
    for (let i = 1; i < ma.length; i += 1) {
      const x1 = chartX + slot * (i - 1) + slot / 2;
      const x2 = chartX + slot * i + slot / 2;
      const y1 = chartY + Number(ma[i - 1].mediaMovel || 0) * scale;
      const y2 = chartY + Number(ma[i].mediaMovel || 0) * scale;
      commands.push(line(x1, y1, x2, y2, colors[j], 1.0));
    }
  });
  commands.push(text(x + 38, y + 8, "Barras: Receita / Despesa / Lucro  |  Linhas: média móvel de 3 meses", 7, COLORS.muted));
}

function makePdf(pageBuilders) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add("");
  const pagesObj = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFont = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageRefs = [];

  for (const build of pageBuilders) {
    const commands = build();
    const stream = commands.join("\n");
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const page = add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R /F2 ${boldFont} 0 R >> >> /Contents ${content} 0 R >>`);
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
  for (let i = 1; i <= objects.length; i += 1) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function reportHeader(commands, title, subtitle) {
  commands.push(rect(0, 790, 595, 52, COLORS.navy));
  commands.push(text(42, 816, "CONTABILIDADE PJ", 15, COLORS.white, true));
  commands.push(text(42, 801, title, 10, COLORS.white));
  commands.push(text(420, 801, subtitle, 8, COLORS.white));
}

function textRows(commands, rows, startY = 760) {
  let y = startY;
  rows.forEach((row) => {
    wrap(row, 105).forEach((wrapped) => {
      if (y < 34) return;
      commands.push(text(42, y, wrapped, 8.5));
      y -= 12;
    });
    y -= 2;
  });
}

function pageForMonthly(title, subtitle, chartBuilder, lines = []) {
  return () => {
    const c = [];
    reportHeader(c, title, subtitle);
    if (chartBuilder) chartBuilder(c);
    if (lines.length) textRows(c, lines, 250);
    return c;
  };
}

export function generateMonthlyReportPdf({
  year,
  month,
  monthLabel = MONTHS[month] || "",
  stats,
  taxes = {},
  transactions = [],
}) {
  const recMes = (transactions || []).filter(t => t?.tipo === "receita");
  const despesasMes = (transactions || []).filter(t => t?.tipo === "despesa");
  const endo = recMes.filter(t => t.especialidade === "Endodontia").reduce((s,t)=>s + Number(t.valor || 0),0);
  const orto = recMes.filter(t => t.especialidade === "Ortodontia").reduce((s,t)=>s + Number(t.valor || 0),0);
  const outros = recMes.filter(t => !t.especialidade).reduce((s,t)=>s + Number(t.valor || 0),0);

  // Mantém exatamente os dados do mês selecionado e apresenta as obrigações
  // antes dos gráficos, como no primeiro resumo do relatório anual.
  const das = Number(taxes.das) || 0;
  const inss = Number(taxes.inss) || 0;
  const irrf = Number(taxes.irrf) || 0;
  const contabilidade = Number(taxes.contabilidade) || 0;
  const proLabore = Number(taxes.proLabore) || 0;
  const totalObrigacoes = das + inss + irrf + contabilidade;
  const receitaTotal = Number(stats?.receitaTotal) || 0;
  const despesaTotal = Number(stats?.despesaTotal) || 0;
  const resultado = Number(stats?.resultado) || 0;
  const distribuicao = Number(stats?.distribuicaoTotal) || 0;
  const margem = receitaTotal ? (resultado / receitaTotal) * 100 : 0;
  const ticketMedio = Number(stats?.ticketMedio) || 0;

  const sorted = [...transactions].sort((a,b) => {
    const da = String(a?.data || "");
    const db = String(b?.data || "");
    if (da !== db) return db.localeCompare(da);
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });

  const transactionLines = sorted.map((tx) => {
    const tipo = tx.tipo === "receita"
      ? "RECEITA"
      : tx.tipo === "distribuicao"
        ? "DISTRIBUICAO"
        : "DESPESA";
    return `${tx.data || "-"} | ${tipo} | ${money(tx.valor)} | ${tx.nome || tx.categoria || "-"}`;
  });

  const clinicItems = (() => {
    const byClinic = {};
    recMes.forEach(t => {
      const key = `${t.especialidade || "Outros"} - ${t.nome || "Sem identificacao"}`;
      byClinic[key] = (byClinic[key] || 0) + Number(t.valor || 0);
    });
    return Object.entries(byClinic)
      .sort((a,b)=>b[1]-a[1])
      .map(([label,value])=>({
        label,
        value,
        color: label.startsWith("Ortodontia")
          ? COLORS.gold
          : label.startsWith("Endodontia")
            ? COLORS.navyMid
            : COLORS.muted,
      }));
  })();

  const pages = [];

  // Página 1: mesmo padrão de resumo completo usado no relatório anual.
  pages.push(() => {
    const c = [];
    reportHeader(c, `RELATORIO MENSAL - ${ascii(monthLabel).toUpperCase()} ${year}`, "Resumo");
    textRows(c, [
      "RESUMO DO MES",
      `Receita total: ${money(receitaTotal)}`,
      `Despesas totais: ${money(despesaTotal)}`,
      `Lucro liquido: ${money(resultado)}`,
      `Impostos pagos: ${money(das + inss + irrf)}`,
      `Pro-labore: ${money(proLabore)}`,
      `INSS: ${money(inss)}`,
      `IRRF PF: ${money(irrf)}`,
      `Distribuicao de lucros: ${money(distribuicao)}`,
      `Margem liquida: ${percent(margem)}`,
      `Ticket medio: ${money(ticketMedio)}`,
      `Quantidade de receitas: ${Number(stats?.quantidadeReceitas) || 0}`,
      `Quantidade de despesas: ${Number(stats?.quantidadeDespesas) || 0}`,
      `Quantidade de distribuicoes: ${Number(stats?.quantidadeDistribuicoes) || 0}`,
      "",
      "IMPOSTOS E OBRIGACOES DO MES",
      `DAS: ${money(das)}`,
      `INSS: ${money(inss)}`,
      `IRRF PF: ${money(irrf)}`,
      `Contabilidade: ${money(contabilidade)}`,
      `Total das obrigacoes: ${money(totalObrigacoes)}`,
      "",
      "Os valores acima correspondem ao mes selecionado e sao os mesmos dados usados no aplicativo.",
    ], 760);
    return c;
  });

  // Página 2: todos os gráficos existentes na aba Estatística mensal.
  pages.push(() => {
    const c = [];
    reportHeader(c, `RELATORIO MENSAL - ${ascii(monthLabel).toUpperCase()} ${year}`, "Graficos");
    pieChart(c, 42, 445, 245, 190, [
      {name:"Endodontia", value:endo, color:COLORS.navyMid},
      {name:"Ortodontia", value:orto, color:COLORS.gold},
      {name:"Outros", value:outros, color:COLORS.muted},
    ].filter(item => item.value > 0), "Receita por Especialidade");
    pieChart(c, 308, 445, 245, 190, [
      {name:"Receitas", value:recMes.reduce((s,t)=>s+Number(t.valor||0),0), color:COLORS.navyMid},
      {name:"Despesas", value:despesasMes.reduce((s,t)=>s+Number(t.valor||0),0), color:COLORS.red},
    ].filter(item => item.value > 0), "Receitas vs Despesas");
    textRows(c, [
      "Os graficos acima usam os mesmos dados do aplicativo.",
      "A receita por especialidade considera Endodontia, Ortodontia e Outros.",
      "Receitas vs Despesas considera todos os lancamentos financeiros do mes.",
    ], 360);
    return c;
  });

  // Página 3: terceiro gráfico do aplicativo + início do detalhamento.
  const transactionPageSize = 24;
  const transactionChunks = [];
  for (let i = 0; i < transactionLines.length; i += transactionPageSize) {
    transactionChunks.push(transactionLines.slice(i, i + transactionPageSize));
  }

  pages.push(() => {
    const c = [];
    reportHeader(c, `RELATORIO MENSAL - ${ascii(monthLabel).toUpperCase()} ${year}`, "Receita por clinica");
    horizontalBars(c, 42, 535, 511, 215, clinicItems.slice(0, 9), "Receita por Clinica");
    textRows(c, [
      "DETALHAMENTO DOS LANCAMENTOS",
      `Total de registros: ${sorted.length}`,
      ...(transactionChunks[0] || ["Nenhum lancamento registrado neste mes."]),
    ], 500);
    return c;
  });

  // As páginas seguintes garantem que nenhum lançamento seja descartado,
  // mesmo quando o mês possui dezenas de registros.
  for (let i = 1; i < transactionChunks.length; i += 1) {
    pages.push(() => {
      const c = [];
      reportHeader(
        c,
        `RELATORIO MENSAL - ${ascii(monthLabel).toUpperCase()} ${year}`,
        `Lancamentos ${i * transactionPageSize + 1}-${Math.min((i + 1) * transactionPageSize, sorted.length)}`
      );
      textRows(c, transactionChunks[i], 760);
      return c;
    });
  }

  return makePdf(pages);
}

export function generateAnnualReportPdf({ year, rows = [] }) {
  const allRows = Array.isArray(rows) ? rows : [];
  const active = allRows.filter(r => r?.ativo);
  const receita = active.reduce((s,r)=>s+Number(r.receita||0),0);
  const despesa = active.reduce((s,r)=>s+Number(r.despesa||0),0);
  const lucro = active.reduce((s,r)=>s+Number(r.lucro||0),0);
  const impostos = active.reduce((s,r)=>s+Number(r.impostos||0),0);
  const distribuicao = active.reduce((s,r)=>s+Number(r.distribuicao||0),0);
  const pl = active.reduce((s,r)=>s+Number(r.pl||0),0);
  const inss = active.reduce((s,r)=>s+Number(r.inss||0),0);
  const irrf = active.reduce((s,r)=>s+Number(r.irrf||0),0);
  const receitaMonths = active.filter(r=>Number(r.receita||0)>0);
  const mediaReceita = receitaMonths.length ? receita / receitaMonths.length : 0;
  const best = active.length ? active.reduce((a,b)=>b.lucro>a.lucro?b:a) : null;
  const worst = active.length ? active.reduce((a,b)=>b.lucro<a.lucro?b:a) : null;
  const data = allRows.map((r,i)=>({...r, mesLabel:r.mesLabel || SHORT_MONTHS[i], mesIndex:i}));

  const charts = [
    ["receita", "Receita total", COLORS.navyMid],
    ["despesa", "Despesas totais", COLORS.red],
    ["lucro", "Lucro liquido", COLORS.green],
    ["impostos", "Impostos pagos", COLORS.red],
    ["pl", "Pro-labore", COLORS.gold],
    ["inss", "INSS", COLORS.purple],
    ["irrf", "IRRF PF", COLORS.red],
    ["distribuicao", "Distribuicao de lucros", COLORS.gold],
    ["margem", "Margem liquida", COLORS.navyMid],
    ["mediaReceitaAcumulada", "Receita media mensal", COLORS.muted],
    ["melhorMes", "Melhor mes", COLORS.green],
    ["piorMes", "Pior mes", COLORS.red],
    ["evolucao", "Evolucao mes a mes", COLORS.muted],
  ];

  const prepared = data.map(r => ({
    ...r,
    melhorMes: r.isMelhor ? r.lucro : 0,
    piorMes: r.isPior ? r.lucro : 0,
    evolucao: r.mesIndex === 0 ? 0 : Number(r.receita||0) - Number(data[r.mesIndex-1]?.receita||0),
  }));

  const pages = [];
  pages.push(() => {
    const c=[];
    reportHeader(c, `RELATORIO ANUAL - ${year}`, "Resumo");
    textRows(c, [
      "RESUMO DO ANO",
      `Receita total: ${money(receita)}`,
      `Despesas totais: ${money(despesa)}`,
      `Lucro liquido: ${money(lucro)}`,
      `Impostos pagos: ${money(impostos)}`,
      `Pro-labore: ${money(pl)}`,
      `INSS: ${money(inss)}`,
      `IRRF PF: ${money(irrf)}`,
      `Distribuicao de lucros: ${money(distribuicao)}`,
      `Margem liquida: ${percent((lucro/(receita||1))*100)}`,
      `Receita media mensal: ${money(mediaReceita)}`,
      `Melhor mes: ${best ? `${best.mesLabel || SHORT_MONTHS[best.mesIndex]} - ${money(best.lucro)}` : "-"}`,
      `Pior mes: ${worst ? `${worst.mesLabel || SHORT_MONTHS[worst.mesIndex]} - ${money(worst.lucro)}` : "-"}`,
      "",
      "Os meses sem lancamentos nao possuem barras no aplicativo e tambem nao sao plotados no PDF.",
      "A linha sobreposta aos graficos de barras representa a media movel de 3 meses.",
    ], 760);
    return c;
  });

  for (let i=0;i<charts.length;i+=2) {
    pages.push(() => {
      const c=[];
      reportHeader(c, `RELATORIO ANUAL - ${year}`, `Graficos ${i+1}-${Math.min(i+2,charts.length)}`);
      for (let j=0;j<2;j++) {
        const ch=charts[i+j]; if(!ch) continue;
        const [key,title,color]=ch;
        const local = prepared.filter(r=>r.ativo);
        barChart(c, 42, j===0 ? 438 : 86, 511, 310, local, key, title, color, key === "margem" ? (v=>`${Number(v).toFixed(1)}%`) : fmtShort);
      }
      return c;
    });
  }

  pages.push(() => {
    const c=[];
    reportHeader(c, `RELATORIO ANUAL - ${year}`, "Receita x Despesa x Lucro");
    comboChart(c, 42, 420, 511, 320, prepared);
    textRows(c, [
      "",
      "DETALHAMENTO DOS IMPOSTOS",
      "Mes | DAS | INSS | IRRF PF | Total",
      ...allRows.map(r => `${r.mesLabel || SHORT_MONTHS[r.mesIndex]} | ${money(r.das)} | ${money(r.inss)} | ${money(r.irrf)} | ${money(r.impostos)}`),
    ], 390);
    return c;
  });

  return makePdf(pages);
}

export async function openPdfBlob(blob) {
  if (!(blob instanceof Blob) || blob.size < 100) throw new Error("PDF invalido.");
  const filename = "contabilidade-pj-relatorio.pdf";

  // iOS/Safari pode rejeitar navigator.share para determinados PDFs.
  // Nesse caso, usamos automaticamente a abertura do Blob como fallback.
  if (typeof navigator !== "undefined" && navigator.share && typeof File !== "undefined") {
    try {
      const file = new File([blob], filename, { type: "application/pdf" });
      const canShareFiles = typeof navigator.canShare !== "function"
        ? true
        : navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({ files: [file], title: "Relatorio Contabilidade-PJ" });
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.warn("Compartilhamento do PDF indisponivel; usando abertura direta.", error);
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    if (typeof document !== "undefined") {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
}
