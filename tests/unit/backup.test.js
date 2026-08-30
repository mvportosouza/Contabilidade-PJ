import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, MAX_BACKUP_BYTES, normalizeBackup } from '../../lib/validators'

const tx = {
  id: 'tx-1',
  tipo: 'receita',
  valor: 1000,
  data: '2026-08-30',
  nome: 'Cliente',
  cnpj: '', telefone: '', cep: '', endereco: '', email: '', especialidade: '', dente: '',
  categoria: 'Receita', descricao: '', notaGerada: false, numeroNota: '', dataEmissao: '',
  taxaISS: '', informadoContab: false,
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-08-30T10:00:00.000Z',
}

function backup(overrides = {}) {
  return {
    version: BACKUP_VERSION,
    schema: 'contabilidade-pj-backup',
    txs: [tx],
    favs: [],
    plMap: {}, plManual: {}, ctbMap: {}, irrfMap: {},
    exportedAt: '2026-08-30T10:00:00.000Z',
    ...overrides,
  }
}

describe('Lote 02 — validação de backup', () => {
  it('aceita backup vazio e backup completo válido', () => {
    expect(() => normalizeBackup(backup({ txs: [] }))).not.toThrow()
    expect(() => normalizeBackup(backup())).not.toThrow()
  })

  it('rejeita versão incompatível', () => {
    expect(() => normalizeBackup(backup({ version: BACKUP_VERSION + 1 }))).toThrow(/versão|mais nova/i)
  })

  it('rejeita campo desconhecido sem descartá-lo silenciosamente', () => {
    expect(() => normalizeBackup(backup({ unknownField: true }))).toThrow(/campo desconhecido/i)
    expect(() => normalizeBackup(backup({ txs: [{ ...tx, unknownField: true }] }))).toThrow(/campo desconhecido/i)
  })

  it('rejeita tipo inválido em vez de convertê-lo para receita', () => {
    expect(() => normalizeBackup(backup({ txs: [{ ...tx, tipo: 'abc' }] }))).toThrow(/tipo inválido/i)
  })

  it('rejeita tipos inválidos nos campos tipados', () => {
    expect(() => normalizeBackup(backup({ txs: [{ ...tx, valor: '1000' }] }))).toThrow(/valor inválido/i)
    expect(() => normalizeBackup(backup({ txs: [{ ...tx, notaGerada: 'false' }] }))).toThrow(/tipo inválido/i)
  })

  it('rejeita campo obrigatório ausente', () => {
    const { id, ...withoutId } = tx
    expect(() => normalizeBackup(backup({ txs: [withoutId] }))).toThrow(/id ausente/i)
  })

  it('rejeita JSON estruturalmente inválido antes de qualquer normalização', () => {
    expect(() => normalizeBackup(null)).toThrow(/backup inválido/i)
    expect(() => normalizeBackup({ ...backup(), txs: {} })).toThrow(/lista válida/i)
  })

  it('rejeita backup grande acima do limite de lançamentos', () => {
    expect(() => normalizeBackup(backup({ txs: Array.from({ length: 100001 }, () => tx) }))).toThrow(/100.000/i)
  })

  it('rejeita mapa com tipo inválido em vez de convertê-lo para objeto vazio', () => {
    expect(() => normalizeBackup(backup({ plMap: [] }))).toThrow(/tipo inválido/i)
    expect(() => normalizeBackup(backup({ plMap: { '2026-08': '5000' } }))).toThrow(/valor inválido/i)
  })

  it('mantém limite explícito de arquivo de 5 MB', () => {
    expect(MAX_BACKUP_BYTES).toBe(5 * 1024 * 1024)
  })
})
