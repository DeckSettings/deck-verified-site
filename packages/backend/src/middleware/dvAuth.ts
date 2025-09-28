import { createHmac, timingSafeEqual } from 'crypto'
import type { RequestHandler } from 'express'
import config from '../config'
import logger from '../logger'

type DvIdentity = {
  id: string
  login: string
}

const base64UrlEncode = (input: Buffer): string => input
  .toString('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')

const base64UrlDecode = (input: string): Buffer => {
  const padLength = (4 - (input.length % 4)) % 4
  const normalized = `${input}${'='.repeat(padLength)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  return Buffer.from(normalized, 'base64')
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string')

const dvAuth: RequestHandler = (req, res, next) => {
  try {
    if (!config.jwtSecret) {
      logger.error('DV auth middleware invoked without JWT secret configured')
      res.status(500).json({ error: 'dv_auth_not_configured' })
      return
    }

    const header = req.headers.authorization
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'missing_authorization' })
      return
    }

    const token = header.slice('Bearer '.length).trim()
    const segments = token.split('.')
    if (segments.length !== 3) {
      res.status(401).json({ error: 'invalid_token_format' })
      return
    }

    const [encodedHeader, encodedPayload, providedSignature] = segments
    let headerJson: Record<string, unknown>
    let payloadJson: Record<string, unknown>
    try {
      headerJson = JSON.parse(base64UrlDecode(encodedHeader).toString('utf8'))
      payloadJson = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'))
    } catch (error) {
      logger.warn('Failed to parse DV token contents', error)
      res.status(401).json({ error: 'invalid_token_payload' })
      return
    }

    if (headerJson?.alg !== 'HS256' || headerJson?.typ !== 'JWT') {
      res.status(401).json({ error: 'unsupported_token_algorithm' })
      return
    }

    const expectedSignature = base64UrlEncode(
      createHmac('sha256', config.jwtSecret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest(),
    )

    const providedBuffer = Buffer.from(providedSignature, 'utf8')
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8')
    if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
      res.status(401).json({ error: 'invalid_token_signature' })
      return
    }

    const exp = typeof payloadJson?.exp === 'number' ? payloadJson.exp : null
    const sub = typeof payloadJson?.sub === 'string' ? payloadJson.sub : null
    const login = typeof payloadJson?.login === 'string' ? payloadJson.login : null
    const scopes = payloadJson?.scopes

    if (!exp || !sub || !login) {
      res.status(401).json({ error: 'invalid_token_claims' })
      return
    }

    if (!isStringArray(scopes) || !scopes.includes('internal')) {
      res.status(401).json({ error: 'missing_internal_scope' })
      return
    }

    const now = Math.floor(Date.now() / 1000)
    if (exp <= now) {
      res.status(401).json({ error: 'expired_token' })
      return
    }

    const identity: DvIdentity = { id: sub, login }
    res.locals.dvIdentity = identity
    next()
  } catch (error) {
    logger.error('Unexpected DV auth error', error)
    res.status(401).json({ error: 'dv_auth_error' })
  }
}

export default dvAuth

declare module 'express-serve-static-core' {
  interface ResponseLocals {
    dvIdentity?: DvIdentity
  }
}

