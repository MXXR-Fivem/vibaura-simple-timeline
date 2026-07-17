import 'express'

declare global {
  namespace Express {
    interface Request {
      /** Identifiant de l'utilisateur authentifié, posé par `requireAuth`. */
      user?: string
    }
  }
}
