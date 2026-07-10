# Vibaura — Simple Timeline

Outil collaboratif léger pour visualiser des **timelines horizontales** : on crée des
**projets**, dans chaque projet des **timelines** (date de début / fin / graduation), et
sur chaque timeline on ajoute des **évènements** (jalon ou période) en un clic.

- Front : **React** (Vite), sans framework lourd.
- Back : **Express** + **SQLite** (`better-sqlite3`), un seul fichier de données.
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
server/                 API Express + SQLite
  index.js              bootstrap : middlewares, montage routes, static/SPA, arrêt propre
  config.js             lecture unique de l'env + garde-fou (refuse les valeurs d'exemple)
  auth.js               session cookie signé (HMAC lié aux identifiants), comparaison sûre
  validation.js         validateurs partagés (dates ISO, heures, couleurs, id)
  middleware/
    rateLimit.js        throttle mémoire de /api/login
  routes/
    auth.js             login / logout / me (public)
    projects.js         CRUD projets
    timelines.js        CRUD timelines
    events.js           CRUD évènements (+ normalisation jalon/bloc)
    helpers.js          bad(), touch parent (updated_at)
    index.js            compose les routers protégés
  db/
    index.js            connexion SQLite + pragmas (WAL, busy_timeout)
    schema.js           schéma initial
    migrate.js          migrations versionnées (PRAGMA user_version)

client/src/             front React (Vite)
  App.jsx               auth + routing par hash
  api.js                client HTTP (fetch, même origine)
  lib/                  utilitaires purs : dates.js, colors.js, router.js
  hooks/                usePolling (rafraîchissement), useEntity (404 vs erreur)
  components/           vues, formulaires (Project/Timeline), Login, Modal, EventPopover
  timeline/
    Timeline.jsx        composant (zoom / pan / gestes, rendu des évènements)
    canvas.js           dessin du décor (graduations, règle, marqueurs)
    layout.js           placement des évènements (une ligne / lanes)

Dockerfile              build multi-stage (front + runtime, user non-root, healthcheck)
docker-compose.yml
nginx.example.conf      reverse-proxy HTTPS + en-têtes de sécurité + gzip
```

## Modèle de données

- **projects** : `id, name, description`
- **timelines** : `id, project_id, name, description, start_date, end_date, granularity, color`
- **events** : `id, timeline_id, title, description, kind (point|period), start_date, start_time?, end_date?, end_time?, color?`

Un évènement devient un **bloc** (period) automatiquement dès que sa fin tombe un autre jour
que son début ; sinon c'est un **jalon** (point). Au survol, une carte affiche toutes ses infos.

Suppressions en cascade (supprimer un projet supprime ses timelines et leurs évènements).
