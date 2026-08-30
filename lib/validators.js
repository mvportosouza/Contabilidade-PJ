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

const TRANSACTION_KEYS = new Set([
  'id', 'tipo', 'valor', 'data', 'nome', 'cnpj', 'telefone', 'cep', 'endereco',
  'email', 'especialidade', 'dente', 'categoria', 'descricao', 'notaGerada',
  'numeroNota', 'dataEmissao', 'taxaISS', 'informadoContab', 'createdAt', 'updatedAt',
]);
const FAVORITE_KEYS = new Set([
  'id', 'tipo', 'nome', 'cnpj', 'telefone', 'cep', 'endereco', 'email',
  'especialidade', 'categoria',
]);
const BACKUP_KEYS = new Set([
  'version', 'schema', 'txs', 'transactions', 'favs', 'favorites',
  'plMap', 'proLaboreMap', 'plManual', 'ctbMap', 'contabMap', 'irrfMap',
  'exportedAt', 'at',
]);

function assertPlainObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
}

function assertNoUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label}: campo desconhecido (${key}).`);
  }
}

function optionalString(value, label) {
  if (value == null) return '';
  if (typeof value !== 'string') throw new Error(`${label}: tipo inválido.`);
  return value;
}

function optionalBoolean(value, label) {
  if (value == null) return false;
  if (typeof value !== 'boolean') throw new Error(`${label}: tipo inválido.`);
  return value;
}

function requiredFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}: valor inválido.`);
  }
  return value;
}

function validateIsoTimestamp(value, label) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label}: timestamp inválido.`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label}: timestamp inválido.`);
  return value;
}

export function normalizeTransaction(tx, { index = 0, imported = false, usedIds = new Set() } = {}) {
  assertPlainObject(tx, `Lançamento ${index + 1} inválido.`);
  assertNoUnknownKeys(tx, TRANSACTION_KEYS, `Lançamento ${index + 1}`);

  if (typeof tx.tipo !== 'string' || !['receita', 'despesa', 'distribuicao'].includes(tx.tipo)) {
    throw new Error(`Lançamento ${index + 1}: tipo inválido.`);
  }
  const value = requiredFiniteNumber(tx.valor, `Lançamento ${index + 1}`);
  if (typeof tx.data !== 'string' || !normalizeDateOnly(tx.data)) {
    throw new Error(`Lançamento ${index + 1}: data inválida. Use YYYY-MM-DD.`);
  }

  let id = optionalString(tx.id, `Lançamento ${index + 1}: id`).trim();
  if (!id) throw new Error(`Lançamento ${index + 1}: id ausente.`);
  if (usedIds.has(id)) {
    // Legacy imports historically tolerated repeated IDs. Preserve that
    // compatibility deterministically instead of silently overwriting a row.
    const baseId = id;
    let suffix = 2;
    while (usedIds.has(`${baseId}-${suffix}`)) suffix += 1;
    id = `${baseId}-${suffix}`;
  }
  usedIds.add(id);

  const now = new Date().toISOString();
  const createdAt = tx.createdAt == null ? now : validateIsoTimestamp(tx.createdAt, `Lançamento ${index + 1}: createdAt`);
  const updatedAt = tx.updatedAt == null ? now : validateIsoTimestamp(tx.updatedAt, `Lançamento ${index + 1}: updatedAt`);

  if (tx.taxaISS != null && tx.taxaISS !== '' && typeof tx.taxaISS !== 'string') {
    throw new Error(`Lançamento ${index + 1}: taxaISS com tipo inválido.`);
  }
  if (tx.dataEmissao != null && tx.dataEmissao !== '' && (typeof tx.dataEmissao !== 'string' || !normalizeDateOnly(tx.dataEmissao))) {
    throw new Error(`Lançamento ${index + 1}: dataEmissao inválida.`);
  }

  return {
    id,
    tipo: tx.tipo,
    valor: value,
    data: normalizeDateOnly(tx.data),
    nome: optionalString(tx.nome, `Lançamento ${index + 1}: nome`),
    cnpj: optionalString(tx.cnpj, `Lançamento ${index + 1}: cnpj`),
    telefone: optionalString(tx.telefone, `Lançamento ${index + 1}: telefone`),
    cep: optionalString(tx.cep, `Lançamento ${index + 1}: cep`),
    endereco: optionalString(tx.endereco, `Lançamento ${index + 1}: endereco`),
    email: optionalString(tx.email, `Lançamento ${index + 1}: email`),
    especialidade: optionalString(tx.especialidade, `Lançamento ${index + 1}: especialidade`),
    dente: optionalString(tx.dente, `Lançamento ${index + 1}: dente`),
    categoria: optionalString(tx.categoria, `Lançamento ${index + 1}: categoria`),
    descricao: optionalString(tx.descricao, `Lançamento ${index + 1}: descricao`),
    notaGerada: optionalBoolean(tx.notaGerada, `Lançamento ${index + 1}: notaGerada`),
    numeroNota: optionalString(tx.numeroNota, `Lançamento ${index + 1}: numeroNota`),
    dataEmissao: tx.dataEmissao == null || tx.dataEmissao === '' ? '' : normalizeDateOnly(tx.dataEmissao),
    taxaISS: tx.taxaISS ?? '',
    informadoContab: optionalBoolean(tx.informadoContab, `Lançamento ${index + 1}: informadoContab`),
    createdAt,
    updatedAt,
  };
}

export function normalizeFavorite(item, { index = 0, usedIds = new Set() } = {}) {
  assertPlainObject(item, `Favorito ${index + 1} inválido.`);
  assertNoUnknownKeys(item, FAVORITE_KEYS, `Favorito ${index + 1}`);
  if (typeof item.tipo !== 'string' || !['receita', 'despesa'].includes(item.tipo)) {
    throw new Error(`Favorito ${index + 1}: tipo inválido.`);
  }
  const id = optionalString(item.id, `Favorito ${index + 1}: id`).trim();
  if (!id) throw new Error(`Favorito ${index + 1}: id ausente.`);
  if (usedIds.has(id)) throw new Error(`Favorito ${index + 1}: id duplicado.`);
  usedIds.add(id);

  return {
    id,
    tipo: item.tipo,
    nome: optionalString(item.nome, `Favorito ${index + 1}: nome`),
    cnpj: optionalString(item.cnpj, `Favorito ${index + 1}: cnpj`),
    telefone: optionalString(item.telefone, `Favorito ${index + 1}: telefone`),
    cep: optionalString(item.cep, `Favorito ${index + 1}: cep`),
    endereco: optionalString(item.endereco, `Favorito ${index + 1}: endereco`),
    email: optionalString(item.email, `Favorito ${index + 1}: email`),
    especialidade: optionalString(item.especialidade, `Favorito ${index + 1}: especialidade`),
    categoria: optionalString(item.categoria, `Favorito ${index + 1}: categoria`),
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
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}: tipo inválido.`);
  }
  const output = {};

  for (const [key, raw] of Object.entries(value)) {
    if (!normalizeMonthKey(key)) {
      throw new Error(`${label}: competência inválida (${key}).`);
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
      throw new Error(`${label}: valor inválido em ${key}.`);
    }
    output[key] = raw;
  }

  return output;
}

/**
 * Valida e normaliza um backup inteiro antes de qualquer gravação.
 * Isso evita importação parcial e rejeita payloads excessivos/corrompidos.
 */
export function normalizeBackup(payload) {
  assertPlainObject(payload, 'Backup inválido.');
  assertNoUnknownKeys(payload, BACKUP_KEYS, 'Backup');

  if (typeof payload.version !== 'number' || !Number.isInteger(payload.version) || payload.version < 1) {
    throw new Error('Versão do backup inválida.');
  }
  if (payload.version > BACKUP_VERSION) {
    throw new Error('Este backup foi criado por uma versão mais nova do aplicativo.');
  }

  // Backups anteriores à versão 4 did not have the current schema/timestamp
  // envelope. They remain importable for backward compatibility, but every
  // current (v4) backup must carry the explicit schema and export timestamp.
  const isLegacyBackup = payload.version < BACKUP_VERSION;
  if (payload.schema !== 'contabilidade-pj-backup' && !isLegacyBackup) {
    throw new Error('Backup inválido: esquema incompatível.');
  }
  if (payload.schema != null && payload.schema !== 'contabilidade-pj-backup') {
    throw new Error('Backup inválido: esquema incompatível.');
  }

  const txData = payload.txs ?? payload.transactions;
  const favData = payload.favs ?? payload.favorites;
  if (!Array.isArray(txData)) throw new Error('Backup sem lista válida de lançamentos.');
  if (txData.length > 100000) throw new Error('Backup excede o limite de 100.000 lançamentos.');
  if (favData != null && !Array.isArray(favData)) throw new Error('Lista de favoritos inválida.');
  if (favData && favData.length > 10000) throw new Error('Backup excede o limite de favoritos.');

  const usedTxIds = new Set();
  const txs = txData.map((tx, index) => normalizeTransaction(tx, { index, imported: true, usedIds: usedTxIds }));
  const usedFavIds = new Set();
  const favs = (favData || []).map((fav, index) => normalizeFavorite(fav, { index, usedIds: usedFavIds }));

  if (payload.exportedAt == null && payload.at == null && !isLegacyBackup) {
    throw new Error('Backup sem timestamp de exportação.');
  }
  if (payload.exportedAt != null) validateIsoTimestamp(payload.exportedAt, 'Backup: exportedAt');
  if (payload.at != null) validateIsoTimestamp(payload.at, 'Backup: at');

  return {
    version: BACKUP_VERSION,
    schema: 'contabilidade-pj-backup',
    txs,
    favs,
    plMap: normalizeMapValues(payload.plMap ?? payload.proLaboreMap ?? {}, 'Pró-labore'),
    plManual: normalizeMapValues(payload.plManual ?? {}, 'Pró-labore manual'),
    ctbMap: normalizeMapValues(payload.ctbMap ?? payload.contabMap ?? {}, 'Contabilidade'),
    irrfMap: normalizeMapValues(payload.irrfMap ?? {}, 'IRRF'),
    exportedAt: payload.exportedAt ?? payload.at ?? null,
  };
}

export function validateBackup(payload) {
  normalizeBackup(payload);
  return true;
}
