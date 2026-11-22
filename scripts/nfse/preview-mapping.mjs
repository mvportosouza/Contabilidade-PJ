/**
 * Pure mapping from app_state.pj_tx2 transaction model to the draft payload.
 * This module deliberately performs no browser interaction and no fiscal side effects.
 */
const str = (value) => value == null ? '' : String(value).trim()
const digits = (value) => str(value).replace(/\D/g, '')
const money = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new Error('INVALID_INVOICE_AMOUNT')
  return Math.round(n * 100) / 100
}

export function buildNfseDraft(tx) {
  if (!tx || typeof tx !== 'object' || Array.isArray(tx)) throw new Error('INVALID_TRANSACTION')
  if (tx.tipo !== 'receita' || tx.recebido === false || tx.notaGerada === true) throw new Error('TRANSACTION_NOT_ELIGIBLE')
  const name = str(tx.nome)
  const taxId = digits(tx.cnpj)
  const serviceDescription = str(tx.descricaoServico || tx.descricao)
  const serviceCode = str(tx.codigoServico)
  const cnae = digits(tx.cnae)
  const cep = digits(tx.cep)
  const draft = {
    transactionId: str(tx.id),
    customer: {
      name,
      taxId,
      email: str(tx.email),
      phone: digits(tx.telefone),
      postalCode: cep,
      address: str(tx.endereco),
    },
    service: {
      description: serviceDescription,
      amount: money(tx.valor),
      serviceCode,
      cnae,
      nbs: str(tx.nbs),
      municipalTax: tx.issMunicipal === true,
      issRetained: str(tx.taxaISS).toLowerCase().includes('retido') && !str(tx.taxaISS).toLowerCase().includes('não'),
      discount: tx.descontoAtivo ? money(tx.descontoValor || 0) : 0,
      competenceDate: str(tx.data),
    },
  }
  const missing = []
  if (!draft.transactionId) missing.push('transactionId')
  if (!name) missing.push('customer.name')
  if (!taxId) missing.push('customer.taxId')
  if (!serviceDescription) missing.push('service.description')
  if (!serviceCode) missing.push('service.serviceCode')
  if (!cnae) missing.push('service.cnae')
  if (!draft.service.competenceDate) missing.push('service.competenceDate')
  if (missing.length) throw new Error(`MISSING_INVOICE_FIELDS:${missing.join(',')}`)
  return draft
}
