// Endpoint MCP : les agents des devs (Claude Code, Codex, Gemini CLI) parlent
// ici, sur la même instance que l'app web, avec la même base.
//
// `createMcpHandler` sert les deux révisions du protocole sur la même URL :
// la moderne (2026-07-28, sans handshake) et l'ancienne (2025-*, avec
// `initialize`) — les clients ne sont pas tous au même point.
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import type { Express, RequestHandler } from 'express'
import { config } from '../config.js'
import { matchMcpToken } from '../auth.js'
import { buildMcpServer } from './tools.js'
import type { Actor } from '../backup.js'

export const MCP_PATH = '/api/mcp'

const requireMcpAuth: RequestHandler = (req, res, next) => {
  // Un client MCP n'est pas un navigateur : la présence d'un Origin signale une
  // page web qui tente d'atteindre l'endpoint (DNS rebinding). On refuse.
  if (req.get('origin')) return res.status(403).json({ error: 'origin_not_allowed' })

  const header = req.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const name = token ? matchMcpToken(token) : null
  if (!name) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="vibaura-timeline"')
    return res.status(401).json({ error: 'unauthorized' })
  }
  req.auth = { token, clientId: `mcp:${name}`, scopes: [], extra: { actorName: name } }
  next()
}

function actorFrom(authInfo: { extra?: Record<string, unknown> } | undefined): Actor {
  const name = authInfo?.extra?.actorName
  return { origin: 'mcp', name: typeof name === 'string' ? name : 'inconnu' }
}

/**
 * Monte l'endpoint si au moins un token est configuré. Renvoie les noms
 * autorisés (pour le log de démarrage), ou null si MCP est désactivé.
 */
export function mountMcp(app: Express): string[] | null {
  if (config.mcpTokens.size === 0) return null

  const handler = createMcpHandler((ctx) => buildMcpServer(actorFrom(ctx.authInfo)), {
    onerror: (err) => console.error('[mcp]', err.message),
  })
  const node = toNodeHandler(handler)

  // `express.json()` a déjà consommé le flux : on repasse le corps parsé.
  app.all(MCP_PATH, requireMcpAuth, (req, res) => {
    void node(req, res, req.body)
  })
  return [...new Set(config.mcpTokens.values())]
}
