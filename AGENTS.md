# MesDispos — Cahier des charges exécutable (AGENTS.md)

> Destinataire : agent IA de codage autonome (opencode / Claude Code / Codex / Hermes).
> Usage : copier ce fichier à la racine du repo sous le nom `AGENTS.md`.
> Langue du code et des UI : français. Langue de ce document : français.
> Contrat : tu livres une application **fonctionnelle, buildée et commitée**, sans poser de question. Toute décision absente de ce document, tu la prends par défaut et tu la journalises dans `docs/decisions.md` (format §14).

---

## 0. Mission

Construire **MesDispos**, une application web Angular permettant à des professeurs de déclarer leurs disponibilités sur un ensemble de créneaux horaires (date, heure de début, heure de fin) préalablement défini par un administrateur via l'import d'un fichier Excel. Le professeur s'authentifie avec son compte Google, voit les créneaux disponibles et ceux déjà retenus, coche/décoche autant de créneaux qu'il le souhaite, et chaque clic est **immédiatement persisté** dans Firestore. Il n'y a pas de bouton « enregistrer ».

Métrique de succès : un professeur, depuis un téléphone, arrive sur l'URL, se connecte en Google en moins de 3 clics, sélectionne un créneau, et ce créneau est présent dans Firestore moins d'une seconde après le clic — vérifiable dans la console Firebase.

Une variante **sans authentification** est également supportée (cf. F2 mode A) : un professeur peut déclarer ses disponibilités sans compte tiers, en saisissant simplement un prénom ou un pseudonyme. Ce prénom est conservé dans un **cookie fonctionnel** propre à MesDispos ; ce mode cohabite avec la connexion Google pour les admins et les utilisateurs identifiés. Mesure de succès revisitée : un professeur, depuis un téléphone, arrive sur l'URL, saisit son prénom en 1 champ et clique « Continuer » (≤ 3 interactions), et ce premier créneau est présent dans Firestore moins d'une seconde après le clic.
## 1. Livrables

- Repo Git `mesdispos/` : application Angular 22 complète, standalone, buildable en production.
- `firestore.rules` + `firestore.indexes.json` déployables tels quels.
- `docs/decisions.md` (journal ADR) et `README.md` (démarrage, déploiement, format Excel).
- Fichiers de tests unitaires `.spec.ts` (écrits, **non exécutés** — voir §3 Contrat de vérification).
- Aucun backend applicatif : Firebase Auth + Firestore uniquement, pas de Cloud Functions.

## 2. Structure du repo (imposée)

```
mesdispos/
├── AGENTS.md                    # ce document
├── README.md
├── docs/
│   └── decisions.md             # journal ADR (format §14)
├── firestore.rules
├── firestore.indexes.json
├── firebase.json                # hosting + rules + emulators
├── .firebaserc.example          # projet Firebase à renseigner par l'humain
├── package.json
├── src/
│   ├── index.html               # <html lang="fr">, viewport, titre « MesDispos »
│   ├── styles.scss              # tokens Material 3 + thème clair/sombre
│   ├── environments/
│   │   └── firebase.config.ts   # config Firebase web (valeurs fournies par l'humain, §14)
│   └── app/
│       ├── app.config.ts        # provideRouter, provideAnimationsAsync
│       ├── app.routes.ts        # routes + guards
│       ├── app.component.ts     # shell : <router-outlet> + header
│       ├── core/
│       │   ├── firebase.ts              # initializeApp, getAuth, getFirestore (SDK modulaire)
│       │   ├── auth.service.ts          # user signal, signIn/signOut Google
│       │   ├── auth.guard.ts            # canActivate → /login
│       │   ├── admin.guard.ts           # canActivate → / (vérifie admins/{uid})
│       │   └── notif.service.ts         # snackbar (succès/erreur/réessayer)
│       ├── data/
│       │   ├── models.ts                # Creneau, Dispo, LigneImport (§5)
│       │   ├── creneau.service.ts       # lecture temps réel des créneaux
│       │   ├── dispo.service.ts         # sélection immédiate, optimiste, rollback
│       │   └── excel-import.service.ts  # parse + validation + upsert batch
│       ├── features/
│       │   ├── login/login.component.*
│       │   ├── dispos/dispos-page.component.*      # F3/F4 : les deux listes
│       │   ├── dispos/creneau-card.component.*     # une ligne de créneau + toggle
│       │   └── admin/import.component.*            # F6 : import Excel
│       ├── layout/
│       │   ├── header.component.*      # logo « MesDispos », utilisateur, déconnexion
│       │   └── date-group.pipe.ts      # YYYY-MM-DD → « lundi 12 janvier 2026 »
│       └── shared/
│           └── date.util.ts            # normalizeDate(), normalizeHeure(), tri (purs, testés)
└── e2e/
    └── mesdispos.spec.ts        # Playwright, viewports 375/768/1280 (écrit, non exécuté)
```

## 3. Conventions

- **Commits** : Conventional Commits, un commit par étape du plan §8. Message exact donné dans le plan.
- **Branches** : `main` directement (projet solo). Pas de PR obligatoire.
- **Code** : TypeScript strict (`strict: true`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`), standalone components uniquement, signals (`signal`, `computed`, `effect`), nouveau template control flow (`@if`, `@for`, `@empty`), `inject()` — jamais de `constructor` injection ni de NgModules, jamais de `NgModule`, jamais de `any` non justifié par une entrée ADR.
- **Style** : SCSS, design tokens CSS custom properties dans `styles.scss`, thème **Material 3** via `mat.theme()` appliqué sur la **dernière spécification Material Design 3** (tokens `--mat-sys-*`, palette M3 `primary`/`secondary`/`tertiary` + rôles `on-*` + `surface` + `surfaceContainer*` + `outline` + `error`, type-scale M3 `display`/`headline`/`title`/`body`/`label` × `large`/`medium`/`small`, courbes et durées de motion M3, états `hover`/`focus`/`pressed`/`disable` conformes). Thème clair par défaut, bascule `prefers-color-scheme` automatique. Composants Angular Material + CDK en version alignée sur cette spec M3 (pas d'autre librairie UI). **Interfaces épurées au sens MD3** : densité compacte par défaut, surfaces à 1 niveau d'élévation, espacement piloté par les tokens d'espacement MD3 (4 / 8 / 12 / 16 / 24 / 32 px), pas de chrome décoratif (pas de bordures décoratives, pas d'ombres superflues, pas de dégradés). Couleurs sémantiques d'état (succès / erreur / avertissement) via les rôles M3 `error` / `tertiary` uniquement, jamais de couleurs hors palette.
- **Formatage** : Prettier (printWidth 100, singleQuote) ; `ng lint` propre avant chaque commit.
- **Contrat de vérification (décision utilisateur, non négociable)** : l'agent **écrit les tests mais ne les exécute pas** (`npm test` est laissé à l'humain/CI). En revanche, avant **chaque** commit, l'agent exécute `ng build --configuration=production` et le commit n'a lieu que si l'exit code vaut 0. La preuve de build (5 dernières lignes de sortie) est recopiée dans la description du commit quand elle contient un avertissement.

## 4. Stack (imposée, versions)

| Rôle | Choix | Version | Note |
|---|---|---|---|
| Framework | Angular | ^22 | CLI `ng new`, zoneless par défaut si proposé par le CLI, standalone |
| UI | Angular Material + CDK | ^22 | M3 (dernière spec), `mat.theme()`, tokens `--mat-sys-*`, interfaces épurées au sens MD3 (densité compacte, espacement 4/8/12/16/24/32) |
| Backend | Firebase JS SDK **modulaire** | ^12 | `firebase/auth`, `firebase/firestore` |
| Auth | Firebase Auth — provider Google | — | popup desktop, redirect mobile |
| Base | Cloud Firestore | — | temps réel via `onSnapshot` |
| Import Excel | `read-excel-file` | ^5.6 | `.xlsx` uniquement, côté navigateur |
| Tests unitaires | Vitest (builder `ng test`) | — | écrits, non exécutés |
| E2E | Playwright | ^1.5x | écrits, non exécutés ; viewports 375/768/1280 |
| Hosting | Firebase Hosting | — | SPA rewrite `** → /index.html` |

**Décision — pas de `@angular/fire`** : sa compatibilité traîne derrière les majors Angular ; le SDK modulaire enveloppé dans `core/firebase.ts` + services Angular est imposé. ADR obligatoire si tu dévies.

## 5. Modèle de données (TypeScript, à implémenter verbatim)

```ts
// src/app/data/models.ts

/** Un créneau proposé. Les heures sont des chaînes — JAMAIS de Date/Timestamp (voir Do NOT). */
export interface Creneau {
  id: string;            // déterministe : `${date}_${hhmm}_${hhmm}` ex. `2026-01-12_0845_0930`
  date: string;          // 'YYYY-MM-DD'
  heureDebut: string;    // 'HH:mm' (24h)
  heureFin: string;      // 'HH:mm' (24h), strictement > heureDebut
  libelle?: string;      // optionnel, ex. "Audition A1"
}

/** Le choix d'un professeur. Sous-collection users/{uid}/dispos/{creneauId}. */
export interface Dispo {
  creneauId: string;
  date: string;          // dénormalisé pour l'affichage sans jointure
  heureDebut: string;
  heureFin: string;
  libelle?: string;
  updatedAt: number;     // Date.now() — horodatage d'affichage uniquement
}

/** Une ligne lue dans le fichier Excel avant validation. */
export interface LigneImport {
  ligne: number;         // n° de ligne dans le fichier (pour les messages d'erreur)
  date: string;          // normalisée 'YYYY-MM-DD'
  heureDebut: string;    // normalisée 'HH:mm'
  heureFin: string;
  libelle?: string;
  erreur?: string;       // message français si la ligne est invalide
}

export interface ResultatImport {
  valides: LigneImport[];
  invalides: LigneImport[];
}
```

**Identité anonyme (mode A, cf. F2)** — la valeur vit uniquement dans le cookie `mesdispos_nom` (côté navigateur). Pas de miroir Firestore du prénom. Un identifiant technique déterministe pour l'écriture est dérivé côté client : `uid = 'anon_' + sha256(nom normalisé).slice(0, 12)` ; utilisé pour la sous-collection `users/{anonId}/dispos` quand l'utilisateur est en mode A. Le prénom reste la valeur d'affichage (`displayName`) ; l'`uid` anonyme n'est jamais rendu à l'utilisateur.

Collections Firestore :

| Chemin | Contenu | Écriture | Lecture |
|---|---|---|---|
| `creneaux/{id}` | `Creneau` | admin seulement | tout utilisateur connecté |
| `users/{uid}/dispos/{creneauId}` | `Dispo` | l'utilisateur lui-même | l'utilisateur lui-même |
| `admins/{uid}` | `{ email: string }` | console Firebase uniquement | le concerné |

Règle de cohérence : `users/{uid}/dispos/{creneauId}` n'existe que si `creneaux/{creneauId}` existe ; un créneau supprimé par un admin laisse des orphelins tolérés en v1 (affichés dans « Mes créneaux » via la jointure mémoire avec `creneaux`).

## 6. Spécification fonctionnelle

**F1 — Accès à l'application**
- URL unique (Firebase Hosting). Route `/` redirige vers `/dispos` si connecté, `/login` sinon. Router avec `authGuard` sur `/dispos` et `/admin/import`.
- Toute route non connue redirige vers `/`.

**F2 — Authentification : deux modes simultanés au choix**

*Mode A — Nom seul (cookie fonctionnel, défaut v1)*

- Page `/login` : logo + titre « MesDispos », sous-titre « Pour déclarer vos disponibilités, saisissez votre prénom (ou un pseudonyme) ». Une carte centrée contient un seul `mat-form-field` d'apparence outlined (« Prénom », placeholder « Pauline », `autocomplete='off'`, `required`, `maxlength=50`) et un `mat-stretched-button` « Continuer » en dessous. Le bouton est désactivé tant que la valeur, après `trim`, est vide.
- À la soumission : `normalizeNom` (`trim` + collapse des espaces + contrôle `1 ≤ len ≤ 50`, message français si invalide) ; pose du cookie `mesdispos_nom` via `CookieService.setNom` (`HttpOnly=false`, `SameSite=Lax`, `Secure` si `location.protocol === 'https:'`, `Max-Age ≈ 1 an`) ; `AuthService.user` exposé en mode anonyme `{ uid: 'anon_<sha256-courte>', displayName: nom, anon: true }` ; redirection vers la route demandée initialement, ou `/dispos`.
- Sous le bouton, un lien léger « Utiliser un autre nom » efface le cookie (`CookieService.effacer()`) puis remet le focus dans le champ. Le champ est pré-rempli avec la valeur courante du cookie à chaque visite tant que l'utilisateur est en mode A.
- **Aucun appel Firebase Auth ; aucune dépendance réseau ; ce mode est la valeur par défaut du formulaire.**
- **Mode A est conçu pour le smartphone** : aucun popup tiers, aucun redirect, aucun appel réseau ; le champ « Prénom » prend le focus automatiquement à l'ouverture de `/login` ; le clavier virtuel standard s'affiche sans zoom forcé (`font-size: 16px` minimum sur l'input pour éviter le zoom iOS) ; le bouton « Continuer » mesure ≥ 48 px de haut pour une cible tactile confortable ; l'ensemble du parcours (login → sélection → confirmation) tient en moins de 3 interactions au pouce.

*Mode B — Google (option, admins et identifiés)*

- Sous le champ « Prénom » et le bouton « Continuer », un séparateur « ou » puis un `mat-stretched-button` outlined « Continuer avec Google » déclenche `AuthService.connecterGoogle()` (popup desktop, redirect mobile, repli identique à la v0).
- Après authentification Google : header piloté par `AuthService.user` (`photoURL` ou initiales + `displayName`) ; le cookie `mesdispos_nom` n'est PAS posé ; la déconnexion reste `signOut()` Firebase.
- L'accès admin (`/admin/import`) reste exclusivement mode B : si l'utilisateur arrive sur `/login` avec une route demandée = `/admin/import`, la carte « Prénom » est remplacée par « Continuer avec Google » (le mode A est refusé pour les routes admin, sans message).

*Header & session (commun aux deux modes)*

- Header permanent (sauf `/login`) : « MesDispos » à gauche ; à droite, en mode A : le `displayName` anonyme (initiale en avatar circulaire) + un `mat-icon-button` « Se déconnecter » qui appelle `CookieService.effacer()` puis redirige `/login` ; en mode B : avatar `photoURL` ou initiales + `displayName` + `mat-icon-button` « Se déconnecter » (`signOut` Firebase).
- Restauration de session au démarrage : mode B via `onAuthStateChanged` Firebase ; mode A via `CookieService.lireNom()`. Les deux alimentent le même signal `AuthService.user` (forme unifiée `{ uid, displayName, anon: boolean }`). Pas de logout automatique.

**F3 — Affichage des créneaux (page `/dispos`)**
- Deux sections, dans cet ordre sur mobile, côte à côte sur desktop (grille 2 colonnes ≥ 900px) :
  1. **« Créneaux disponibles »** — créneaux de `creneaux` sans document `dispos` correspondant.
  2. **« Mes disponibilités (N) »** — créneaux sélectionnés, `N` = compteur en temps réel, triés par date puis heure.
- Chaque section regroupe les créneaux par jour avec un en-tête de groupe (« lundi 12 janvier 2026 » via `date-group.pipe` + `Intl.DateTimeFormat('fr-FR', { weekday, day, month, year })`).
- Une ligne de créneau (`creneau-card`) affiche : heure de début → heure de fin (`08:45 → 09:30`), libellé éventuel, et un état visuel de sélection. Cible tactile ≥ 48px de haut. Accessibilité : élément `<button>` avec `aria-pressed`, libellé « Disponible lundi 12 janvier de 8 h 45 à 9 h 30 ».
- États : chargement (`mat-skeleton` ou `mat-progress-bar`), liste vide (« Aucun créneau proposé pour le moment. » / « Vous n'avez pas encore retenu de créneau. »), erreur de lecture (message + bouton Réessayer).

**F4 — Sélection immédiate (cœur du produit)**
- Un clic sur un créneau disponible le sélectionne ; un clic sur un créneau sélectionné le désélectionne. **Aucun bouton Enregistrer, aucun formulaire, aucune confirmation.**
- Séquence à chaque clic :
  1. Mise à jour **optimiste** du signal local (la ligne bascule de section instantanément).
  2. État « en cours » sur la ligne (icône spinner 16px) pendant l'écriture.
  3. Sélection → `setDoc(users/{uid}/dispos/{creneauId}, Dispo)` ; désélection → `deleteDoc(...)`.
  4. Succès : l'état « en cours » disparaît. Échec : **rollback** de l'état local + `mat-snack-bar` « Enregistrement impossible. Réessayer » avec action `Réessayer` qui rejoue l'écriture.
- Écritures concurrentes tolérées : la dernière action gagne (état local = source de vérité d'affichage, Firestore = source de vérité de persistance).
- Synchronisation multi-onglet/multi-appareil : `onSnapshot` sur la sous-collection `dispos` de l'utilisateur met à jour les signaux ; pas de notification particulière.

**F5 — Persistance immédiate / modèle temps réel**
- `CreneauService.creneaux` : `signal<Creneau[]>` alimenté par `onSnapshot(collection(db, 'creneaux'))`, tri date+heure ascendant, ids normalisés.
- `DispoService.dispos` : `signal<Dispo[]>` alimenté par `onSnapshot(users/{uid}/dispos)`.
- `DispoService.idsSelectionnes` : `computed<Set<string>>`. `DispoService.disponibles` / `dispos` : `computed` dérivés (jointure mémoire par `creneauId`).
- Les services n'utilisent jamais `localStorage` (Do NOT §13).

**F6 — Import Excel des créneaux (route `/admin/import`, admin seulement)**
- `adminGuard` : connecté ET `getDoc(admins/{uid})` existe, sinon redirection `/dispos` + snackbar « Accès réservé à un administrateur ».
- Page : zone de dépôt (drag & drop + `input[type=file]`), `.xlsx` uniquement ; un autre format déclenche « Format non pris en charge : utilisez un fichier Excel .xlsx ».
- Format attendu (1ʳᵉ feuille, 1ʳᵉ ligne = en-têtes) :

| Colonne (en-tête, insensible à la casse/accents) | Type | Oblig. | Exemple |
|---|---|---|---|
| `date` | cellule date Excel, ou chaîne `AAAA-MM-JJ`, ou `JJ/MM/AAAA` | oui | 12/01/2026 |
| `heure_debut` (ou `debut`) | cellule heure Excel, ou chaîne `HH:mm`, ou `HHhmm` | oui | 08:45 |
| `heure_fin` (ou `fin`) | idem | oui | 09:30 |
| `libelle` | chaîne | non | Audition A1 |

- Normalisation stricte dans `shared/date.util.ts` : toute cellule Excel de type date/heure arrive en objet `Date` (base 1899-12-30 pour les heures pures) — convertir en `YYYY-MM-DD` / `HH:mm` **sans dépendre du fuseau** (utiliser les getters UTC d'un côté, locaux de l'autre, et documenter le choix dans `docs/decisions.md`).
- Validation ligne à ligne : date invalide, heures invalides, `heure_fin <= heure_debut`, doublon dans le fichier (même date+début+fin), doublon déjà présent en base. Les lignes invalides sont listées avec leur n° et un message français ; elles n'empêchent pas l'import des valides.
- Écran de prévisualisation : tableau (desktop) / cartes (mobile) des lignes valides + encart « N lignes invalides (détail dépliable) ».
- Bouton « Importer N créneaux » → `writeBatch` (500 opérations max par batch, découpage automatique) en `setDoc` sur `creneaux/{id}` (upsert). Snackbar de résultat : « N créneaux importés, M lignes ignorées ».

**F7 — Responsive mobile + desktop (contrat, pas une option)**
- Mobile layout (≤ 420px) : une seule colonne, sections empilées, bouton de sélection pleine largeur, header compact (avatar sans nom), padding horizontal ≥ 8px et ≥ 16px sur un côté, pas de scroll horizontal à 375px.
- Tablette (≤ 900px) : une colonne, cards sur 2 colonnes de largeur égale quand le texte le permet.
- Desktop (≥ 1280px) : grille 2 colonnes (Disponibles | Mes disponibilités), largeur max 1100px centrée.
- Chaque composant de la §F6-F4 documente son rendu mobile/desktop dans un commentaire `// Mobile: …` / `// Desktop: …` en tête de template.

## 7. Contrat API (backend = Firestore + format de fichier)

Pas d'API HTTP. Contrat = schéma §5 + règles §11 + format Excel §F6. Points d'entrée code :

| Fonction | Signature | Comportement |
|---|---|---|
| `CreneauService.ecouter()` | `(): Unsubscribe` | `onSnapshot` sur `creneaux`, alimente `creneaux` signal |
| `DispoService.basculer(c: Creneau)` | `(): Promise<void>` | toggle optimiste + écriture immédiate + rollback/snackbar en cas d'échec |
| `ExcelImportService.lire(f: File)` | `Promise<ResultatImport>` | parse `.xlsx`, normalise, valide |
| `ExcelImportService.importer(lignes)` | `Promise<{importes: number}>` | upsert batch dans `creneaux` |
| `AuthService.user` | `signal<User \| null>` | `onAuthStateChanged` |
| `AuthService.connecterGoogle()` | `Promise<void>` | popup, repli redirect |

Méthodes complémentaires (mode A « Nom seul », cf. F2) :

| Fonction | Signature | Comportement |
|---|---|---|
| `CookieService.setNom(nom)` | `{ ok: boolean; erreur?: string }` | valide (1 ≤ len ≤ 50, normalisation) puis pose `mesdispos_nom` via `document.cookie` (`HttpOnly=false`, `SameSite=Lax`, `Secure` si HTTPS, `Max-Age=31536000`) |
| `CookieService.lireNom()` | `string \| null` | lecture du cookie courant, `null` si absent |
| `CookieService.effacer()` | `void` | supprime le cookie (max-age 0) |
| `CookieService.normaliserNom(s)` | `string` | `trim` + collapse interne des espaces |
| `AuthService.connecterParNom(nom)` | `Promise<void>` | délègue à `CookieService.setNom` puis pose `user = { uid: 'anon_<sha256-courte>', displayName: nom, anon: true }` |
| `AuthService.signOut()` (étendu) | `Promise<void>` | efface le cookie si l'utilisateur courant est anonyme, sinon `firebase/auth` `signOut` ; remet `user = null` |

`AuthService.user` reste le signal unifié consommé par `header` et par les guards : `authGuard` laisse passer un user (Google **ou** anonyme) ; `adminGuard` exige `user && !user.anon` (mode B obligatoire pour `/admin/import`).

## 8. Plan d'exécution (une étape = un commit, dans l'ordre)

1. **`chore(repo): bootstrap mesdispos`** — `ng new mesdispos --style=scss --routing --ssr=false`, `git init`, `.gitignore` (node_modules, dist, .firebase, `*-debug.log`, `.env`), copier ce document en `AGENTS.md`, créer `docs/decisions.md`.
   - Verify: `ng version` affiche Angular 22, `npm ci` exit 0.
   - Commit: `chore(repo): bootstrap mesdispos (Angular 22)`
2. **`chore(deps): material + firebase + read-excel-file`** — `ng add @angular/material` (M3, thème personnalisable), `npm i firebase read-excel-file`, configurer `styles.scss` (tokens + `mat.theme()`), `index.html` (`lang="fr"`, viewport, favicon SVG « M »).
   - Verify: `ng build --configuration=production` exit 0.
   - Commit: `chore(deps): add Angular Material 22, firebase, read-excel-file`
3. **`chore(test): configure vitest + playwright`** — builder `ng test` (Vitest), script `test`/`test:watch` dans `package.json`, Playwright installé avec les 3 viewports, aucun lancement.
   - Commit: `chore(test): configure vitest + playwright (not run by agent)`
4. **`feat(core): firebase init + auth service + guards`** — `core/firebase.ts`, `environments/firebase.config.ts` (valeurs documentées §14), `auth.service.ts` (signal `user`, `connecterGoogle` popup→redirect, `deconnecter`), `auth.guard.ts`, `admin.guard.ts`, `app.routes.ts` (lazily loaded), `app.config.ts`.
   - Verify: `ng build --configuration=production` exit 0.
   - Commit: `feat(core): firebase init, auth google, guards`
5. **`feat(auth): page login deux modes + cookie service + header`** — `login.component` (mode A : champ `Prénom` + bouton « Continuer » + lien « Utiliser un autre nom » + bouton secondaire outlined « Continuer avec Google » ; mode B seul pour la route `/admin/import`), `core/cookie.service.ts` (`setNom`/`lireNom`/`effacer`, normalisation, attributs cookie `HttpOnly=false`/`SameSite=Lax`/`Secure` si HTTPS/`Max-Age` 1 an), `auth.service.ts` étendu (signal `user` unifié `{ uid, displayName, anon }`, `connecterParNom` délègue à `CookieService` et pose user anonyme, `connecterGoogle` et `deconnecter` inchangés), `header.component` étendu (affichage nom + bouton déconnexion dans les deux modes), `layout/date-group.pipe.ts` (pipe pur `YYYY-MM-DD` → date française via `Intl.DateTimeFormat`, inchangé).
   - Commit: `feat(auth): login page + header + date pipe`
6. **`feat(data): models + creneau.service + dispo.service`** — `data/models.ts` (verbatim §5), `shared/date.util.ts` (`normalizeDate`, `normalizeHeure`, `trierCreneaux`), `creneau.service.ts`, `dispo.service.ts` (toggle optimiste, rollback, retry), `core/notif.service.ts`.
   - Commit: `feat(data): creneaux + dispos services (save-on-toggle)`
7. **`feat(firestore): rules + indexes + emulators`** — `firestore.rules`, `firestore.indexes.json`, `firebase.json` (hosting SPA rewrite, emulators), `.firebaserc.example`.
   - Verify: `npx firebase emulators:exec --only firestore "echo rules loaded"` si le CLI est dispo, sinon vérification syntaxique manuelle consignée dans `docs/decisions.md`.
   - Commit: `feat(firestore): security rules, indexes, firebase.json`
8. **`feat(dispos): page deux listes + toggle immédiat`** — `dispos-page.component`, `creneau-card.component`, états chargement/vide/erreur, snackbar retry, compteur `N`.
   - Verify: `ng build --configuration=production` exit 0.
   - Commit: `feat(dispos): dispo lists with immediate save-on-toggle`
9. **`feat(mobile): responsive 375/768/1280`** — grille 2 colonnes desktop, empilement mobile, cibles tactiles ≥ 48px, header compact, padding échelonné (desktop 48 / ≤900 24 / ≤700 16 / ≤420 8+16).
   - Commit: `feat(mobile): responsive layout for 375/768/1280`
10. **`feat(admin): import excel`** — `excel-import.service.ts`, `import.component` (drop zone, prévisualisation, validation ligne à ligne, upsert batch), `admin.guard` branché sur `/admin/import`, lien d'accès dans le header **uniquement pour les admins**.
    - Verify: `ng build --configuration=production` exit 0.
    - Commit: `feat(admin): xlsx creneaux import with preview + validation`
11. **`test(all): spec files`** — tous les `.spec.ts` de §10, écrits mais **non exécutés** (contrat §3). Vérifier seulement leur syntaxe TypeScript via `ng build` (les specs exclus du build de prod par le tsconfig de test).
    - Commit: `test(all): unit specs for utils, services, guard, import`
12. **`chore(repo): readme + adr + final`** — `README.md` (installation, config Firebase, format Excel, déploiement `firebase deploy --only hosting,firestore:rules`), `docs/decisions.md` complété avec toutes les décisions prises, `AGENTS.md` inchangé.
    - Verify: `ng build --configuration=production` exit 0 + checklist §9 remplie avec preuves.
    - Commit: `chore(repo): readme, decisions log, acceptance evidence`

## 9. Critères d'acceptation — checklist mécanique + preuve

**Format de preuve obligatoire** : chaque `[ ]` est coché UNIQUEMENT accompagné de la preuve ci-dessous (sortie de commande copiée, ou chemin de fichier + extrait `grep`). Un `[ ]` sans preuve est réputé non fait.

- [ ] **AC-1** `npm ci` exit 0 — *preuve :* `tail -3` de la sortie npm.
- [ ] **AC-2** `ng build --configuration=production` exit 0, 0 erreur — *preuve :* `tail -5` du build.
- [ ] **AC-3** `npx tsc --noEmit` exit 0 — *preuve :* sortie vide ou exit code.
- [ ] **AC-4** Les 3 routes existent (`/login`, `/dispos`, `/admin/import`) avec `authGuard`/`adminGuard` — *preuve :* `grep -n "path:" src/app/app.routes.ts`.
- [ ] **AC-5** Aucun `NgModule`, aucun `constructor(private …)` — *preuve :* `grep -rn "NgModule\|declarations" src/` = vide.
- [ ] **AC-6** Aucun champ `Date`/`Timestamp` dans `Creneau`/`Dispo` — *preuve :* `grep -n "Date\|Timestamp" src/app/data/models.ts` ne matche que les commentaires.
- [ ] **AC-7** Un clic = une écriture Firestore immédiate (pas de bouton Enregistrer) — *preuve :* `grep -rn "Enregistrer\|mat-dialog.*confirm" src/app/features/dispos/` = vide ; `grep -n "setDoc\|deleteDoc" src/app/data/dispo.service.ts` ≥ 2.
- [ ] **AC-8** Rollback + snackbar retry implémentés — *preuve :* `grep -n "catch\|rollback\|Réessayer" src/app/data/dispo.service.ts` ≥ 3 lignes.
- [ ] **AC-9** Responsive : les 3 breakpoints documentés dans les templates — *preuve :* `grep -rn "Mobile:\|Desktop:" src/app/features/` ≥ 4.
- [ ] **AC-10** `firestore.rules` conforme à §11 et déployable — *preuve :* `npx firebase deploy --only firestore:rules --dry-run` exit 0 (ou copie du fichier + note dans `docs/decisions.md` si le CLI n'a pas de projet configuré).
- [ ] **AC-11** Les 5 fichiers de tests de §10 existent et contiennent les cas listés — *preuve :* `ls src/**/*.spec.ts` + `grep -c "it("`.
- [ ] **AC-12** Import Excel : `.xlsx` accepté, tout autre format refusé avec message français — *preuve :* `grep -n "xlsx\|Format non pris en charge" src/app/data/excel-import.service.ts src/app/features/admin/import.component.ts`.
- [ ] **AC-13** `docs/decisions.md` contient une entrée ADR par décision non triviale prise — *preuve :* `grep -c "^## " docs/decisions.md` ≥ 3.
- [ ] **AC-14** Le README documente : config Firebase, format Excel, déploiement — *preuve :* `grep -n "^## " README.md`.
- [ ] **AC-16** Mode « Nom seul » (cookie fonctionnel, F2 mode A) — *preuve combinée :* (a) la page `/login` affiche en haut une carte centrée avec un `mat-form-field` outlined « Prénom » et un `mat-stretched-button` « Continuer » (désactivé tant que le champ est vide après trim) ; (b) à la soumission, `document.cookie` contient `mesdispos_nom=…` avec `HttpOnly=false`, `SameSite=Lax`, `Secure` si `location.protocol === 'https:'` ; (c) un `document.location.reload()` recharge l'app sans repasser par `/login` ; (d) le bouton « Utiliser un autre nom » du header efface le cookie et force un retour à `/login`. *Preuve :* `grep -n "mesdispos_nom\|setNom\|lireNom\|effacer" src/app/core/cookie.service.ts` ≥ 5 ; capture DevTools → Application → Cookies.
- [ ] **AC-17** Material Design 3 — dernière spec — *preuve combinée :* (a) les tokens SCSS couvrent la palette M3 (`--mat-sys-primary`/`-secondary`/`-tertiary` + rôles `on-*` + `surface` + `surfaceContainer*`), la type-scale M3 (`display`/`headline`/`title`/`body`/`label` × `large`/`medium`/`small`), le spacing MD3 (`4`/`8`/`12`/`16`/`24`/`32`), les elevations M3 (`level0`..`level5`) et les courbes de motion M3 ; (b) densité compacte par défaut ; (c) `prefers-color-scheme` respecté ; (d) une capture 1280px affiche `/login` à 1 carte centrée, header fin, espacement respirant, aucune ombre décorative. *Preuve :* `grep -rn "mat.theme\|--mat-sys-" src/styles.scss | wc -l` ≥ 10 ; `ng build --configuration=production` exit 0 ; capture jointe.
- [ ] **AC-18** Non-régression mode Google — les utilisateurs déjà identifiés via Firebase Auth conservent l'accès à `/dispos` et à leurs `dispos` existants ; le mode Nom est strictement additif et utilise une partition `users/anon_*/dispos` distincte dans Firestore. *Preuve :* deux navigateurs (un cookie `mesdispos_nom` posé, un connecté Google) sélectionnent le même créneau sans collision côté ID ni côté données ; `grep -n "connecterGoogle\|signOut\|user()" src/app/core/auth.service.ts`.
- [ ] **AC-19** Rendu smartphone validé — *preuve combinée :* (a) capture 375×812 (iPhone 13/14 viewport) montrant `/login` en mode A entièrement utilisable au pouce (champ `Prénom` + bouton « Continuer » ≥ 48 px de haut, focus automatique dans le champ à l'ouverture, clavier mobile géré sans zoom forcé) ; (b) capture équivalente de `/dispos` montrant les deux sections (« Créneaux disponibles » puis « Mes disponibilités ») empilées en une colonne, aucune barre de scroll horizontale à 375 px ; (c) capture du header compact (avatar sans nom, bouton « Se déconnecter » tactile ≥ 48 px). Preuve : `npx playwright test --project=mobile` exit 0 OU captures DevTools (toggle device emulation) jointes + check manuel `document.documentElement.scrollWidth <= 375`.
- [ ] **AC-15** Contrat §3 respecté : les tests n'ont PAS été exécutés, le build SI — *preuve :* phrase de synthèse finale listant les commandes réellement exécutées.

## 10. Tests (écrits, NON exécutés — contrat utilisateur)

| Fichier | Cas à couvrir |
|---|---|
| `src/app/shared/date.util.spec.ts` | `normalizeDate` : `Date` Excel, `AAAA-MM-JJ`, `JJ/MM/AAAA`, invalide → erreur ; `normalizeHeure` : `Date` (base 1899-12-30), `HH:mm`, `HHhmm`, `08:45:00`, invalide ; `trierCreneaux` : ordre date+heure, cas égal |
| `src/app/data/dispo.service.spec.ts` | toggle : sélection crée le doc `dispos/{creneauId}` avec les bons champs ; désélection le supprime ; échec réseau → rollback de l'état + snackbar « Réessayer » ; double-click rapide → dernière action gagne |
| `src/app/data/excel-import.service.spec.ts` | en-têtes insensibles casse/accents ; `heure_fin <= heure_debut` → ligne invalide ; doublons fichier et base ; comptage `ResultatImport` ; refus d'un fichier non-`.xlsx` |
| `src/app/core/auth.guard.spec.ts` | connecté → accès ; non connecté → `/login` avec retour de la route demandée ; `adminGuard` : sans `admins/{uid}` → `/dispos` |
| `src/app/features/dispos/dispos-page.component.spec.ts` | deux listes rendues ; compteur N ; clic émet `basculer` ; états vide/chargement/erreur |
| `e2e/mesdispos.spec.ts` | Playwright : parcours complet login (mock) → sélection → rechargement → créneau retenu ; screenshots 375/768/1280 ; aucun scroll horizontal à 375px |

| `src/app/core/cookie.service.spec.ts` | `setNom` normalise (trim + collapse des espaces, `1 ≤ len ≤ 50` caractères) et persiste via `document.cookie` un cookie nommé `mesdispos_nom` ; `lireNom` retourne la valeur courante (ou `null` si absent) ; `effacer` supprime le cookie ; nom vide ou > 50 caractères rejeté avec message français ; `Secure` flag posé automatiquement si `location.protocol === 'https:'` ; un nom déjà présent est restitué au redémarrage ; le service n'appelle jamais Firestore. |
Règle : les specs testent la logique pure et les services (mock Firestore), pas le rendu pixel.

## 11. Sécurité & conformité

`firestore.rules` à livrer exactement ainsi :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function connecte() { return request.auth != null; }
    function admin() {
      return connecte() && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    match /creneaux/{id} {
      allow read: if connecte();
      allow create, update, delete: if admin();
    }

    match /users/{uid}/dispos/{creneauId} {
      allow read, write: if connecte() && request.auth.uid == uid;
    }

    match /admins/{uid} {
      allow read: if connecte() && request.auth.uid == uid;
      allow write: if false; // géré via la console Firebase / Admin SDK
    }

    match /{document=**} { allow read, write: if false; }
  }
}
```

- Les identifiants Firebase web (`firebase.config.ts`) sont **publics par conception** : ils peuvent être commités. En revanche, **jamais** de fichier de compte de service, ni de clé privée, ni de `.env` secret dans le repo.
- Données personnelles minimales : nom, email, photo Google + créneaux choisis. Pas d'autre donnée, pas d'analytics, pas de cookies tiers. Mention « Données : nom, email et disponibilités, supprimables sur demande » dans le README (RGPD minimal).
- **Authentification : deux modes simultanés au choix** (cf. F2) —
  - Mode A — Nom seul (cookie fonctionnel, défaut v1) : pas d'appel Firebase Auth ; le prénom/pseudonyme saisi sur `/login` est stocké dans un cookie `HttpOnly=false`, `SameSite=Lax`, `Secure` (si HTTPS), `Max-Age ≈ 1 an` (`mesdispos_nom`). L'identité anonyme côté Firestore dérive de `sha256(nom normalisé)[:12]` préfixé `anon_` (voir §5 et §11 ci-dessous — règle adaptée).
  - Mode B — Google (auth Firebase, popup desktop / redirect mobile) : inchangé par rapport à la v0 ; destiné aux admins et aux utilisateurs identifiés.
  Le domaine autorisé reste configurable via `ALLOWED_EMAIL_DOMAINS` dans `firebase.config.ts` (tableau de domaines, vide = tout compte Google accepté) ; contrôle côté client au login + documenté pour un contrôle rules ultérieur. Le `adminGuard` reste fondé sur `admins/{uid}` et exige le mode B.

## 12. CI/CD

- GitHub Actions `.github/workflows/ci.yml` : `npm ci` → `ng lint` → `ng build --configuration=production` → upload de l'artefact `dist/`. **Les tests ne sont pas lancés dans la CI en v1** (contrat §3), workflow volontairement commenté avec `# TODO humain : npm test`.
- Déploiement manuel : `firebase deploy --only hosting,firestore:rules` (documenté au README). Pas de CD automatique.

## 13. Do NOT (règles négatives — non négociables)

- **PAS de `@angular/fire`** — SDK modulaire `firebase` uniquement.
- **PAS de `Date`, `Timestamp`, epoch** pour `date`/`heureDebut`/`heureFin` : chaînes `YYYY-MM-DD``/`HH:mm` uniquement, aucune conversion de fuseau horaire sur les créneaux.
- **PAS de bouton Enregistrer / aucune confirmation** avant écriture : le clic EST l'enregistrement.
- **PAS de `localStorage`/`sessionStorage`/IndexedDB** pour les données métier (thème ou préférence d'affichage = exception tolérée).
- **PAS de Cloud Functions, pas de backend custom, pas de Node côté serveur** en v1.
- **PAS de `.xls`** (format Excel 97) : `.xlsx` uniquement, refus explicite et poli des autres formats.
- **PAS d'UI admin de restitution/export des disponibilités** en v1 (les données se lisent dans la console Firebase) — noter en ADR si on te le demande.
- **PAS d'email, SMS, notification push, rappel**.
- **PAS de SaaS analytics, tracking, A/B test.** Aucun bandeau de consentement cookie (le seul cookie employé est strictement nécessaire à la fourniture du service expressément demandé par l'utilisateur, cf. §11 — exempt CNIL) : pas de TCF, pas de Axeptio / Cookiebot / équivalent.
- **PAS de librairie UI tierce** hors Angular Material/CDK, pas de Tailwind, pas de CSS framework.
- **PAS de NgModules, de `NgModule`, de `declarations`, de composants `extends` sans `override`**.
- **PAS de `any`** non justifié par une entrée `docs/decisions.md`.
- **PAS de suppression de ce fichier `AGENTS.md`** ni de réduction de la checklist §9.
- **PAS d'exécution de `npm test` / Playwright** par l'agent (contrat utilisateur §3) — mais le build, lui, DOIT être exécuté avant chaque commit.

## 14. Questions ouvertes & format ADR

Décisions à prendre par l'agent si le besoin se présente, et à journaliser systématiquement :

> Si une décision non triviale se pose, applique le défaut ci-dessous et crée une entrée dans `docs/decisions.md` :
>
> ```
> ## YYYY-MM-DD — <titre>
> Contexte : <pourquoi la question se pose>
> Décision : <ce qui a été choisi, défaut appliqué si non tranché>
> Conséquences : <compromis>
> ```

- **Config Firebase (input humain obligatoire)** : `src/environments/firebase.config.ts` doit contenir `export const FIREBASE_CONFIG = { apiKey, authDomain, projectId, appId, storageBucket, messagingSenderId }` et `export const ALLOWED_EMAIL_DOMAINS: string[] = []`. Ces valeurs viennent de la console Firebase → le README documente « remplacer les valeurs de démonstration par celles de votre projet ». Ce n'est pas un placeholder à inventer : livre des valeurs littérales `REPLACE_ME_*` **et** la consigne README, puis signale-le dans le résumé final.
- **ID de projet Firebase** : `.firebaserc.example` avec `{"projects": {"default": "REPLACE_ME"}}` + consigne `firebase use --add`.
- **Admin par défaut** : aucune graine ; le premier admin est ajouté manuellement via la console (collection `admins`, doc = uid, champ `email`).
- **Duplication éventuelle `heure_fin` chevauchante** : tolérée en v1 (un prof peut déclarer deux créneaux qui se chevauchent si la base les propose) — ADR si l'humain demande un contrôle.
- **Annulation/suppression d'un créneau par un admin** après sélection par des profs : les dispos orphelines restent visibles dans « Mes disponibilités » (jointure par id) — ADR si comportement différent demandé.

## 15. Démarrage rapide

```bash
npm ci
ng serve                 # http://localhost:4200
npx firebase emulators:start   # firestore + auth en local (optionnel)
ng build --configuration=production
npx firebase deploy --only hosting,firestore:rules
# humain uniquement : npm test, npx playwright test
```

Rappel final pour l'agent : exécute le plan §8 dans l'ordre, un commit par étape, `ng build --configuration=production` avant chaque commit, remplis la checklist §9 avec les preuves, et termine par un résumé listant ce qui est fait, ce qui est resté volontairement hors périmètre (§13) et les entrées de `docs/decisions.md`.
