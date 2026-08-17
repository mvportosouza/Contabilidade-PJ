export const BACKUP_VERSION = 2;

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeTransaction(tx) {
  const value = Number(tx?.valor);
  return {
    id: String(tx?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    tipo: tx?.tipo === 'despesa' ? 'despesa' : 'receita',
    valor: Number.isFinite(value) ? Math.max(0, value) : 0,
    data: tx?.data || new Date().toISOString().slice(0, 10),
    nome: String(tx?.nome || tx?.categoria || ''),
    cnpj: String(tx?.cnpj || ''),
    telefone: String(tx?.telefone || ''),
    cep: String(tx?.cep || ''),
    endereco: String(tx?.endereco || ''),
    email: String(tx?.email || ''),
    especialidade: String(tx?.especialidade || ''),
    dente: String(tx?.dente || ''),
    categoria: String(tx?.categoria || ''),
    descricao: String(tx?.descricao || ''),
    notaGerada: Boolean(tx?.notaGerada),
    numeroNota: String(tx?.numeroNota || ''),
    dataEmissao: String(tx?.dataEmissao || ''),
    taxaISS: tx?.taxaISS ?? '',
    informadoContab: Boolean(tx?.informadoContab),
    createdAt: tx?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizePayable(item) {
  return {
    id: String(item?.id || cryptoId()),
    description: String(item?.description || item?.descricao || ''),
    category: String(item?.category || item?.categoria || 'Outros'),
    supplier: String(item?.supplier || item?.fornecedor || ''),
    amount: finitePositive(item?.amount ?? item?.valor),
    dueDate: item?.dueDate || item?.vencimento || '',
    paidAt: item?.paidAt || item?.dataPagamento || '',
    recurring: Boolean(item?.recurring || item?.recorrente),
    notes: String(item?.notes || item?.observacoes || ''),
    status: item?.status || (item?.paidAt ? 'pago' : 'pendente'),
    createdAt: item?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeReceivable(item) {
  return {
    id: String(item?.id || cryptoId()),
    description: String(item?.description || item?.descricao || ''),
    client: String(item?.client || item?.cliente || ''),
    amount: finitePositive(item?.amount ?? item?.valor),
    issueDate: item?.issueDate || item?.dataEmissao || new Date().toISOString().slice(0, 10),
    dueDate: item?.dueDate || item?.vencimento || '',
    receivedAt: item?.receivedAt || item?.dataRecebimento || '',
    invoiceNumber: String(item?.invoiceNumber || item?.numeroNota || ''),
    notes: String(item?.notes || item?.observacoes || ''),
    status: item?.status || (item?.receivedAt ? 'recebido' : 'aberto'),
    createdAt: item?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeAsset(item) {
  return {
    id: String(item?.id || cryptoId()),
    name: String(item?.name || item?.nome || ''),
    category: String(item?.category || item?.categoria || 'Equipamento'),
    acquisitionDate: item?.acquisitionDate || item?.dataAquisicao || '',
    acquisitionValue: finitePositive(item?.acquisitionValue ?? item?.valorAquisicao),
    usefulLifeYears: Math.max(0, Number(item?.usefulLifeYears ?? item?.vidaUtil ?? 0) || 0),
    residualValue: finitePositive(item?.residualValue ?? item?.valorResidual),
    active: item?.active !== false,
    notes: String(item?.notes || item?.observacoes || ''),
    createdAt: item?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function validateBackup(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Backup inválido.');
  }
  if (payload.version && Number(payload.version) > BACKUP_VERSION) {
    throw new Error('Este backup foi criado por uma versão mais nova do aplicativo.');
  }
  if (!('txs' in payload) && !('transactions' in payload)) {
    throw new Error('Backup sem lançamentos.');
  }
  return true;
}

export function cryptoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
