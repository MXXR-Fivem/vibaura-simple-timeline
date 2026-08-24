import 'express'
import type { AuthInfo } from '@modelcontextprotocol/server'

declare global {
  namespace Express {
    interface Request {
      /** Identifiant de l'utilisateur authentifié, posé par `requireAuth`. */
      user?: string
      /** Agent MCP authentifié, posé par `requireMcpAuth` et relayé aux outils. */
      auth?: AuthInfo
    }
  }
}
