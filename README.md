# Vibaura — Simple Timeline

Outil collaboratif léger pour visualiser des **timelines horizontales** : on crée des
**projets**, dans chaque projet des **timelines** (date de début / fin / graduation), et
sur chaque timeline on ajoute des **évènements** (jalon ou période) en un clic.

- Front : **React** (Vite) en **TypeScript**, CSS Modules, sans framework lourd.
- Back : **Express** + **SQLite** (`better-sqlite3`) en **TypeScript**, un seul fichier de données.
- Auth : **un seul login/mot de passe partagé**, en dur dans le `.env`.
- Déploiement : **un seul conteneur Docker**, à mettre derrière ton nginx existant.

---

## Fonctionnement de la frise

Une **ligne blanche sur fond sombre**, zoomable/pannable façon Figma.

- **Ajouter un évènement** : clic sur la frise → un popover s'ouvre pré-rempli à cette date.
  Titre, date, **heure optionnelle**, ou **bloc sur plusieurs jours**, couleur.
- **Se déplacer** : glisser la frise (ou molette horizontale). Pincer pour zoomer au doigt.
- **Zoomer / dézoomer** : **molette**, boutons `+ / −`, ou **Ctrl/⌘ + molette**.
- **Ajuster / Aujourd'hui** : bouton *Ajuster* (cadre toute la timeline), *Aujourd'hui* (recentre).
- **Modifier / supprimer** : clic sur un évènement.
- Toggle **Une ligne / Lanes** : tout sur une ligne, ou réparti en rangées quand c'est dense.
- Les **graduations** (jour → mois → année) s'adaptent au niveau de zoom ; marqueur *aujourd'hui*
  et guide de date au survol.
- La plage `début / fin` de la timeline sert de **cadrage** : on peut paner au-delà (la zone
  hors plage est grisée).
- Rafraîchissement automatique toutes les ~4 s → les 3 collègues voient les changements des
  autres sans recharger.

---

## Développement local

```bash
cp .env.example .env      # ajuste AUTH_USERNAME / AUTH_PASSWORD / SESSION_SECRET
npm install
npm run dev               # front sur http://localhost:5173, API sur :8790
```

Vite (port 5173) proxifie `/api` vers le serveur Express (port 8790).

Pour tester le rendu de production en local :

```bash
npm run preview           # build le front puis sert tout via Express sur :8790
```

### TypeScript

Tout le code (client, serveur, types partagés) est en TypeScript `strict`.

```bash
npm run typecheck         # tsc -b : vérifie client + serveur + vite.config
npm run build             # tsc -b (compile le serveur vers build/) puis vite build (front vers dist/)
```

En dev, le serveur tourne directement sur les sources via `tsx` (aucune étape de build).
En production c'est le JavaScript compilé de `build/` qui est exécuté.

Les types du contrat d'API vivent dans `shared/types.ts` et sont importés **des deux côtés**
(alias `@shared/*`) : une divergence client/serveur devient une erreur de compilation.

---

## Déploiement Docker (ta VM)

```bash
cp .env.example .env
# Édite .env : identifiants + un SESSION_SECRET aléatoire, par ex :
#   openssl rand -hex 32

docker compose up -d --build
```

- L'app écoute sur **`127.0.0.1:8790`** (uniquement en local sur la VM).
- Les données SQLite sont persistées dans **`./data/`** (volume monté).
- Ton nginx fait le proxy HTTPS → voir `nginx.example.conf`.

### Variables d'environnement (`.env`)

| Variable         | Rôle                                                        |
| ---------------- | ----------------------------------------------------------- |
| `AUTH_USERNAME`  | Identifiant partagé                                         |
| `AUTH_PASSWORD`  | Mot de passe partagé                                        |
| `SESSION_SECRET` | Secret de signature des cookies (chaîne aléatoire longue)   |
| `PORT`           | Port interne du serveur (défaut `8790`)                     |
| `DB_PATH`        | Chemin du fichier SQLite (défaut `./data/timeline.db`)      |
| `NODE_ENV`       | `production` → cookies `secure` (HTTPS via nginx)           |

> ⚠️ Le mot de passe et le secret sont **en clair** dans `.env`. Garde ce fichier hors de
> Git (déjà dans `.gitignore`) et protège l'accès à la VM.

---

## nginx

Bloc d'exemple fourni dans [`nginx.example.conf`](./nginx.example.conf). L'essentiel :

```nginx
location / {
    proxy_pass http://127.0.0.1:8790;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

L'app utilise `trust proxy` et pose des cookies `Secure` en production : sers-la **en HTTPS**.

---

## Sauvegarde

Toutes les données tiennent dans un seul fichier SQLite (`data/timeline.db`), mais
il est ouvert en mode **WAL** : les dernières écritures vivent dans `-wal` tant qu'un
checkpoint n'a pas eu lieu. Un `cp` à chaud du seul `.db` peut donc perdre des données.

**Sauvegarde à chaud, cohérente (recommandé)** — snapshot atomique via SQLite :

```bash
sqlite3 data/timeline.db ".backup 'data/backup-$(date +%F).db'"
# ou, depuis le conteneur :
docker compose exec timeline \
  node -e "require('better-sqlite3')('/app/data/timeline.db').backup('/app/data/backup-'+new Date().toISOString().slice(0,10)+'.db')"
```

**Sauvegarde par copie** — uniquement conteneur **arrêté** (sinon WAL incohérent) :

```bash
docker compose down
cp -r data data-backup-$(date +%F)
docker compose up -d
```

---

## Structure

```
shared/
  types.ts              contrat d'API partagé client <-> serveur (entités, payloads)

server/                 API Express + SQLite (TypeScript, compilé vers build/)
  index.ts              bootstrap : middlewares, montage routes, static/SPA, arrêt propre
  config.ts             lecture unique de l'env + garde-fou (refuse les valeurs d'exemple)
  paths.ts              racine du projet + dossier des assets (dev et compilé)
  auth.ts               session cookie signé (HMAC lié aux identifiants), comparaison sûre
  validation.ts         prédicats de type partagés (dates ISO, heures, couleurs, id)
  middleware/
    rateLimit.ts        throttle mémoire de /api/login
  backup.ts             journal des écritures + instantanés JSON (data/backups/)
  routes/               façades HTTP : parsent l'URL, délèguent aux services
    auth.ts             login / logout / me (public)
    projects.ts         CRUD projets
    timelines.ts        CRUD timelines
    events.ts           CRUD évènements
    helpers.ts          bad(), lecture du corps
    index.ts            compose les routers protégés
  services/             TOUTE la logique d'écriture (validation, transaction, journal)
    base.ts             type Result, touch parent (updated_at)
    projects.ts         projets
    timelines.ts        timelines
    events.ts           évènements (+ normalisation jalon/bloc)
    history.ts          journal, rollback, instantanés
  mcp/                  serveur MCP pour les agents (Claude, Codex, Gemini)
    index.ts            auth par token + montage sur /api/mcp
    tools.ts            définition des 17 outils
  db/
    index.ts            connexion SQLite + pragmas (WAL, busy_timeout)
    schema.ts           schéma initial
    migrate.ts          migrations versionnées (PRAGMA user_version)

client/src/             front React (Vite, TypeScript, CSS Modules)
  App.tsx               shell applicatif + routing par hash
  main.tsx              point d'entrée
  styles/               tokens.css (variables), reset.css, animations.css  <- seul CSS global
  api/                  client.ts (transport, ApiError) + index.ts (endpoints typés)
  lib/                  utilitaires purs : dates.ts, colors.ts, router.ts, cx.ts
  hooks/                usePolling (rafraîchissement), useEntity (404 vs erreur)
  ui/                   primitives sans logique métier, une par dossier :
                        Button, IconButton, Field, FormError, Loading, BackLink,
                        EmptyState, Page, IndexList, Modal, ColorField, Swatch,
                        SegmentedControl, Icons
  features/             une vue = un dossier (.tsx + .module.css)
    auth/               LoginScreen
    projects/           ProjectsView, ProjectForm
    timelines/          TimelinesView, TimelineForm, TimelineView
    events/             EventPopover
  timeline/             moteur de frise
    Timeline/           composant (zoom / pan / gestes, rendu des évènements)
    EventHoverCard/     carte d'infos au survol
    canvas.ts           dessin du décor (graduations, règle, marqueurs)
    layout.ts           placement des évènements (une ligne / lanes)

dist/                   front buildé (Vite)         — généré
build/                  serveur compilé (tsc)       — généré
Dockerfile              build multi-stage (front + serveur + runtime non-root, healthcheck)
docker-compose.yml
nginx.example.conf      reverse-proxy HTTPS + en-têtes de sécurité + gzip
```

**Conventions front** : chaque composant est un dossier `X/X.tsx` + `X.module.css`.
Aucune classe globale : le seul CSS partagé est `styles/` (variables, reset, keyframes).
Ce qui est réutilisé par plusieurs vues devient une primitive `ui/`, jamais une classe
copiée — et les styles communs se composent (`composes: … from …`).

## Modèle de données

- **projects** : `id, name, description`
- **timelines** : `id, project_id, name, description, start_date, end_date, granularity, color`
- **events** : `id, timeline_id, title, description, kind (point|period), start_date, start_time?, end_date?, end_time?, color?`

Un évènement devient un **bloc** (period) automatiquement dès que sa fin tombe un autre jour
que son début ; sinon c'est un **jalon** (point). Au survol, une carte affiche toutes ses infos.

Suppressions en cascade (supprimer un projet supprime ses timelines et leurs évènements).

---

## Serveur MCP (agents Claude / Codex / Gemini)

L'app expose un **endpoint MCP sur `/api/mcp`**, servi par le même process que le site.
Les agents des devs s'y branchent et peuvent lire et écrire dans les frises, avec les
**mêmes validations que l'UI** : les routes HTTP et les outils MCP appellent la même
couche `server/services/`, aucun chemin d'écriture ne la contourne.

### Activer

Un token par dev dans `.env` — c'est ce nom qui est attribué à chaque écriture :

```bash
# openssl rand -hex 32, une fois par personne
MCP_TOKENS=theo:0f3c…,alice:9b21…,bob:44de…
```

Sans `MCP_TOKENS`, l'endpoint n'est **pas monté du tout**. Le serveur refuse de démarrer en
production si un token fait moins de 32 caractères. Révoquer quelqu'un = retirer son entrée
et redémarrer ; les autres tokens restent valables.

### Brancher son agent

```bash
# Claude Code
claude mcp add --transport http vibaura-timeline https://timeline.exemple.com/api/mcp \
  -H "Authorization: Bearer $VIBAURA_TOKEN"
```

```toml
# Codex — ~/.codex/config.toml
[mcp_servers.vibaura_timeline]
url = "https://timeline.exemple.com/api/mcp"
bearer_token_env_var = "VIBAURA_TOKEN"
```

```json
// Gemini CLI — settings.json
{
  "mcpServers": {
    "vibaura-timeline": {
      "httpUrl": "https://timeline.exemple.com/api/mcp",
      "headers": { "Authorization": "Bearer $VIBAURA_TOKEN" }
    }
  }
}
```

L'endpoint sert les **deux révisions du protocole** sur la même URL : la moderne
(`2026-07-28`, sans handshake) et l'ancienne (`2025-*`, avec `initialize`). Les clients ne
sont pas tous au même point ; aucun réglage à faire de leur côté.

### Les outils

| Lecture | Écriture | Sécurité |
|---|---|---|
| `list_projects` | `create_project` / `update_project` / `delete_project` | `list_changes` |
| `list_timelines` | `create_timeline` / `update_timeline` / `delete_timeline` | `rollback` |
| `list_events` | `create_event` / `update_event` / `delete_event` | `list_backups` / `create_backup` / `restore_backup` |

### Sauvegardes et rollback

Deux mécanismes, dans `data/backups/` (donc dans le volume Docker) :

- **`journal.jsonl`** — une ligne par écriture, **UI comprise**, avec l'état des lignes
  touchées avant et après. Chaque écriture renvoie un `change_id` ; `rollback` le rejoue à
  l'envers (réinsère ce qui a été supprimé, supprime ce qui a été créé, restaure ce qui a été
  modifié). Ne touche **que** les lignes concernées. Le rollback est lui-même journalisé,
  donc réversible. Rotation à 2000 entrées, 5 fichiers gardés.
- **`snapshots/*.json`** — copies complètes de la base, prises automatiquement avant chaque
  suppression en cascade (projet, timeline) et avant chaque restauration, plus à la demande
  via `create_backup`. Les 50 plus récentes sont gardées. `restore_backup` **remplace tout** :
  à réserver aux dégâts qu'un `rollback` ne rattrape pas.

**Garde-fou anti-écrasement** : si les lignes visées ont bougé depuis (un collègue est repassé
dessus dans l'UI, un autre agent a écrit), `rollback` refuse et renvoie le détail du conflit.
`force: true` passe outre — et écrase leur travail.

### Ce que ça ne fait pas

- **Pas de throttle sur les écritures** (seul `/api/login` en a un). Un agent en boucle peut
  spammer la base ; à 3 devs derrière nginx c'est acceptable, sinon poser un `limit_req` sur
  `/api/mcp`.
- **Le token vaut un accès complet** : lecture et écriture sur tous les projets. Pas de
  périmètre par dev, pas de lecture seule.
