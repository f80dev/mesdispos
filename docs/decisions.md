1|# Journal ADR (Architecture Decision Records)
2|
3|Format d'une entrée :
4|
5|`markdown
6|## YYYY-MM-DD — <titre>
7|
8|**Contexte :** <pourquoi la question se pose>
9|
10|**Décision :** <ce qui a été choisi, défaut appliqué si non tranché>
11|
12|**Conséquences :** <compromis>
13|`

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

## 2026-10-21 — Fuseaux : lecture Excel en UTC, affichage en local

**Contexte :** F6 impose de convertir les cellules Excel « sans dépendre du fuseau (utiliser les getters UTC d'un côté, locaux de l'autre) ». Le choix dépend du comportement réel de la bibliothèque : `read-excel-file@5.8.8` convertit le numéro de série en `new Date(Math.round((serial - 25569) * 86400000))` (`commonjs/read/parseDate.js`, commentaire explicite « into a corresponding javascript Date in UTC+0 timezone »). Une date Excel pure tombe donc **exactement à minuit UTC**, et une heure pure (base 1899-12-30) sur l'**heure UTC** voulue.

**Décision :** `normalizeDate()` et `normalizeHeure()` lisent les objets `Date` avec les getters **UTC** (`getUTCFullYear`, `getUTCHours`…) ; les getters **locaux** sont réservés au rendu (`date-group.pipe`, qui construit `new Date(année, mois - 1, jour)` avant `Intl.DateTimeFormat('fr-FR')`). Une date Excel reste donc la même le 12 janvier, que le fichier soit lu à Paris, à New York ou à Auckland. Les fractions de journée (`0,363…`) sont aussi acceptées, converties comme la bibliothèque.

**Conséquences :** pas de décalage d'un jour sur les créneaux du matin importés depuis un fuseau négatif, qui est le bug classique de ce type d'import. Le prix : une `Date` affichée telle quelle dans un fuseau exotique montrerait un jour de retard — d'où l'usage systématique des chaînes `'YYYY-MM-DD'` (§13).

## 2026-10-21 — Disponibilités orphelines conservées (jointure mémoire)

**Contexte :** §5 autorise les `dispos` orphelines (créneau supprimé par un admin après sélection) et §14 les affiche dans « Mes disponibilités » via la jointure mémoire avec `creneaux`.

**Décision :** `DispoService.retenus` est un `computed` qui, pour chaque `Dispo`, cherche le `Creneau` du même `id` ; à défaut, il **reconstruit un créneau depuis les champs dénormalisés** du document `Dispo` (`date`, `heureDebut`, `heureFin`, `libelle`). `disponibles` fait l'inverse (créneaux sans document `dispo`).

**Conséquences :** une disponibilité orpheline reste visible et toujours désélectionnable (le `deleteDoc` fonctionne : le document existe encore). Aucun `localStorage` ni cache local : la seule source de vérité de persistance reste Firestore (F4).

## 2026-10-21 — Écritures concurrentes : compteur de séquence par créneau

**Contexte :** F4 demande de tolérer les écritures concurrentes, « la dernière action gagne », l'état local servant à l'affichage et Firestore à la persistance. Un double-clic rapide (ou un rejeu via « Réessayer ») peut faire arriver les réponses dans le désordre.

**Décision :** chaque créneau porte un compteur `sequences: Map<creneauId, number>`. Le rollback et la fin du spinner ne s'appliquent que si la réponse correspond à la séquence courante ; une réponse périmée est ignorée (état local déjà mis à jour par l'action plus récente, Firestore « dernière écriture gagne »).

**Conséquences :** pas de « retour en arrière » visuel après un double-clic rapide. Le `Dispo` écrit contient `updatedAt: Date.now()` purely informatif (§5) — jamais utilisé comme condition de conflit.

## 2026-10-21 — `notif.service.ts` créé à l'étape 4

**Contexte :** le plan §8 place `core/notif.service.ts` à l'étape 6, mais `adminGuard` (étape 4) doit afficher « Accès réservé à un administrateur ».

**Décision :** le service a été livré à l'étape 4 avec les guards, et l'étape 6 se contente de le consommer (snackbar « Enregistrement impossible. Réessayer »). Aucun doublon, contenu inchangé par rapport à ce qu'aurait livré l'étape 6.

## 2026-10-21 — Règles Firestore : adaptation au mode A sans session

**Contexte :** §11 livre des règles qui exigent `request.auth != null` partout, ce qui exclut le mode A « Nom seul » (aucun appel Firebase Auth). Le cahier demande explicitement d'adapter la règle des disponibilités à `request.auth == null && uid.matches('^anon_[0-9a-f]{12}$')`.

**Décision :** `creneaux` est lisible par tous (`allow read: if true`, écriture `admin()` seule) ; `users/{uid}/dispos` est accessible selon la branche — `connecte() ? (request.auth.uid == uid) : uidAnonymeValide()` ; `admins` reste en lecture pour le concerné et `allow write: if false` ; le catch-all `match /{document=**} { allow read, write: if false; }` est conservé. La syntaxe officielle n'est pas modifiée hors des deux lignes commentées.

**Conséquences :** ⚠️ **compromis de confidentialité connu** : l'`uid` anonyme est le SHA-256 tronqué à 12 caractères hexadécimaux du prénom normalisé. Il est donc **recalculable** par quiconque connaît (ou devine) le pseudonyme : une personne qui saisit « Pauline » peut calculer `anon_85209162cfd3` et lire — voire écrire — ses créneaux. C'est inhérent au mode sans compte demandé par le cahier (§5). Si la confidentialité des disponibilités devient sensible : remplacer le hash du prénom par un identifiant **aléatoire** (UUID) stocké dans le même cookie `mesdispos_nom` (le cookie reste alors la seule source d'identité, et les partitions restent séparées). Question laissée ouverte à l'humain.

## 2026-10-21 — Aucun index composite requis

**Contexte :** F5 utilise exclusivement `onSnapshot(collection(db, 'creneaux'))` et `onSnapshot(collection(db, 'users', uid, 'dispos'))` : ce sont des requêtes mono-collection, donc servies par les index automatiques.

**Décision :** `firestore.indexes.json` est livré avec `indexes: []` et un `fieldOverrides` documenté (groupe `dispos`, sans surcharge). Le fichier reste valide et déployable tel quel, la structure étant prête si un jour une requête `where('date', '>=', …)` apparaît.

**Conséquences :** pas de facturation d'index composites, pas de délai de propagation à l'indexation. Le tri est fait côté client (`trierCreneaux`), ce qui convient au volume attendu (quelques centaines de créneaux).

## 2026-10-21 — Vérification des règles sans Firebase CLI

**Contexte :** le plan §8 exige `npx firebase emulators:exec --only firestore` « si le CLI est dispo ». Le CLI n'est pas installé dans cet environnement (`which firebase` → absent, `npx --no-install firebase` → « could not determine executable to run ») ; l'installer ajouterait plusieurs centaines de Mo pour une vérification que l'humain refait au déploiement.

**Décision :** vérification **syntaxique et structurelle** consignée dans ce journal et rejouable : accolades/parenthèses équilibrées après retrait des commentaires et des chaînes ; présence de `rules_version = '2'`, `service cloud.firestore`, `match /databases/{database}/documents`, des fonctions `connecte()`/`admin()`/`uidAnonymeValide()`, du catch-all `allow read, write: if false`, de `allow read: if true` + écriture admin sur `creneaux`, de la double branche Google/anonyme sur `users/{uid}/dispos` ; `firebase.json`, `firestore.indexes.json` et `.firebaserc.example` parsés en JSON valide ; `uid` calculé (`sha256('Pauline')[:12]`) conforme à `^anon_[0-9a-f]{12}$` ; dossier public `dist/mesdispos/browser` présent.

**Conséquences :** `firebase deploy --only firestore:rules` reste à exécuter par l'humain (AC-10 dispose de cette dérogation explicite). Aucune dépendance supplémentaire n'est ajoutée au projet.

## 2026-10-21 — Hosting : `dist/mesdispos/browser` + cache

**Contexte :** le builder `@angular/build:application` (Angular 22) sort dans `dist/mesdispos/browser` (et non plus `dist/mesdispos` directement) ; un `public` erroné publie un dossier vide.

**Décision :** `firebase.json` pointe sur `dist/mesdispos/browser`, applique la réécriture SPA `** → /index.html`, interdit le cache sur `index.html` et pose `immutable` sur les bundles hachés.

**Conséquences :** un `ng build --configuration=production` suivi de `firebase deploy --only hosting` publie correctement et sans confusion de cache ; `.firebaserc` est ignoré par git (le modèle versionné est `.firebaserc.example`).
