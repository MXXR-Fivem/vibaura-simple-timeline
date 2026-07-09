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

Toutes les données tiennent dans le dossier `data/`. Pour sauvegarder, copie-le
(conteneur idéalement arrêté ou via `sqlite3 .backup`) :

```bash
cp -r data data-backup-$(date +%F)
```

---

## Structure

```
server/           API Express + SQLite
  index.js        serveur, auth publique, static + fallback SPA
  api.js          endpoints projets / timelines / évènements
  db.js           connexion SQLite + schéma
  auth.js         login partagé, cookie de session signé (HMAC)
client/           front React (Vite)
  src/
    App.jsx       auth + routing par hash
    components/   vues + composant Timeline (zoom / pan / lanes)
    dates.js      maths de dates + graduations adaptatives
Dockerfile        build multi-stage (front + runtime)
docker-compose.yml
```

## Modèle de données

- **projects** : `id, name, description`
- **timelines** : `id, project_id, name, description, start_date, end_date, granularity, color`
- **events** : `id, timeline_id, title, description, kind (point|period), start_date, start_time?, end_date?, end_time?, color?`

Un évènement devient un **bloc** (period) automatiquement dès que sa fin tombe un autre jour
que son début ; sinon c'est un **jalon** (point). Au survol, une carte affiche toutes ses infos.

Suppressions en cascade (supprimer un projet supprime ses timelines et leurs évènements).
