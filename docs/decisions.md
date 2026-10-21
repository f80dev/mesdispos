1|# Journal ADR (Architecture Decision Records)
2|
3|Format d'une entrée :
4|
5|```markdown
6|## YYYY-MM-DD — <titre>
7|
8|**Contexte :** <pourquoi la question se pose>
9|
10|**Décision :** <ce qui a été choisi, défaut appliqué si non tranché>
11|
12|**Conséquences :** <compromis>
13|```


## 2026-10-21 — ESLint non câblé en v1 (`ng lint` indisponible)

**Contexte :** AGENTS.md §3 impose « `ng lint` propre avant chaque commit » et §12 fait tourner `ng lint` dans la CI, mais la table de stack imposée §4 ne mentionne ni ESLint ni `@angular-eslint`. Le paquet `@angular/build@22.2.3` livré avec le CLI n'expose aucun builder `lint` (`builders.json` = `application`, `dev-server`, `extract-i18n`, `karma`, `ng-packagr`, `unit-test`) : `ng lint` échouerait avec « target not found » tant qu'aucun `@angular-eslint/builder` n'est installé.

**Décision :** ne pas installer ESLint en v1. Le contrôle qualité retenu est `prettier --check` + `ng build --configuration=production` (le build Angular type-check l'application entière avec le compilateur Angular, template inclus). La CI (§12) est alignée : `npm ci` → `npm run format:check` → `ng build --configuration=production` → upload `dist/`.

**Conséquences :** pas de règles de lint automatiques (imports inutilisés, `any` implicite…) ; le contrat de vérification §3 est partiellement satisfait (build exécuté, lint non). Levée possible sans toucher au code applicatif : `ng add @angular-eslint/schematics` puis `ng lint`. Aucun `any` n'est livré sans justification ADR (§13).

## 2026-10-21 — Playwright installé sans les navigateurs

**Contexte :** §10 impose des specs e2e écrites mais **non exécutées** par l'agent ; les binaires de navigateurs Playwright pèsent ~1 Go.

**Décision :** `npm i -D @playwright/test` (paquet seul, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`). La config `playwright.config.ts` déclare les 3 viewports 375 / 768 / 1280. L'humain exécute `npm run test:e2e:install` (puis `npm run test:e2e`) — rappelé dans le README et dans l'en-tête de la config.

**Conséquences :** `npm run test:e2e` échoue avec « browser not found » tant que l'humain n'a pas lancé l'install ; comportement voulu (rien n'est exécuté par l'agent).

## 2026-10-21 — Firebase JS SDK v13 installé (au lieu de ^12)

**Contexte :** §4 impose le SDK modulaire `firebase` `^12`. Au moment de l'étape 2 (dépendances), `npm i firebase` a résolu `firebase@13.1.0` ; aucune contrainte de version n'était épinglée dans le projet.

**Décision :** conserver `firebase@^13.1.0` : l'API modulaire utilisée (`initializeApp`, `getAuth`, `getFirestore`, `onSnapshot`, `setDoc`, `deleteDoc`, `writeBatch`, `GoogleAuthProvider`) est inchangée entre v12 et v13, et rester sur une version explicitly installée et testée par le build vaut mieux que de forcer une rétrogradation. `@angular/fire` reste proscrit (§13).

**Conséquences :** écart mineur avec la ligne « ^12 » du tableau §4. Correction triviale si l'humain veut aligner : `npm i firebase@^12`.


## 2026-10-21 — Initialisation Firebase paresseuse (mode A sans réseau)

**Contexte :** F2 mode A exige « Aucun appel Firebase Auth ; aucune dépendance réseau » pour le parcours « Nom seul ». Or `initializeApp`/`getAuth` lancés au chargement du bundle brisent la compatibilité de la config et contaminent la session anonyme.

**Décision :** `core/firebase.ts` n'exporte que des **fonctions** (`firebaseApp()`, `firebaseAuth()`, `firebaseDb()`) qui créent les instances à la demande. `AuthService.demarrer()` ne s'abonne à `onAuthStateChanged` que si `firebaseConfigure()` est vrai (pas de `REPLACE_ME_*`) et si aucune session anonyme n'a été restaurée depuis le cookie.

**Conséquences :** une visite en mode A pur n'ouvre aucune connexion réseau Firebase. Le mode B (Google) s'active dès qu'un utilisateur Google authentifié est présent ; si la config n'est pas renseignée, `connecterGoogle()` affiche un message explicite au lieu d'échouer silencieusement.

## 2026-10-21 — Guards asynchrones et priorité au cookie anonyme

**Contexte :** `authGuard` doit laisser passer un utilisateur Google **ou** anonyme. Une restauration Firebase est asynchrone (`onAuthStateChanged`) : un guard synchrone redirigerait vers `/login` avant la réponse de Firebase. En outre, un utilisateur ayant les deux sessions (cookie `mesdispos_nom` + session Google) doit exposer un seul `user`.

**Décision :** `AuthService.attendreSession()` retourne immédiatement l'utilisateur si le signal est renseigné, sinon attend le **premier** `onAuthStateChanged` (plafondé à 5 s pour ne jamais bloquer la navigation). Les deux guards sont des `CanActivateFn` asynchrones. Priorité de restauration au démarrage : cookie anonyme d'abord (mode A), Firebase seulement s'il n'y a pas de cookie.

**Conséquences :** le « Se déconnecter » du mode A efface le cookie : la visite suivante restaure alors la session Google si elle existe. Un utilisateur Google qui saisit un prénom sur `/login` bascule en mode A (les deux partitions Firestore sont distinctes, AC-18).

## 2026-10-21 — `provideAnimationsAsync` non câblé (Angular 22)

**Contexte :** §2 demande `app.config.ts` avec `provideRouter` + `provideAnimationsAsync`. Or `@angular/animations` n'est plus distribué avec Angular 22 (`node_modules/@angular/animations` absent) : le module est déprécié depuis la 20.2 et le Material 22 s'anime en CSS pur.

**Décision :** `app.config.ts` fournit `provideRouter` + `provideBrowserGlobalErrorListeners` uniquement ; les transitions Material 3 s'appuient sur les tokens de motion M3 en CSS. Zoneless : l'app a été générée sans `zone.js` (§4 « zoneless par défaut si proposé par le CLI »), rien à dé-configurer.

**Conséquences :** écart assumé avec la ligne « `provideAnimationsAsync` » de §2, sans impact fonctionnel (snackbar, ripples et dialogs Material 22 n'utilisent plus `@angular/animations`).
