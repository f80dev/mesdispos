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


## 2026-10-21 — SDK Firebase chargé en import dynamique (bundle initial 887 kB → 378 kB)

**Contexte :** le header vit dans le composant racine et utilise `AuthService`, qui importait statiquement `firebase/auth` et `core/firebase.ts` importait `firebase/firestore`. Résultat mesuré : **887,65 kB** de bundle initial, au-dessus du budget d'avertissement de 500 kB — et surtout, un utilisateur en mode A « Nom seul » téléchargeait 700 kB de SDK dont il n'a jamais besoin (F2 mode A : « Aucun appel Firebase Auth ; aucune dépendance réseau »).

**Décision :** `core/firebase.ts` expose `chargerApp()`, `chargerAuth()`, `chargerFirestore()` (imports dynamiques mémoïsés) et des accesseurs `firebaseApp()/firebaseAuth()/firebaseDb()` désormais **asynchrones**. `AuthService`, `adminGuard` et (plus tard) les services de données consomment ces promises. `ecouter()` reste synchrone côté contrat (§7) en renvoyant un `Unsubscribe` enveloppant une désinscription asynchrone.

**Conséquences :** bundle initial **377,94 kB** (sous le budget, aucun avertissement), `firebase/auth` et `firebase/firestore` sont des chunks lazy. Le code appelant devient asynchrone (`import type` conserve le typage sans arête runtime). Le mode A ne télécharge aucun octet de SDK Firebase.

## 2026-10-21 — `mat-stretched-button` remplacé par `matButton` (API Material 22)

**Contexte :** F2 demande un « `mat-stretched-button` » et un bouton « outlined ». Or dans `@angular/material@22.2.4`, les sélecteurs `mat-stretched-button` et `mat-outlined-button` **n'existent plus** : `MatButton` n'expose plus que `button[matButton] | button[mat-button] | button[mat-raised-button] | button[mat-flat-button] | button[mat-stroked-button]`, avec l'entrée `appearance` aliasée sur `matButton` et le type `MatButtonAppearance = 'text' | 'filled' | 'elevated' | 'outlined' | 'tonal'`.

**Décision :** « Continuer » → `<button matButton>` (filled, pleine largeur = l'intention « stretched » du cahier) ; « Continuer avec Google » → `<button matButton="outlined">`. Le rendu visuel et l'intention du cahier sont conservés ; seul l'attribut change.

**Conséquences :** le cahier cite un sélecteur qui n'est plus disponible en Material 22 ; toute reprise du code doit utiliser l'API `matButton` / `matButton="outlined"`. Les boutons icône (`mat-icon-button`, bouton « Se déconnecter ») sont eux toujours disponibles.

## 2026-10-21 — `uid` anonyme : SHA-256 synchrone implémenté à la main

**Contexte :** §5 impose `uid = 'anon_' + sha256(nom normalisé).slice(0, 12)`. `crypto.subtle.digest()` est asynchrone : l'`uid` restore depuis le cookie au démarrage devrait attendre un hash, et le calcul asynchrone peut diverger du calcul fait au clic (deux partitions Firestore distinctes pour le même professeur).

**Décision :** implémentation SHA-256 synchrone en TypeScript pur (`shared/sha256.util.ts`, FIPS 180-4), vérifiée contre `hashlib` de référence sur des entrées ASCII, multi-octets UTF-8 et multi-blocs (1000 caractères). `utilisateurAnonyme(nom)` est l'unique source de vérité de l'`uid` ; `CookieService` ne fait que valider/normaliser.

**Conséquences :** `shared/sha256.util.ts` est un fichier ajouté à l'arbre imposé du §2 (ADR assumée). Aucun `crypto.subtle` requis, l'identifiant est testable sans mock et stable entre le clic et le redémarrage. Ce n'est pas du chiffrement : le prénom reste une donnée publique, seulement hachée pour dériver un identifiant technique.

## 2026-10-21 — Cookie du mode A : `HttpOnly=false` par construction

**Contexte :** F2/§7 imposent `HttpOnly=false`, `SameSite=Lax`, `Secure` si HTTPS, `Max-Age` 1 an. Un cookie posé via `document.cookie` ne peut pas être `HttpOnly` : le navigateur ignore l'attribut (réservé à `Set-Cookie` côté serveur), et il n'y a pas de serveur dans ce projet (« PAS de Cloud Functions, pas de backend custom », §13).

**Décision :** `CookieService` écrit `mesdispos_nom=<encodeURIComponent(valeur)>; Max-Age=31536000; Path=/; SameSite=Lax` (+ `; Secure` si `location.protocol === 'https:'`). Le caractère non-`HttpOnly` est documenté dans le code : il est **voulu**, la page devant relire et effacer le cookie sans appel réseau. Suppression immédiate via « Se déconnecter » (button header) ou « Utiliser un autre nom ».

**Conséquences :** la valeur du cookie est accessible au JavaScript de la page (XSS). Le risque est mitigé par l'absence totale de données sensibles (un prénom affiché à l'écran), l'absence de tout cookie tiers et le consentement non requis (cookie strictement nécessaire — §13). `Path=/` est indispensable pour que la valeur soit disponible sur `/admin/import` comme sur `/dispos`.
