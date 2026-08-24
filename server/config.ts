// Configuration centralisée : lit l'environnement une seule fois et évalue la
// sûreté des identifiants/secret. Le garde-fou (index.ts) refuse de démarrer en
// production tant que `usingInsecureDefaults` est vrai.

const { AUTH_USERNAME, AUTH_PASSWORD, SESSION_SECRET, PORT, DB_PATH, BACKUP_DIR, MCP_TOKENS, NODE_ENV } =
  process.env

// Valeurs livrées dans .env.example : elles ne doivent JAMAIS servir en prod.
// (Toute valeur de cette liste, ou un secret trop court, bloque le démarrage.)
const PLACEHOLDER_PASSWORDS = new Set(['changeme', 'change-moi-stp', 'CHANGE_ME'])
const PLACEHOLDER_SECRETS = new Set([
  'remplace-par-une-longue-chaine-aleatoire',
  'dev-insecure-secret-change-me',
  'CHANGE_ME',
])
const MIN_SECRET_LENGTH = 32
const MIN_MCP_TOKEN_LENGTH = 32

// « nom:token,nom:token » => Map token -> nom. Un token vide ou dupliqué est
// ignoré ; la validation de longueur est faite par collectInsecureReasons().
function parseMcpTokens(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of (raw ?? '').split(',')) {
    const sep = entry.indexOf(':')
    if (sep <= 0) continue
    const name = entry.slice(0, sep).trim()
    const token = entry.slice(sep + 1).trim()
    if (name && token) map.set(token, name)
  }
  return map
}

const mcpTokens = parseMcpTokens(MCP_TOKENS)

function collectInsecureReasons(): string[] {
  const reasons: string[] = []
  if (!AUTH_PASSWORD || PLACEHOLDER_PASSWORDS.has(AUTH_PASSWORD)) {
    reasons.push("AUTH_PASSWORD manquant ou laissé sur une valeur d'exemple")
  }
  if (!SESSION_SECRET || PLACEHOLDER_SECRETS.has(SESSION_SECRET)) {
    reasons.push("SESSION_SECRET manquant ou laissé sur une valeur d'exemple")
  } else if (SESSION_SECRET.length < MIN_SECRET_LENGTH) {
    reasons.push(`SESSION_SECRET trop court (< ${MIN_SECRET_LENGTH} caractères)`)
  }
  // MCP est optionnel : rien à valider tant qu'aucun token n'est déclaré.
  for (const [token, name] of mcpTokens) {
    if (token.length < MIN_MCP_TOKEN_LENGTH || PLACEHOLDER_SECRETS.has(token)) {
      reasons.push(
        `MCP_TOKENS : le token de « ${name} » est trop court (< ${MIN_MCP_TOKEN_LENGTH}) ou laissé sur une valeur d'exemple`
      )
    }
  }
  return reasons
}

export interface Config {
  readonly username: string
  readonly password: string
  readonly secret: string
  readonly port: number
  readonly dbPath: string
  /** Dossier des sauvegardes JSON (journal + instantanés). */
  readonly backupDir: string
  /** Token d'agent -> nom du dev. Vide = endpoint MCP non monté. */
  readonly mcpTokens: ReadonlyMap<string, string>
  readonly isProduction: boolean
}

export const config: Config = {
  username: AUTH_USERNAME || 'vibaura',
  password: AUTH_PASSWORD || 'changeme',
  secret: SESSION_SECRET || 'dev-insecure-secret-change-me',
  port: Number(PORT) || 8790,
  dbPath: DB_PATH || './data/timeline.db',
  backupDir: BACKUP_DIR || './data/backups',
  mcpTokens,
  isProduction: NODE_ENV === 'production',
}

export const insecureConfigReasons = collectInsecureReasons()
export const usingInsecureDefaults = insecureConfigReasons.length > 0
