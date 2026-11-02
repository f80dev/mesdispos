# MesDispos

Déclarez vos disponibilités, créneau par créneau, en deux clics. Application
Angular 22 (standalone, zoneless, Material 3) adossée à Firebase Auth +
Firestore. Aucun serveur applicatif, aucun Cloud Function. **Google est réservé
à l'espace administrateur** : les professeurs n'ont pas de compte tiers.

- **Session « nom seul »** (par défaut) : choisissez votre nom dans la liste des
  professeurs (API Oasis), cliquez sur un créneau, c'est enregistré. Aucun
  compte tiers, cookie fonctionnel 1 an.
- **Espace administrateur** : une session Firebase **Google** ; l'`uid` obtenu
  doit être inscrit dans la collection `admins` pour ouvrir `/admin/import`.

Le cahier des charges complet du projet est dans [`AGENTS.md`](./AGENTS.md) ; le
journal des décisions techniques est dans [`docs/decisions.md`](./docs/decisions.md).

## Sommaire

- [Installation](#installation)
- [Configuration Firebase (à faire une fois)](#configuration-firebase-à-faire-une-fois)
- [Créer le premier administrateur](#créer-le-premier-administrateur)
- [Liste des professeurs (API Oasis)](#liste-des-professeurs-api-oasis)
- [Format du fichier Excel](#format-du-fichier-excel)
- [Commandes](#commandes)
- [Déploiement](#déploiement)
- [Émulateurs locaux](#émulateurs-locaux)
- [Structure du dépôt](#structure-du-dépôt)
- [Données personnelles (RGPD)](#données-personnelles-rgpd)
- [Preuves d'acceptation](#preuves-dacceptation)
- [Ce qui reste à faire](#ce-qui-reste-à-faire)

## Installation

Prérequis : **Node 22** et npm 10 (le projet est épinglé sur `packageManager:
npm@10.9.8`).

```bash
npm ci          # installe exactement ce que décrit package-lock.json
ng serve        # http://localhost:4200
```

L'application démarre **sans configuration Firebase** : le mode A fonctionne
immédiatement (aucune donnée n'est encore lue/écrite côté serveur, l'écran
d'/dispos affiche alors « Configuration Firebase non renseignée… »). Pour lire et
enregistrer des créneaux, renseignez la configuration ci-dessous.

## Configuration Firebase (à faire une fois)

### 1. Créer le projet

Console Firebase → Ajouter un projet → activer **Cloud Firestore** et
**Authentication** (méthode de connexion **Google** ; elle ne sert qu'à
l'espace administrateur — les professeurs n'utilisent pas Google).

### 2. Renseigner la configuration web

Ouvrez `src/environments/firebase.config.ts` et remplacez les valeurs
`REPLACE_ME_*` par celles de **Paramètres du projet → Vos applications → Config**
(la configuration Firebase Web `firebaseConfig`) :

```ts
export const FIREBASE_CONFIG = {
  apiKey: '…',
  authDomain: 'votre-projet.firebaseapp.com',
  projectId: 'votre-projet',
  storageBucket: 'votre-projet.appspot.com',
  messagingSenderId: '…',
  appId: '…',
};
```

Ces identifiants sont **publics par conception** (ils identifient le projet, ils
ne donnent aucun droit d'écriture : ce sont les `firestore.rules` qui protègent
les données) et peuvent donc être versionnés. Ne committez jamais de compte de
service, de clé privée ni de `.env`.

`firebaseConfigure()` (dans le même fichier) retourne `false` tant que les
valeurs ne sont pas remplacées : l'application affiche alors un message explicite
plutôt que d'échouer silencieusement, et **aucun octet de SDK Firebase n'est
téléchargé** pour le parcours « Nom seul ».

### 3. Renseigner l'identifiant de projet pour le CLI

```bash
cp .firebaserc.example .firebaserc   # ou : npx firebase use --add
```

## Créer le premier administrateur

Aucune graine n'est fournie. L'admin se connecte avec un **compte Google**.

1. Console Firebase → Authentication → Sign-in method → activer **Google**
   (ajouter le domaine de l'application aux domaines autorisés) ;
2. dans l'application, ouvrir `/admin/import` (ou `/login?retour=/admin/import`)
   et utiliser l'encart « Espace administrateur » → « Connexion avec Google » ;
3. si le compte n'est pas encore admin, la page affiche l'`uid`
   (« Identifiant de session ») ; depuis la **console Firebase**, créer la
   collection **`admins`** avec un document dont l'**ID est cet `uid`**
   (un champ `email` est facultatif) ;
4. recharger `/admin/import` : l'accès est alors ouvert.

Les règles interdisent toute écriture sur `admins` depuis l'application
(`allow write: if false`) : seul l'accès console / Admin SDK permet de nommer un
admin. Le lien « Importer des créneaux » n'apparaît alors que pour cette
session, et `/admin/import` refuse toute autre session.

> ⚠️ L'`uid` affiché est celui du **compte Google** ; il reste stable quel que
> soit le navigateur. Le compte doit être autorisé par un document `admins/{uid}`.

## Liste des professeurs (API Oasis)

La page `/login` propose les enseignants dans une **liste déroulante**, alimentée
par l'API REST Oasis :

- route : `GET /api/v1/profs` (opération `Ldap\ProfCtrl::selectProfs`) ;
- documentation : <https://test.ensad.oasispro.fr/testapi/v1/doc#/Professeurs/Oasis%5CEnsad%5COverride%5CApi%5CREST%5CData%5CController%5CLdap%5CProfCtrl%3A%3AselectProfs> ;
- appelée via le proxy `https://proxyensad.af10.fr`, défini au build dans
  `angular.json` (`define.proxy`) ; le couple d'authentification est injecté
  par le proxy, **rien** ne transite par le navigateur ;
- la réponse (`{ "elements": [...] }`) est normalisée par
  `normaliserProfs()` (`src/app/data/prof.service.ts`) : doublons supprimés
  (l'API renvoie chaque enseignant plusieurs fois), sortants (`present` ≠
  `ACT`) écartés, tri par nom complet.

Le nom affiché (`« Prénom NOM »`) est conservé dans le cookie
`mesdispos_nom` et sert à dériver l'identifiant Firestore anonyme. Si l'API est
indisponible, un message « Liste des professeurs indisponible. Réessayer » est
affiché et l'option **« Autre nom (saisie libre) »** permet de continuer sans
passer par l'annuaire.

> L'année interrogée est paramétrée dans `CoursServices.getProfs()` (`year=2026`).
> Un enseignant recruté après cette année ne figure pas dans la liste : il
> utilise alors la saisie libre.

> ⚠️ **CORS — action requise de l'humain.** Le proxy `proxyensad.af10.fr`
> n'autorise aujourd'hui que les origines `https://planning.ensad.fr` et
> `http://localhost:4200`. Il faut **ajouter l'origine de déploiement de
> MesDispos** (`https://mesdispos-db623.web.app`, `https://mesdispos-db623.firebaseapp.com`,
> et le domaine personnalisé éventuel) à la liste d'origines autorisées du
> proxy, sinon le navigateur bloque la requête et la liste des professeurs
> reste vide (l'écran affiche « Liste des professeurs indisponible. Réessayer »,
> et la saisie libre reste possible).

## Format du fichier Excel

Un unique fichier **`.xlsx`** (le `.xls` est refusé avec un message explicite),
première feuille, première ligne = en-têtes **insensibles à la casse et aux
accents** (`Date`, `Heure de début`, `HEURE_DEBUT`… sont tous acceptés).

| Colonne (en-tête)          | Obligatoire | Cellule Excel | Chaîne acceptée              | Exemple       |
| -------------------------- | ----------- | ------------- | ---------------------------- | ------------- |
| `date`                     | oui         | date Excel    | `AAAA-MM-JJ`, `JJ/MM/AAAA`   | `12/01/2026`  |
| `heure_debut` (ou `debut`) | oui         | heure Excel   | `HH:mm`, `HH:mm:ss`, `HHhmm` | `08:45`       |
| `heure_fin` (ou `fin`)     | oui         | heure Excel   | `HH:mm`, `HH:mm:ss`, `HHhmm` | `09:30`       |
| `libelle`                  | non         | texte         | —                            | `Audition A1` |

Contraintes de validation (ligne à ligne) :

- `heure_fin` doit être **strictement postérieure** à `heure_debut` ;
- pas de doublon dans le fichier (même date + début + fin) ;
- pas de doublon déjà présent en base (`creneaux/{id}`, `id = date_HHMM_HHMM`) ;
- les lignes invalides n'empêchent **pas** l'import : elles sont listées avec
  leur n° de ligne et un message français, dans un encart dépliable.

Exemple de feuille :

| Date       | Heure de début | Heure fin | Libellé     |
| ---------- | -------------- | --------- | ----------- |
| 12/01/2026 | 08:45          | 09:30     | Audition A1 |
| 12/01/2026 | 14:00          | 15:00     |             |

Après « Importer N créneaux », chaque créneau est écrit en `setDoc` sur
`creneaux/{date}_{HHMM}_{HHMM}` par lots de 500 opérations. Les créneaux
disparaissant de `creneaux` laissent leurs disponibilités orphelines, qui restent
affichées dans « Mes disponibilités » (les champs y sont dénormalisés).

## Commandes

```bash
npm ci                             # installation propre
npm start                           # ng serve → http://localhost:4200
npm run build                       # build de développement
npx ng build --configuration=production   # build de production (obligatoire avant commit)

npm test                            # unitaires — Vitest via `ng test` (humain)
npm run test:watch                  # idem en surveillance
npm run test:e2e:install            # installe les navigateurs Playwright (une fois)
npm run test:e2e                    # end-to-end Playwright (humain)

npm run format                      # Prettier (printWidth 100, singleQuote)
npm run format:check                # vérification de formatage (CI)
```

> **Contrat de vérification** : l'agent qui a produit ce dépôt **écrit** les
> tests mais ne les **exécute** jamais ; il exécute en revanche
> `ng build --configuration=production` avant chaque commit. Lancer `npm test` et
> `npm run test:e2e` relève de l'humain ou de la CI.

## Déploiement

```bash
npx firebase login
npx firebase use --add                       # ou renseigner .firebaserc
npx ng build --configuration=production
npx firebase deploy --only firestore:rules,firestore:indexes,hosting
```

- `firebase.json` publie `dist/mesdispos/browser` avec la réécriture SPA
  `** → /index.html`, sans cache sur `index.html` et `immutable` sur les bundles ;
- `firestore.rules` autorise la lecture des créneaux (y compris anonymes),
  réserve l'écriture des créneaux aux admins et n'ouvre chaque partition
  `users/{uid}/dispos` qu'à son titulaire (`uid` de session Firebase **ou**
  `uid` anonyme bien formé) ;
- `firestore.indexes.json` ne déclare aucun index composite (toutes les lectures
  sont mono-collection).

CI (`.github/workflows/ci.yml`) : `npm ci` → `npm run format:check` →
`ng build --configuration=production` → upload de `dist/`. Les tests y sont
volontairement commentés (`# TODO humain : npm test`).

## Émulateurs locaux

```bash
npx firebase emulators:start            # auth:9099, firestore:8080, hosting:5000, ui:4000
```

Pour brancher l'application sur l'émulateur, voir `core/firebase.ts` : il suffit
d'ajouter `connectFirestoreEmulator(db, '127.0.0.1', 8080)` avant le premier
écouteur lorsque `firebaseConfigure()` est vrai.

## Structure du dépôt

```
src/app/
├── core/         firebase.ts (SDK modulaire chargé à la demande), auth.service.ts,
│                 cookie.service.ts, auth.guard.ts, admin.guard.ts, notif.service.ts,
│                 firestore.backend.ts (contrat + implémentation Firestore),
│                 xlsx.backend.ts (contrat + implémentation read-excel-file)
├── data/         models.ts, creneau.service.ts, dispo.service.ts, excel-import.service.ts
├── features/     login/, dispos/, admin/
├── layout/       header.component.*, date-group.pipe.ts
└── shared/       date.util.ts (purs, testés), sha256.util.ts
```

Points d'attention :

- **aucun `Date`/`Timestamp` stocké** : les créneaux sont des chaînes
  `'YYYY-MM-DD'` et `'HH:mm'`, ce qui supprime tout piège de fuseau ;
- **aucun `localStorage`/`sessionStorage`** (le seul cookie est
  `mesdispos_nom`, strictement nécessaire) ;
- **le SDK Firebase n'est jamais chargé pour le mode A** : `core/firebase.ts`
  l'importe dynamiquement, ce qui maintient le bundle initial sous le budget ;
- **les accès Firestore passent par `FIRESTORE_BACKEND`** : un contrat
  injectable (`core/firestore.backend.ts`) permet aux tests unitaires de
  fournir un faux backend — le builder `@angular/build:unit-test` désactive
  `vi.mock` pour les imports relatifs.

## Données personnelles (RGPD)

Données collectées : **nom (ou pseudonyme)** et les créneaux choisis. Rien
d'autre : ni e-mail, ni photo, ni analytics, ni tracking, ni cookie tiers, ni
bandeau de consentement (le cookie `mesdispos_nom` est strictement nécessaire à
la fourniture du service demandé, exempté). La session d'administration utilise
Firebase Auth **Google** (e-mail et nom du compte admin, jamais ceux des
professeurs, qui n'ont pas de session Firebase).

Le cookie `mesdispos_nom` contient le prénom saisi, en clair, avec
`SameSite=Lax`, `Secure` en HTTPS, `Path=/` et `Max-Age` 1 an. Il est effacé
immédiatement par « Se déconnecter » (header) ou « Utiliser un autre nom »
(login). Le prénom n'est **pas** recopié dans Firestore : seule son empreinte
SHA-256 tronquée sert de partition (`users/anon_…/dispos`).

**Données : nom et disponibilités, supprimables sur demande.**
Suppression : effacer le cookie côté navigateur, et supprimer les documents
`users/{uid}/dispos/{creneauId}` concernés dans la console Firebase.

## Preuves d'acceptation

Relevé des 19 critères du §9 d'`AGENTS.md`. Les commandes sont reproductibles
depuis la racine du dépôt.

| AC    | Objet                                               | Statut | Preuve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | --------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-1  | `npm ci` sort 0                                     | ✅     | `npm ci` → `6 vulnerabilities (1 low, 5 high)` … `NPM_CI_EXIT=0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC-2  | Build production sans erreur                        | ✅     | `ng build --configuration=production` → `Application bundle generation complete.`, exit `0`, initial **437,01 kB** (< budget 500 kB)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| AC-3  | `npx tsc --noEmit` sort 0                           | ⏸️     | **Non exécuté par l'agent** (contrat §3/§13). Le build de production type-check déjà toute l'application (`tsconfig.app.json`) ; à confirmer par l'humain.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| AC-4  | 3 routes + guards                                   | ✅     | `grep -n "path:" src/app/app.routes.ts` → `20: path: 'login'`, `24: path: 'dispos'` (guard `authGuard`), `31: path: 'admin/import'` (guard `adminGuard`), `35/36` redirections ; `ROUTES = { login: '/login', dispos: '/dispos', admin: '/admin/import' }`                                                                                                                                                                                                                                                                                                                                                   |
| AC-5  | Aucun `NgModule`, aucun `constructor(private …)`    | ✅     | `grep -rn "NgModule\|declarations" src/` → vide ; `grep -rn "constructor(private\|constructor(public" src/` → vide                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| AC-6  | Pas de `Date`/`Timestamp` dans `Creneau`/`Dispo`    | ✅     | `grep -n "Date\|Timestamp" src/app/data/models.ts` → 8 lignes, **toutes** des commentaires ou le nom du champ `date` (`date: string`) : les interfaces ne déclarent que des chaînes (`'YYYY-MM-DD'`, `'HH:mm'`) et `updatedAt: number`                                                                                                                                                                                                                                                                                                                                                                       |
| AC-7  | Un clic = une écriture, pas de bouton de sauvegarde | ✅     | `grep -rn "Enregistrer\|mat-dialog.*confirm" src/app/features/dispos/` → **vide** ; écriture immédiate : `grep -n "setDispo\|deleteDispo" src/app/data/dispo.service.ts` → `184: setDispo`, `186: deleteDispo` (contrat injectable) ; implémentation SDK : `grep -n "setDoc\|deleteDoc" src/app/core/firestore.backend.ts` → `121: setDoc`, `126: deleteDoc`                                                                                                                                                                                                                                                 |
| AC-8  | Rollback + snackbar « Réessayer »                   | ✅     | `grep -c "catch\|rollback\|Réessayer" src/app/data/dispo.service.ts` → **7** (≥ 3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| AC-9  | 3 breakpoints documentés dans les templates         | ✅     | `grep -rc "Mobile:\|Desktop:" src/app/features/` → 11 occurrences dans 6 fichiers (≥ 4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AC-10 | `firestore.rules` conforme et déployable            | 🟡     | Fichier livré et vérifié structurellement (accords équilibrés, `rules_version = '2'`, fonctions `connecte`/`admin`/`uidAnonymeValide`, catch-all `allow read, write: if false`, branche anonyme `uid.matches('^anon_[0-9a-f]{12}$')`). Le **CLI Firebase n'est pas installé** ici (`which firebase` → absent) : `firebase deploy --only firestore:rules --dry-run` reste à lancer par l'humain. Voir l'ADR « Vérification des règles sans Firebase CLI ».                                                                                                                                                    |
| AC-11 | Fichiers de tests de §10 présents                   | ✅     | `find src e2e -name "*.spec.ts"` → 8 fichiers ; `grep -c "it("` → 27 (date.util), 10 (cookie.service), 9 (dispo.service), 15 (excel-import), 7 (auth.guard), 11 (dispos-page), 3 (app.component), + 4 `test(` (e2e)                                                                                                                                                                                                                                                                                                                                                                                          |
| AC-12 | `.xlsx` accepté, autres formats refusés             | ✅     | `excel-import.service.ts:10` `EXTENSION_ACCEPTEE = '.xlsx'`, `:13` `'Format non pris en charge : utilisez un fichier Excel .xlsx'` ; vérifié sur un fichier réel : un `.xls` déclenche ce message                                                                                                                                                                                                                                                                                                                                                                                                            |
| AC-13 | ADR par décision non triviale                       | ✅     | `grep -c "^## " docs/decisions.md` → **26** entrées (≥ 3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| AC-14 | README : config, format Excel, déploiement          | ✅     | Sections « Configuration Firebase », « Format du fichier Excel », « Déploiement » (voir la table des matières)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| AC-15 | Tests **non** exécutés, build **exécuté**           | ✅     | Commandes réellement lancées : `npm ci`, `npx ng build --configuration=production` (11 fois, exit 0), `npm i -D @playwright/test @types/node`, `npx prettier --write`, `esbuild` (parsing des specs et sondes), `python3` (génération d'un `.xlsx` de test), Chrome headless + CDP (vérification responsive). **Jamais** lancés : `npm test`, `npx playwright test`, `npx tsc --noEmit`                                                                                                                                                                                                                      |
| AC-16 | Mode « Nom seul » (cookie fonctionnel)              | ✅     | (a) carte centrée avec champ « Prénom » outlined + « Continuer » `48×327 px` **désactivé** quand le champ est vide ; (b) `Network.getAllCookies` → `{"name":"mesdispos_nom","value":"Pauline","httpOnly":false,"sameSite":"Lax","path":"/","expires":…+1 an}` ; (c) `location.reload()` sur `/dispos` → reste sur `/dispos`, en-tête « Pauline » ; (d) « Se déconnecter » → `document.cookie` vide et retour `/login`. `grep -c "mesdispos_nom\|setNom\|lireNom\|effacer" src/app/core/cookie.service.ts` → 6 (≥ 5)                                                                                          |
| AC-17 | Material 3, dernière spec                           | ✅     | `grep -c "mat.theme\|--mat-sys-" src/styles.scss` → **52** (≥ 10) : palette `primary`/`secondary`/`tertiary` + `on-*`, surfaces `surface` → `surface-container-highest`, `outline*`, `error*`, `level0..level5`, type-scale `display` → `label`, `corner*`, durées de motion, `prefers-color-scheme` (thème clair/sombre), densité `-1` compacte ; build exit 0, aucun avertissement de budget. Captures d'écran : à joindre par l'humain (cf. « Ce qui reste à faire »)                                                                                                                                     |
| AC-18 | Non-régression du mode « nom seul »                 | ✅     | `grep -n "connecterParNom\|connecterGoogle\|signOut\|uidEcriture" src/app/core/auth.service.ts` → sessions disjointes : « nom seul » = `users/anon_…/dispos` (`utilisateurAnonyme()` → `uid = 'anon_' + sha256(nom).slice(0,12)`), administrateur = `users/{uidFirebase}/dispos` ; les règles n'accordant l'accès qu'à la partition correspondante (`firestore.rules`, `match /users/{uid}/dispos`)                                                                                                                                                                                                          |
| AC-19 | Rendu smartphone validé                             | ✅     | Mesures relevées dans Chrome 151 sur le build de production : à **375 px**, `document.documentElement.scrollWidth = 375` (aucun débordement), sections empilées en une colonne, header compact (nom masqué, avatar « P »), bouton déconnexion `48×48`, bouton « Continuer » `48 px`, input `font-size: 16 px` (pas de zoom iOS), focus automatique sur le champ « Prénom » ; à **768 px** une colonne `padding 24px` ; à **1280 px** deux colonnes `486px + 486px`, `padding 48px`, largeur max `1100px`. **Playwright n'est pas exécuté** (contrat §3/§13) : `npm run test:e2e` reste à lancer par l'humain |

## Ce qui reste à faire

1. **Remplir `src/environments/firebase.config.ts`** (`REPLACE_ME_*`).
2. **Renseigner `.firebaserc`** (`cp .firebaserc.example .firebaserc`, puis
   `npx firebase use --add`).
3. **Activer « Google »** dans Authentication → Sign-in method.
4. **Créer le premier document `admins/{uid}`** depuis la console (l'`uid` du
   compte Google s'affiche sur la page `/login?retour=/admin/import`).
5. **Installer le CLI Firebase** (`npm i -g firebase-tools`) puis
   `npx firebase deploy --only firestore:rules,firestore:indexes,hosting`, et
   vérifier les règles en lecture/écriture réelle.
6. **Exécuter les tests** : `npm test`, puis `npm run test:e2e:install &&
npm run test:e2e`. Ils sont écrits, jamais exécutés par l'agent ; une erreur
   de typage ou un mock incomplet ne peut apparaître qu'ici.
7. **Joindre les captures d'écran** demandées par AC-17 (1280 px) et AC-19
   (375 px, `/login` et `/dispos`), et vérifier le parcours avec de vrais
   créneaux en base (les listes ne sont lisibles qu'avec un projet Firebase
   configuré).
8. **Point de sécurité à trancher** : l'`uid` anonyme étant le SHA-256 tronqué
   du prénom, il est recalculable par quiconque connaît le pseudonyme (voir
   l'ADR « Règles Firestore : adaptation au mode A sans session »). Si la
   confidentialité des disponibilités anonymes devient sensible, remplacer le
   hash par un identifiant aléatoire stocké dans le même cookie.
9. **`ng lint`** n'est pas câblé (ni ESLint ni builder `lint` dans Angular 22) :
   la CI contrôle le formatage Prettier et le build. `ng add @angular-eslint/schematics`
   permettrait de le rétablir.
