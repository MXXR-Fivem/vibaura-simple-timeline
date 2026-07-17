import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Le serveur tourne depuis deux emplacements différents : `server/` via tsx en
// dev, `build/server/` une fois compilé. La profondeur relative n'est donc pas
// la même et `../dist` ne peut pas être écrit en dur. On remonte jusqu'au
// premier package.json (jamais présent dans build/) pour obtenir la racine dans
// les deux cas.
function findProjectRoot(from: string): string {
  let dir = from
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return from // racine du FS atteinte : on ne trouve pas mieux
    dir = parent
  }
}

export const projectRoot = findProjectRoot(path.dirname(fileURLToPath(import.meta.url)))

/** Assets du front buildés par Vite. Absent tant que `npm run build` n'a pas tourné. */
export const publicDir = process.env.PUBLIC_DIR
  ? path.resolve(process.env.PUBLIC_DIR)
  : path.join(projectRoot, 'dist')
