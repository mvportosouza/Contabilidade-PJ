const PROD_LEVELS = new Set(['production', 'error'])
const MAX_EVENT_LENGTH = 80
const MAX_CODE_LENGTH = 40
const MAX_OPERATION_LENGTH = 80

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text) return undefined
  return text.slice(0, maxLength)
}

function sanitizeMeta(meta = {}) {
  const safe = {}

  if (meta.category) safe.category = cleanText(meta.category, 40)
  if (meta.operation) safe.operation = cleanText(meta.operation, MAX_OPERATION_LENGTH)
  if (meta.code) safe.code = cleanText(meta.code, MAX_CODE_LENGTH)
  if (Number.isInteger(meta.status)) safe.status = meta.status
  if (meta.source) safe.source = cleanText(meta.source, 40)

  return Object.fromEntries(
    Object.entries(safe).filter(([, value]) => value !== undefined),
  )
}

function buildPayload(level, event, meta) {
  return {
    level,
    event: cleanText(event, MAX_EVENT_LENGTH) || 'unknown',
    ...sanitizeMeta(meta),
    timestamp: new Date().toISOString(),
  }
}

function postProductionEvent(payload) {
  if (typeof window === 'undefined') return

  const body = JSON.stringify(payload)

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon('/api/observability', blob)) return
    }
  } catch {
    // Logging must never interfere with application behavior.
  }

  try {
    void fetch('/api/observability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Logging must never interfere with application behavior.
  }
}

function emit(level, event, meta = {}) {
  const payload = buildPayload(level, event, meta)
  const isDevelopment = process.env.NODE_ENV !== 'production'

  if (isDevelopment) {
    if (level === 'error') {
      console.error('[observability]', payload)
    } else if (level === 'debug') {
      console.debug('[observability]', payload)
    } else {
      console.info('[observability]', payload)
    }
    return
  }

  if (PROD_LEVELS.has(level)) {
    postProductionEvent(payload)
  }
}

export const logger = {
  development(event, meta) {
    emit('development', event, meta)
  },

  debug(event, meta) {
    emit('debug', event, meta)
  },

  production(event, meta) {
    emit('production', event, meta)
  },

  error(event, meta) {
    emit('error', event, meta)
  },
}
