import { INITIAL_SCHEMA } from './schema.js'

// Migrations ordonnées et idempotentes, suivies par PRAGMA user_version.
// Chaque entrée fait passer la base de la version i à i+1. Pour faire évoluer le
// schéma : AJOUTER une fonction à la fin, ne jamais modifier/réordonner les
// existantes. Une base pré-versioning (user_version=0) rejoue tout depuis le
// début — sans danger, chaque étape étant écrite pour être un no-op si déjà appliquée.
const MIGRATIONS = [
  // v1 : schéma initial
  (db) => db.exec(INITIAL_SCHEMA),

  // v2 : heures optionnelles sur les évènements (start_time / end_time)
  (db) => {
    const cols = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name)
    if (!cols.includes('start_time')) db.exec('ALTER TABLE events ADD COLUMN start_time TEXT')
    if (!cols.includes('end_time')) db.exec('ALTER TABLE events ADD COLUMN end_time TEXT')
  },
]

export function migrate(db) {
  const current = db.pragma('user_version', { simple: true })
  for (let v = current; v < MIGRATIONS.length; v++) {
    const step = db.transaction(() => {
      MIGRATIONS[v](db)
      db.pragma(`user_version = ${v + 1}`)
    })
    step()
  }
}
