const ALLOWED_LEVELS = new Set(['production', 'error'])
const MAX_BODY_BYTES = 4096

const EVENT_PATTERN = /^[a-z0-9_.:-]{1,80}$/

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') return undefined
  const valueTrimmed = value.trim()
  if (!valueTrimmed) return undefined
  return valueTrimmed.slice(0, maxLength)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const rawBody =
      typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body ?? {})

    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'Payload too large' })
    }

    const body =
      typeof req.body === 'object' && req.body !== null
        ? req.body
        : JSON.parse(rawBody)

    const level = sanitizeString(body.level, 20)
    const event = sanitizeString(body.event, 80)

    if (!ALLOWED_LEVELS.has(level) || !event || !EVENT_PATTERN.test(event)) {
      return res.status(400).json({ error: 'Invalid observability event' })
    }

    const record = {
      level,
      event,
      category: sanitizeString(body.category, 40),
      operation: sanitizeString(body.operation, 80),
      code: sanitizeString(body.code, 40),
      status: Number.isInteger(body.status) ? body.status : undefined,
      source: sanitizeString(body.source, 40),
      timestamp: new Date().toISOString(),
    }

    const cleanRecord = Object.fromEntries(
      Object.entries(record).filter(([, value]) => value !== undefined),
    )

    if (level === 'error') {
      console.error('[observability]', cleanRecord)
    } else {
      console.info('[observability]', cleanRecord)
    }

    return res.status(204).end()
  } catch {
    return res.status(400).json({ error: 'Invalid observability payload' })
  }
}
