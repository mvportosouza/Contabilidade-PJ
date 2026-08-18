export const BACKUP_VERSION = 4;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Normaliza datas de competência para YYYY-MM-DD.
 * Não usa new Date("YYYY-MM-DD") para evitar deslocamentos de fuso.
 */
export function normalizeDateOnly(value, { fallback = null } = {}) {
  if (value == null || value === '') return fallback;

  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return fallback;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return fallback;

  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return fallback;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function isValidDateOnly(value) {
  return Boolean(normalizeDateOnly(value));
}

export function normalizeMonthKey(value) {
  const text = String(value ?? '');
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text) ? text : null;
}

function finiteNonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function finiteNonNegativeStrict(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function cryptoId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch (_) {
    // Fallback abaixo.
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeTransaction(tx, { index = 0, imported = false, usedIds = new Set() } = {}) {
  if (!tx || typeof tx !== 'object' || Array.isArray(tx)) {
    throw new Error(`Lançamento ${index + 1} inválido.`);
  }

  const value = Number(tx.valor);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Lançamento ${index + 1}: valor inválido.`);
  }

  const data = normalizeDateOnly(tx.data);
  if (!data) {
    throw new Error(`Lançamento ${index + 1}: data inválida. Use YYYY-MM-DD.`);
  }

  let id = String(tx.id || '').trim();
  if (!id || usedIds.has(id)) {
    id = cryptoId();
    while (usedIds.has(id)) id = cryptoId();
  }
  usedIds.add(id);

  const now = new Date().toISOString();

  return {
    id,
    tipo: tx.tipo === 'despesa' ? 'despesa' : 'receita',
    valor: value,
    data,
    nome: String(tx.nome || tx.categoria || ''),
    cnpj: String(tx.cnpj || ''),
    telefone: String(tx.telefone || ''),
    cep: String(tx.cep || ''),
    endereco: String(tx.endereco || ''),
    email: String(tx.email || ''),
    especialidade: String(tx.especialidade || ''),
    dente: String(tx.dente || ''),
    categoria: String(tx.categoria || ''),
    descricao: String(tx.descricao || ''),
    notaGerada: Boolean(tx.notaGerada),
    numeroNota: String(tx.numeroNota || ''),
    dataEmissao: normalizeDateOnly(tx.dataEmissao) || '',
    taxaISS: tx.taxaISS ?? '',
    informadoContab: Boolean(tx.informadoContab),
    createdAt: typeof tx.createdAt === 'string' && tx.createdAt ? tx.createdAt : now,
    updatedAt: now,
  };
}

export function normalizeFavorite(item, { index = 0, usedIds = new Set() } = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`Favorito ${index + 1} inválido.`);
  }

  let id = String(item.id || '').trim();
  if (!id || usedIds.has(id)) {
    id = cryptoId();
    while (usedIds.has(id)) id = cryptoId();
  }
  usedIds.add(id);

  return {
    id,
    tipo: item.tipo === 'despesa' ? 'despesa' : 'receita',
    nome: String(item.nome || ''),
    cnpj: String(item.cnpj || ''),
    telefone: String(item.telefone || ''),
    cep: String(item.cep || ''),
    endereco: String(item.endereco || ''),
    email: String(item.email || ''),
    especialidade: String(item.especialidade || ''),
    categoria: String(item.categoria || ''),
  };
}

export function normalizePayable(item, { index = 0 } = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`Conta a pagar ${index + 1} inválida.`);
  }

  return {
    id: String(item.id || cryptoId()),
    description: String(item.description || item.descricao || ''),
    category: String(item.category || item.categoria || 'Outros'),
    supplier: String(item.supplier || item.fornecedor || ''),
    amount: finiteNonNegative(item.amount ?? item.valor),
    dueDate: normalizeDateOnly(item.dueDate || item.vencimento) || '',
    paidAt: normalizeDateOnly(item.paidAt || item.dataPagamento) || '',
    recurring: Boolean(item.recurring || item.recorrente),
    notes: String(item.notes || item.observacoes || ''),
    status: item.status || (item.paidAt ? 'pago' : 'pendente'),
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeReceivable(item, { index = 0 } = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`Conta a receber ${index + 1} inválida.`);
  }

  return {
    id: String(item.id || cryptoId()),
    description: String(item.description || item.descricao || ''),
    client: String(item.client || item.cliente || ''),
    amount: finiteNonNegative(item.amount ?? item.valor),
    issueDate: normalizeDateOnly(item.issueDate || item.dataEmissao) || new Date().toISOString().slice(0, 10),
    dueDate: normalizeDateOnly(item.dueDate || item.vencimento) || '',
    receivedAt: normalizeDateOnly(item.receivedAt || item.dataRecebimento) || '',
    invoiceNumber: String(item.invoiceNumber || item.numeroNota || ''),
    notes: String(item.notes || item.observacoes || ''),
    status: item.status || (item.receivedAt ? 'recebido' : 'aberto'),
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeAsset(item, { index = 0 } = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`Ativo ${index + 1} inválido.`);
  }

  return {
    id: String(item.id || cryptoId()),
    name: String(item.name || item.nome || ''),
    category: String(item.category || item.categoria || 'Equipamento'),
    acquisitionDate: normalizeDateOnly(item.acquisitionDate || item.dataAquisicao) || '',
    acquisitionValue: finiteNonNegative(item.acquisitionValue ?? item.valorAquisicao),
    usefulLifeYears: Math.max(0, Number(item.usefulLifeYears ?? item.vidaUtil ?? 0) || 0),
    residualValue: finiteNonNegative(item.residualValue ?? item.valorResidual),
    active: item.active !== false,
    notes: String(item.notes || item.observacoes || ''),
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeMapValues(value, label) {
  const source = safeMap(value);
  const output = {};

  for (const [key, raw] of Object.entries(source)) {
    if (!normalizeMonthKey(key)) {
      throw new Error(`${label}: competência inválida (${key}).`);
    }

    const number = finiteNonNegativeStrict(raw);
    if (number === null) {
      throw new Error(`${label}: valor inválido em ${key}.`);
    }

    output[key] = number;
  }

  return output;
}

/**
 * Valida e normaliza um backup inteiro antes de qualquer gravação.
 * Isso evita importação parcial e rejeita payloads excessivos/corrompidos.
 */
export function normalizeBackup(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Backup inválido.');
  }

  const rawVersion = payload.version == null ? 1 : Number(payload.version);
  if (!Number.isInteger(rawVersion) || rawVersion < 1) {
    throw new Error('Versão do backup inválida.');
  }

  if (rawVersion > BACKUP_VERSION) {
    throw new Error('Este backup foi criado por uma versão mais nova do aplicativo.');
  }

  const txData = payload.txs ?? payload.transactions;
  const favData = payload.favs ?? payload.favorites;

  if (!Array.isArray(txData)) {
    throw new Error('Backup sem lista válida de lançamentos.');
  }

  if (txData.length > 100000) {
    throw new Error('Backup excede o limite de 100.000 lançamentos.');
  }

  if (favData != null && !Array.isArray(favData)) {
    throw new Error('Lista de favoritos inválida.');
  }

  if (favData && favData.length > 10000) {
    throw new Error('Backup excede o limite de favoritos.');
  }

  const usedTxIds = new Set();
  const txs = txData.map((tx, index) =>
    normalizeTransaction(tx, { index, imported: true, usedIds: usedTxIds }),
  );

  const usedFavIds = new Set();
  const favs = (favData || []).map((fav, index) =>
    normalizeFavorite(fav, { index, usedIds: usedFavIds }),
  );

  return {
    version: BACKUP_VERSION,
    schema: 'contabilidade-pj-backup',
    txs,
    favs,
    plMap: normalizeMapValues(payload.plMap ?? payload.proLaboreMap ?? {}, 'Pró-labore'),
    plManual: normalizeMapValues(payload.plManual ?? {}, 'Pró-labore manual'),
    ctbMap: normalizeMapValues(payload.ctbMap ?? payload.contabMap ?? {}, 'Contabilidade'),
    irrfMap: normalizeMapValues(payload.irrfMap ?? {}, 'IRRF'),
    exportedAt: typeof payload.exportedAt === 'string'
      ? payload.exportedAt
      : typeof payload.at === 'string'
        ? payload.at
        : null,
  };
}

export function validateBackup(payload) {
  normalizeBackup(payload);
  return true;
}
