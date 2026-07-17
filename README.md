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
  routes/
    auth.ts             login / logout / me (public)
    projects.ts         CRUD projets
    timelines.ts        CRUD timelines
    events.ts           CRUD évènements (+ normalisation jalon/bloc)
    helpers.ts          bad(), lecture du corps, touch parent (updated_at)
    index.ts            compose les routers protégés
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
