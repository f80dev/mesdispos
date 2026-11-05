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

## 2026-10-21 — Page `/dispos` : regroupement côté composant, aucun formulaire

**Contexte :** F3 demande deux sections groupées par jour et F4 interdit tout bouton d'enregistrement ou confirmation. L'état est intégralement porté par les services (`CreneauService`, `DispoService`), la page ne fait que composer.

**Décision :** `DisposPageComponent` s'abonne dans son constructeur (`ecouter()` sur les deux services) et se désabonne dans `ngOnDestroy`. Le rendu utilise `grouperParJour()` (fonction pure de `shared/date.util.ts`) au-dessus des `computed` `disponibles` / `retenus`, le compteur `N` vient de `DispoService.nombreRetenus`. La ligne est un `<button [attr.aria-pressed]>` qui émet `basculer(creneau)` : le parent appelle `DispoService.basculer()`. Aucun `MatDialog`, aucun `confirm`, aucun formulaire dans le feature.

**Conséquences :** l'état « en cours » est un `Set<string>` par service ; le composant n'a aucun état mutable propre, donc un rechargement de route repart d'un état propre et l'`onSnapshot` rejoue la vérité Firestore. Les en-têtes de jour s'appuient sur `DateGroupPipe` + `Intl.DateTimeFormat('fr-FR')` comme demandé par §F3.

## 2026-10-21 — Accessibilité : libellé F3 généré par une fonction pure

**Contexte :** F3 impose `aria-pressed` et le libellé « Disponible lundi 12 janvier de 8 h 45 à 9 h 30 ».

**Décision :** `libelleCreneauAccessible(creneau, selectionne)` (dans `shared/date.util.ts`) construit ce libellé à partir de `Intl.DateTimeFormat('fr-FR', { weekday, day, month })` et de `libelleHeure()` (« 8 h 45 »). La fonction est pure et testable sans DOM ; le composant ne fait que l'exposer en `computed`.

**Conséquences :** lisible par un lecteur d'écran, le préfixe bascule entre « Disponible » et « Retenu » selon la section, et le libellé reste correct pour les créneaux orphelines affichés dans « Mes disponibilités ».

## 2026-10-21 — Design system : alias applicatifs des rôles M3

**Contexte :** AC-17 exige que les tokens couvrent palette (`primary`/`secondary`/`tertiary` + `on-*`), surfaces (`surface`, `surfaceContainer*`), contours, type-scale M3, spacing, élévations et motion, en thème clair/sombre avec `prefers-color-scheme`. Les composants qui écrivaient `var(--mat-sys-*)` partout n'étaient pas pilotables et répetaient les mêmes noms.

**Décision :** `styles.scss` déclare un bloc d'alias applicatifs (`--app-primary`, `--app-surface-container-high`, `--app-elevation-3`, `--app-type-headline-medium`, `--app-corner-medium`…) qui pointent tous vers les rôles `--mat-sys-*` générés par `mat.theme()`. Les feuilles de style des composants ne consomment plus que ces alias. Le padding échelonné est porté par un unique token `--md-content-padding` (48 / 24 / 16 px selon le breakpoint), et `overflow-x: hidden` est posé sur `body` pour garantir l'absence de débordement à 375 px.

**Conséquences :** un changement de palette ou de type-scale se fait en un seul endroit ; `grep -c "mat.theme|--mat-sys-" src/styles.scss` = **52** lignes (AC-17 ≥ 10). Le prix : une couche d'indirection supplémentaire, acceptable vu le nombre de composants. Correction d'un token inexistant repérée au passage : `--md-motion-easing-standard` n'existe pas en M3, remplacé par `--mat-sys-motion-easing-standard` avec repli `ease`.

## 2026-10-21 — Vérification responsive manuelle dans Chrome (sans exécuter les tests)

**Contexte :** AC-17(d) et AC-19 demandent des captures ; le contrat §3 interdit à l'agent d'exécuter `playwright test`. Le contrat n'interdit pas de **constater** le rendu dans un navigateur.

**Décision :** le build de production a été servi localement par un serveur statique avec réécriture SPA (équivalent du rewrite `** → /index.html` de `firebase.json`, ce serveur n'est pas versionné) puis inspecté via CDP dans Chrome 151 en headless, aux viewports 375, 768 et 1280. Constats relevés :

| viewport | `document.documentElement.scrollWidth`        | colonnes `.page`      | padding `.contenu`                             | max-width |
| -------- | --------------------------------------------- | --------------------- | ---------------------------------------------- | --------- |
| 375      | 375 (= viewport, **aucun scroll horizontal**) | 1 (`351px`)           | `12px 16px 12px 8px` (8 à droite, 16 à gauche) | 100 %     |
| 768      | 768                                           | 1 (`720px`)           | `24px`                                         | 100 %     |
| 1280     | 1280                                          | **2** (`486px 486px`) | `48px`                                         | `1100px`  |

Autres constats : bouton « Continuer » `h=48px w=327px` et **désactivé** tant que le champ est vide ; input `font-size: 16px` (pas de zoom iOS) ; bouton « Se déconnecter » `48×48` avec `aria-label` ; au rechargement, `/dispos` est servi directement et l'en-tête affiche « Pauline » (restauration par cookie, sans repasser par `/login`) ; après « Se déconnecter », le cookie est vide et l'URL redevient `/login`. Attributs réels du cookie relevés via `Network.getAllCookies` : `httpOnly=false`, `sameSite=Lax`, `path=/`, `secure=false` (http local — `Secure` ne serait posé qu'en `https:`), expiration ≈ +1 an.

**Conséquences :** le focus automatique du champ « Prénom », exigé par F2, **ne fonctionnait pas** avec `cdkFocusInitial` seul (ce directive n'agit qu'à l'intérieur d'un `cdkTrapFocus`) : il a été remplacé par `afterNextRender(() => this.champ()?.nativeElement.focus())`, puis vérifié (`document.activeElement` = `INPUT`). Restent à la charge de l'humain : les captures d'écran du cahier et la vérification des deux listes avec de vrais créneaux (qui suppose des identifiants Firebase renseignés — sans eux, l'état affiché est l'erreur « Configuration Firebase non renseignée », ce qui est le comportement attendu).

## 2026-10-21 — Import Excel : en-têtes tolérants, lignes invalides non bloquantes

**Contexte :** F6 impose des en-têtes « insensibles à la casse/accents » et quatre colonnes (`date`, `heure_debut`|`debut`, `heure_fin`|`fin`, `libelle`). Les fichiers du monde réel s'écrivent « Date », « Heure de début », « Heure fin », « Libellé », « DATE SEANCE », « heure de fin (hh:mm) »…

**Décision :** `normaliserEntete()` réduit un en-tête à une clé sans accents, sans casse ni séparateur (« Heure de début » → `heurededebut`), puis `indexerColonnes()` recherche chaque champ **par inclusion**, dans l'ordre `date` → `heure_debut` → `heure_fin` → `libelle`, sans jamais réutiliser un même en-tête pour deux champs. Chaque ligne est validée indépendamment (date, heures, `heureFin > heureDebut`, doublon dans le fichier, doublon déjà en base via `getDocs('creneaux')`) ; les lignes invalides sont retournées avec un message français et n'empêchent pas l'import des valides. L'import écrit par `writeBatch` par lots de 500 (`TAILLE_BATCH`), en `setDoc` (upsert).

**Conséquences :** **bug corrigé grâce à une sonde hors tests** : la première implémentation comparait des clés à `_` (`heure_de_debut`) et rejetait un fichier parfaitement valide dont l'en-tête était « Heure de début » ; la sonde a produit `ErreurImport : Colonnes attendues…`, ce qui a mené à la stratégie par inclusion ci-dessus. La détection de doublon en base est tolérante à l'échec (base injoignable → on n'empêche pas l'import, les rules rejoueront le contrôle). Une ligne ne contenant qu'un libellé sans date ni heures est listée comme invalide plutôt que silencieusement ignorée : le fichier tells what's wrong.

## 2026-10-21 — Lien « Importer des créneaux » réservé aux admins connectés (mode B)

**Contexte :** l'étape 10 impose un lien d'accès dans le header « uniquement pour les admins », alors que le header est rendu par le composant racine (donc pour tous).

**Décision :** `HeaderComponent` vérifie une seule fois au démarrage si `estAdmin(uid)` est vrai, et n'affiche le lien que dans ce cas. Le mode A (anonyme) est exclu d'emblée : `adminGuard` exige `user && !user.anon`.

**Conséquences :** une seule lecture de `admins/{uid}` par session (résultat mémoïsé dans un signal) ; le lien reste absent pour les utilisateurs anonymes et les comptes Google non administrateurs, et l'accès direct à `/admin/import` reste bloqué par `adminGuard` (snackbar « Accès réservé à un administrateur » puis `/dispos`).

## 2026-10-21 — Stratégie de test : specs écrits, jamais exécutés par l'agent

**Contexte :** contrat utilisateur §3/§13 — l'agent écrit les tests, l'humain les exécute (`npm test`, `npx playwright test`). L'agent ne peut donc pas s'appuyer sur un « ça passe » pour valider son code.

**Décision :** 8 fichiers de tests écrits (≈ 86 cas) : `date.util.spec.ts`, `cookie.service.spec.ts`, `dispo.service.spec.ts`, `excel-import.service.spec.ts`, `auth.guard.spec.ts`, `dispos-page.component.spec.ts`, `app.component.spec.ts` (spec d'amorçage réécrite : elle attendait le `<h1>Hello, mesdispos</h1>` du placeholder du CLI) et `e2e/mesdispos.spec.ts`. Validation effectuée **sans exécuter les tests** : parsing TypeScript de chaque spec avec esbuild (`esbuild <fichier> --outfile=/dev/null`, 8/8 « syntaxe OK »), puis `ng build --configuration=production` (les specs sont exclues par `tsconfig.app.json`).

**Conséquences :** les specs sont **syntaxiquement** validées mais ni typées ni exécutées : une erreur de type ou un mock mal branché ne sera découvert qu'à la première exécution humaine. C'est la contrepartie directe et assumée du contrat. Pour réduire le risque, les specs mocks les points d'entrée externalisés plutôt que le SDK : `vi.mock('../core/firebase')` (les services n'importent le SDK que dynamiquement) et `vi.mock('read-excel-file')`, ce qui évite d'avoir à comprendre le protocole Firestore.

## 2026-10-21 — E2E Playwright : parcours rendu déterministe sans Firebase

**Contexte :** le parcours « login → sélection → rechargement → créneau retenu » suppose normalement un projet Firebase configuré, donc des identifiants et un réseau.

**Décision :** `e2e/mesdispos.spec.ts` intercepte les appels réseau avec `page.route('**/firestore.googleapis.com/**')` et sert des réponses JSONNEES synthétiques ; les appels Google/Firebase Auth sont interceptés et abandonnés. Le test vérifie alors la vraie logique applicative (mode A par cookie, bascule optimiste, persistance, `aria-pressed`, absence de débordement à 375 px, déconnexion).

**Conséquences :** les e2e sont reproductibles hors ligne et sans projet Firebase, mais ils ne valident **pas** l'intégration Firestore réelle ni les règles de sécurité — qui restent couvertes par `firestore.rules` + un déploiement de test par l'humain. Les navigateurs Playwright ne sont pas installés dans cet environnement (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) : `npm run test:e2e:install` est nécessaire avant `npm run test:e2e`.

## 2026-10-21 — Thème Material 3 : palette azure, densité −1 (compacte)

**Contexte :** §3 impose la dernière spécification Material 3 — `mat.theme()`, tokens `--mat-sys-*`, palette `primary`/`secondary`/`tertiary`, type-scale complète, courbes et durées de motion, thème clair par défaut avec bascule `prefers-color-scheme`, et des « interfaces épurées » : densité compacte, un seul niveau d'élévation, espacement 4/8/12/16/24/32 px, aucun chrome décoratif.

**Décision :** `styles.scss` applique `mat.theme()` deux fois (clair et sombre via `prefers-color-scheme`) avec `primary: mat.$azure-palette`, `tertiary: mat.$blue-palette`, `typography: Roboto` et `density: -1` (compacte). Les composants n'utilisent que des alias `--app-*` (§ ADR « alias applicatifs »). Élévation : **un seul niveau** (`--app-elevation-1`) sur la carte de connexion, les lignes de créneau sont plates (contour `outline-variant`) ; aucun dégradé, aucune ombre décorative ; seuls les rôles M3 `error` et `tertiary` portent une couleur d'état.

**Conséquences :** le thème suit le réglage système sans JavaScript et sans cookie. La densité `-1` est passée via `mat.theme(density: var(--md-density-default))` : la variable CSS est résolue au moment de la génération des tokens Material, et non à l'exécution. Le choix de la palette (azure) est esthétique et modifiable en une ligne dans `styles.scss`.

## 2026-10-21 — Vitest comme runner `ng test`

**Contexte :** §4 impose « Vitest (builder `ng test`) » pour les unitaires et Playwright pour l'e2e, sans Karma ni Chrome requis.

**Décision :** le target `test` d'`angular.json` utilise le builder `@angular/build:unit-test` avec `runner: vitest`, `tsConfig: tsconfig.spec.json` et `buildTarget: mesdispos:build:development`. L'environnement d'exécution par défaut est **jsdom** (déjà présent en devDependency), ce qui évite tout téléchargement de navigateur pour `npm test`. Scripts : `test`, `test:watch`, `test:e2e`, `test:e2e:install`, `format`, `format:check`.

**Conséquences :** la suite s'exécute sans Chrome et sans launcher : `npm test` suffit après `npm ci`. Les specs importent explicitement leurs fonctions Vitest (`import { describe, it, expect, vi } from 'vitest'`) plutôt que de compter sur les globals, ce qui les rend robustes à la configuration du runner. `jsdom` fournit `document.cookie` : `cookie.service.spec.ts` peut vérifier la chaîne de cookie réellement écrite (SameSite/Max-Age/Path, absence de HttpOnly).

## 2026-10-21 — Récapitulatif : ce qui a été livré et ce qui reste hors périmètre

**Contexte :** le §13 du cahier liste des interdictions strictes et le §15 demande un résumé final.

**Décision :** application livrée : mode A (cookie) + mode B (Google), deux listes, toggle immédiat avec rollback et rejeu, import `.xlsx` avec prévisualisation, règles/indexes/émulateurs, CI sans tests, 8 fichiers de tests écrits et non exécutés, journal ADR de 28 entrées.

**Conséquences :** restent **volontairement** hors périmètre, conformément au §13 : pas de `@angular/fire`, pas de Cloud Functions ni de backend, pas de `.xls`, pas de bouton d'enregistrement, pas de `localStorage`, pas d'analytics ni de cookie tiers, pas de librairie UI hors Material/CDK, pas d'UI d'export des disponibilités (les données se lisent dans la console Firebase), pas d'email/SMS/push. Restent à la charge de l'humain : la configuration Firebase (`REPLACE_ME_*`), le `.firebaserc`, la création du premier `admins/{uid}`, le déploiement des règles, l'exécution des tests et les captures d'écran.

## 2026-11-02 — Simplification d'ensemble : un backend par fichier, abonnement synchrone, code mort retiré

**Contexte :** l'abstraction Firestore/XLSX avait été introduite en quatre fichiers (`firestore.backend.ts` + `firestore.backend.reel.ts`, `xlsx.backend.ts` + `xlsx.backend.reel.ts`) pour contourner la désactivation de `vi.mock` sur les imports relatifs par le builder `@angular/build:unit-test`. Chaque service reproduisait ensuite la même danse d'abonnement asynchrone (`ecouter()` → `brancher()` → `annule`/`interne`), et quelques membres publics n'étaient plus référencés nulle part.

**Décision :**

- le contrat et son implémentation production sont **réunis dans un seul fichier** par backend (`core/firestore.backend.ts`, `core/xlsx.backend.ts`) : quatre fichiers deviennent deux, sans changer l'injection (`FIRESTORE_BACKEND`, `XLSX_BACKEND`) ni le câblage de `app.config.ts` ;
- `ecouterCreneaux()` / `ecouterDispos()` renvoient désormais une **`Abonnement` synchrone** (`() => void`) : la gestion du chargement asynchrone du SDK (import dynamique) est concentrée dans `FirestoreReelBackend.suivre()`, et `CreneauService`/`DispoService` n'ont plus qu'une branche d'abonnement lisible ;
- la construction du document `dispos` est factorisée (`DispoService.documentDispo()`), le découpage par lots de 500 est défini une seule fois (`TAILLE_BATCH` dans le backend), et la conversion `'YYYY-MM-DD'` → `Date` locale est mutualisée (`shared/date.util.ts` → `dateLocale()`, utilisé par le pipe et le libellé d'accessibilité) ;
- suppression du code mort : `creneauCoherent()`, `AuthService.deconnecter()`, `AuthService.uidAnonyme()`, `AuthService.connecte`, `AuthService.domaineRefuse` (écrit mais jamais lu), `ImportComponent.groupsValides`, `HeaderComponent.url` ; `core/firebase.ts` n'exporte plus `chargerApp()`/`firebaseApp()` (privés) ni `firebaseConfigure` (ré-export supprimé).

**Conséquences :** l'API publique des services est inchangée hormis les membres morts listés ci-dessus ; les specs fournissent désormais des faux backends **synchrones** (`ecouterCreneaux: () => () => undefined`), ce qui simplifie les doublures. La désinscription reste synchrone comme l'exige le §7, et l'erreur de lecture est toujours signalée via le callback `erreur` (y compris si le chargement du SDK échoue). Vérifié par `npx tsc --noEmit` (sortie vide) et `ng build --configuration=production` (exit 0) ; les tests n'ont pas été exécutés (contrat §3/§13).

## 2026-11-02 — Règles Firestore : portée de `uid` dans les fonctions et déploiement effectif

**Contexte :** l'utilisateur signalait « Impossible de lire les créneaux. Vérifiez votre connexion. » alors que la configuration Firebase était complète. Le diagnostic a montré (1) des règles déployées sur `mesdispos-db623` différentes du fichier du dépôt (lecture de `creneaux` refusée sans session : `403 PERMISSION_DENIED`), et (2) deux défauts dans les règles elles-mêmes : un `fieldOverrides` sans `fieldPath` (rejet du CLI : « Must contain "fieldPath" ») et une fonction de rules qui lisait la variable de chemin `{uid}` sans la recevoir en paramètre (avertissement du compilateur « Invalid variable name: uid »), ce qui rendait la branche anonyme (mode A) inopérante.

**Décision :**

- `firestore.rules` : `function uidAnonymeValide(uid)` reçoit désormais le `uid` en paramètre et l'appel devient `uidAnonymeValide(uid)` — une fonction de rules **ne capture pas** les variables du `match` englobant ;
- `firestore.indexes.json` : aucune surcharge de champ n'est nécessaire (toutes les lectures sont mono-collection, `dispos` étant dénormalisé) → `fieldOverrides: []`, avec une seule clé `//` de commentaire (les clés `//` dupliquées écrasaient la première et concaténaient la preuve README dans la valeur) ;
- déploiement effectué sur `mesdispos-db623` : règles et index publiés sans avertissement ; lecture anonyme de `creneaux` → `200`, écriture/suppression anonymes dans `users/anon_<sha256[:12]>/dispos` → `200` (vérifié par requêtes REST directes, document de test supprimé).

**Conséquences :** le mode A (« Nom seul ») est de nouveau opérationnel sur le projet réel. La lecture des messages d'erreur a été enrichie dans le même temps : `raisonErreurFirestore()` traduit le code d'erreur SDK (`permission-denied`, `unavailable`, `not-found`, …) en message actionnable et journalise l'erreur brute dans la console, au lieu du seul libellé générique. Reste à la charge de l'humain : importer des créneaux (la collection `creneaux` est vide) via `/admin/import`, ce qui suppose un document `admins/{uid}` créé dans la console.

## 2026-11-02 — Connexion : liste déroulante des professeurs (API Oasis `/api/v1/profs`)

**Contexte :** le mode A « Nom seul » demandait à l'utilisateur de saisir librement son prénom, ce qui produit des identités ambiguës (« Pauline » n'identifie personne) et des partitions Firestore distinctes pour un même enseignant. L'API REST Oasis expose la liste des enseignants : `GET /api/v1/profs` (route `Ldap\ProfCtrl::selectProfs`, documentation `https://test.ensad.oasispro.fr/testapi/v1/doc#/Professeurs/…`), déjà encapsulée dans `core/cours.services.ts` (`getProfs()`).

**Décision :**

- le champ texte « Prénom » de `/login` est remplacé par une **liste déroulante** (`mat-select`) alimentée par `ProfService` (`data/prof.service.ts`), qui appelle `CoursServices.getProfs()` via le proxy `https://proxyensad.af10.fr` (défini au build dans `angular.json`, `define.proxy`) sur l'année **`year=2026`** ;
- `normaliserProfs()` (fonction **pure**, testée dans `prof.service.spec.ts`) dédoublonne la réponse par `login` (l'API renvoie chaque enseignant plusieurs fois : 784 entrées pour 399 enseignants, dont 389 présents), écarte les sortants (`present !== 'ACT'`) et trie par nom complet (`localeCompare('fr')`) ;
- le schéma `ProfSchema` est intégralement typé dans `core/cours.services.ts` (`ProfOasis`), y compris `subjects`, dont la forme réelle est un tableau d'objets `{ code, year, description }` — et non `["Art"]` comme l'annonce la documentation. `libellesSubjects()` tolère les deux formes (chaîne ou objet) et n'en garde que le `code` ;
- une entrée malformée est **ignorée** (`construireProf()` sous `try/catch`) : elle ne doit pas faire échouer les 388 autres ;
- le nom affiché est `« Prénom NOM »` ; c'est cette valeur qui est conservée dans le cookie `mesdispos_nom` et qui dérive l'`uid` anonyme (`sha256(nom)`), donc l'identité reste stable d'une visite à l'autre sans appel à Firebase ;
- l'option **« Autre nom (saisie libre) »** subsiste dans la liste : le cahier F2 autorise un pseudonyme, et l'enseignant peut ne pas figurer dans l'annuaire de l'année interrogée ;
- au rechargement, `LoginComponent.reprendreNomDuCookie()` resélectionne l'enseignant correspondant au cookie ; si le nom mémorisé n'est pas dans la liste (pseudonyme, annuaire modifié), la saisie libre est restaurée ;
- `provideHttpClient(withFetch())` est ajouté à `app.config.ts` (Angular 22 : `HttpClientModule` n'existe plus).

**Conséquences :** l'identite est fiabilisée (un enseignant = un `uid` anonyme stable) au prix d'une dépendance réseau au chargement de `/login` : le parcours mode A n'est plus « sans réseau » (F2) et échoue si l'API est indisponible — un message « Liste des professeurs indisponible. Réessayer » avec bouton **Réessayer** est alors affiché, la saisie libre est activée d'emblée et l'utilisateur peut continuer. La liste (~390 entrées) est chargée une fois par session d'onglet et conservée en mémoire, jamais en `localStorage` (§13). Le corps du cookie est désormais un nom complet au lieu d'un prénom : les identifiants anonymes existants (dérivés d'un prénom seul) ne sont **pas** repris — les disponibilités déjà déclarées sous l'ancien identifiant restent orphelines, à déclarer de nouveau.

**Point d'attention (à traiter par l'humain) :** le proxy `proxyensad.af10.fr` applique une **liste blanche d'origines CORS** qui ne contient aujourd'hui que `https://planning.ensad.fr` et `http://localhost:4200` (vérifié par `curl -H "Origin: …"` : les origines Firebase de MesDispos reçoivent `403 Forbidden`). Il faut y ajouter `https://mesdispos-db623.web.app` et `https://mesdispos-db623.firebaseapp.com`, sinon la liste des professeurs reste vide en production. Le repli « Autre nom (saisie libre) » permet de continuer en attendant.

## 2026-11-02 — Suppression de l'authentification Google : session « nom seul » + Firebase Auth anonyme pour l'admin

**Contexte :** l'application proposait deux modes de connexion (F2) : le mode A « Nom seul » (cookie `mesdispos_nom`) et le mode B « Google » (popup/redirect Firebase Auth). La demande de l'utilisateur est de **supprimer la possibilité de s'authentifier avec Google**. Restait à trancher l'accès à l'espace administrateur (`/admin/import`), jusque-là réservé au mode B (F2 : « l'accès admin reste exclusivement mode B »).

**Décision :**

- **Google est retiré de l'application** : plus de `GoogleAuthProvider`, plus de `signInWithPopup`/`signInWithRedirect`, plus de `ALLOWED_EMAIL_DOMAINS` ni de `domaineAutorise()` dans `environments/firebase.config.ts`. Le bouton « Continuer avec Google » disparaît de `/login` ;
- **l'espace administrateur passe par Firebase Auth _anonyme_** (`signInAnonymously`, persistance `browserLocalPersistence`) : la session obtenue porte un `uid` qui doit être inscrit dans la collection `admins` (`admins/{uid}`) — la console Firebase reste le seul moyen de nommer un admin (`allow write: if false`). La page `/login` affiche, sur demande (`?retour=/admin/import`), un encart « Espace administrateur » qui crée cette session et affiche l'`uid` obtenu, afin que l'humain puisse l'inscrire dans la console ;
- **deux signaux distincts** dans `AuthService` : `user` (identité d'usage — session « nom seul » si le cookie existe, sinon la session Firebase) et `sessionAdmin` (session Firebase anonyme, seule habilitée à `adminGuard`). `Utilisateur` remplace les champs `anon`/`email`/`photoURL` par `session: 'nom' | 'firebase'` ;
- `AuthService.uidEcriture()` détermine le chemin d'écriture des disponibilités : partition `anon_<sha256[:12]>` pour une session « nom seul », `uid` Firebase sinon ;
- `firestore.rules` : la branche anonyme accepte désormais `uid.matches('^anon_[0-9a-f]{12}$')` **indépendamment** de `request.auth` (une session Firebase résiduelle ne doit pas fermer la partition d'un professeur), et la lecture des créneaux reste ouverte (`allow read: if true`) ;
- le header n'affiche plus de photo (plus de `photoURL`) : l'avatar ne porte que l'initiale.

**Conséquences :** aucune donnée personnelle (email, nom de compte, photo) n'est plus transmise à Firebase — l'admin est un `uid` opaque, ce qui simplifie le volet RGPD (« nom et disponibilités »). Le parcours professeur est inchangé (cookie, aucun appel Auth). L'accès administrateur exige deux étapes côté humain (créer la session, puis inscrire l'`uid` dans `admins`), ce qui est plus lourd que l'ancien bouton Google mais évite toute dépendance à un fournisseur d'identité tiers. `ALLOWED_EMAIL_DOMAINS` disparaît : le filtrage par domaine n'a plus d'objet.

## 2026-11-02 — Google rétabli pour l'administrateur uniquement

**Contexte :** la décision précédente retirait entièrement Google et faisait passer l'admin par une session Firebase anonyme. L'utilisateur demande désormais de **supprimer Google pour les professeurs mais de le conserver pour la page admin**.

**Décision :**

- **professeurs : aucun changement** — session « nom seul » par cookie (`mesdispos_nom`), liste des enseignants Oasis, aucun appel Firebase Auth. Aucun bouton Google n'est visible sur le parcours professeur ;
- **espace administrateur : retour à Firebase Auth Google** (`GoogleAuthProvider`, popup sur desktop, redirect sur mobile, persistance locale). `AuthService.connecterGoogle()` alimente `sessionAdmin` ; l'encart « Espace administrateur » de `/login` (affiché quand `?retour=/admin/import`) ne propose plus la saisie d'un nom mais « Connexion avec Google » ;
- `adminGuard` reste fondé sur `admins/{uid}` : l'`uid` Google doit y être inscrit depuis la console Firebase (`allow write: if false`). `authGuard` accepte indifféremment la session « nom seul » (professeur) et la session Google (admin) ;
- au retour d'un redirect mobile, `onAuthStateChanged` restaure `sessionAdmin` et la page `/login` vérifie automatiquement `admins/{uid}` avant d'ouvrir l'import ;
- le bouton « Se déconnecter » efface le cookie et ferme la session Google si elle existe.

**Conséquences :** les professeurs restent sans authentification tierce (parcours mobile inchangé, aucun popup). L'admin réutilise un compte Google existant : une seule étape humaine (inscrire son `uid` dans `admins`) au lieu de créer puis autoriser une session anonyme. Le fournisseur Google doit être activé dans la console Firebase. Les données personnelles de l'admin (e-mail/nom de compte) sont de nouveau visibles côté Firebase Auth, mais celles des professeurs ne le sont pas.

## 2026-11-03 — Import des créneaux : réservation explicite à l'administrateur (`AdminService`)

**Contexte :** l'import des créneaux (`/admin/import`) était déjà protégé par `adminGuard` (session Firebase inscrite dans `admins`) et par les `firestore.rules` (`creneaux` en écriture admin seule). La vérification du droit d'administration était toutefois **dupliquée** — dans `adminGuard` (via `FIRESTORE_BACKEND`) et dans `HeaderComponent` (effet local) — et l'interface d'import ne reposait que sur le guard : un accès direct au composant par un autre chemin (lien profond, onglet déjà monté) aurait affiché la zone de dépôt sans contrôle supplémentaire.

**Décision :**

- **`core/admin.service.ts` (`AdminService`)** devient la source de vérité unique : il expose `uid` (uid de la session Firebase), `autorise` (vrai si `admins/{uid}` existe) et `verifie` (la vérification a eu lieu), et centralise la lecture `FIRESTORE_BACKEND.estAdmin()` ;
- **`adminGuard`** passe par `AdminService.verifier()` ; **`HeaderComponent`** consomme `AdminService.autorise` (plus d'effet local) : le lien « Importer des créneaux » n'apparaît que pour un administrateur ;
- **`ImportComponent`** applique une seconde barrière, côté interface : la zone de dépôt n'est affichée qu'à un administrateur (sinon message « Accès réservé à un administrateur »), et `choisirFichier()` / `analyser()` / `importer()` refusent l'action si la session n'est pas administrative ;
- la **session « nom seul »** (cookie `mesdispos_nom`) n'est **jamais** habilitée : `AdminService.uid` ne lit que `AuthService.sessionAdmin` (session Firebase). Un professeur reste donc administrateur sur un poste partagé ;
- `firestore.rules` reste la garantie de fond : l'écriture dans `creneaux` exige `request.auth != null` **et** l'existence de `admins/{request.auth.uid}` — un import non autorisé est refusé par Firestore même si l'interface est contournée.

**Conséquences :** trois barrières cohérentes et un seul point de lecture de `admins/{uid}` (au lieu de deux), donc une seule requête par session admin. Le message « Accès réservé à un administrateur » est désormais affiché aussi bien par le guard que par la page d'import. La session Firebase admin étant conservée par le navigateur (persistance locale), un professeur partageant le poste d'un administrateur reste bloqué côté interface par la présence de la session admin — c'est une limite inhérente à l'authentification par session, à lever par une déconnexion admin.

## 2026-11-03 — Suppression de tous les créneaux depuis l'espace administrateur

**Contexte :** l'espace administrateur ne permettait que l'import Excel (`/admin/import`). Réinitialiser la proposition de créneaux (nouvelle période, correction d'un import erroné) obligeait à supprimer les documents un par un depuis la console Firebase.

**Décision :**

- **nouvelle action `CreneauService.supprimerTous()`** adossée à un `writeBatch.delete` par lots de 500 (`TAILLE_BATCH`), exposée dans le contrat `FirestoreBackend.supprimerTousCreneaux()` ; le signal `creneaux` est vidé après succès ;
- **zone de danger dans `ImportComponent`**, visible seulement pour un administrateur vérifié, avec **confirmation en deux temps** (bouton « Supprimer tous les créneaux » → encart d'avertissement + « Annuler » / « Supprimer définitivement ») : la suppression est irréversible, un simple clic serait trop risqué — cette confirmation ne contredit pas le « pas de bouton Enregistrer » de F4, qui porte sur la déclaration de disponibilités ;
- **les disponibilités des professeurs sont conservées** : seuls les documents `creneaux` sont supprimés ; les dispos orphelines restent lisibles (tolérance déjà actée en §14 de l'AGENTS.md) ;
- **la sécurité reste portée par Firestore** : `firestore.rules` n'autorise le `delete` sur `creneaux` qu'à `admins/{uid}` ; l'interface ne fait que refléter ce droit.

**Conséquences :** l'administrateur peut réinitialiser les créneaux en une action confirmée, sans passer par la console Firebase. Les professeurs ayant déjà coché des créneaux voient ceux-ci disparaître de « Mes disponibilités » (jointure mémoire vide) ; une réimportation avec les mêmes identifiants rétablit la correspondance sans réécriture côté professeur.

## 2026-11-03 — Suppression des disponibilités des professeurs depuis l'espace administrateur

**Contexte :** pour réinitialiser une campagne de déclaration, l'administrateur devait supprimer chaque document `users/{uid}/dispos/{creneauId}` depuis la console Firebase, partition par partition. Les règles interdisaient par ailleurs tout accès d'un admin aux disponibilités des professeurs.

**Décision :**

- **`FirestoreBackend.supprimerToutesDispos()`** liste les disponibilités avec `collectionGroup('dispos')` (une seule requête couvrant toutes les partitions `users/*`), puis les supprime par `writeBatch.delete`, lots de 500 ;
- **`AdminService.supprimerToutesLesDispos()`** porte l'action et vérifie `autorise()` avant l'écriture ; l'interface (`ImportComponent`, seconde « zone de danger ») applique la même règle et une **confirmation en deux temps** (action irréversible) ;
- **`firestore.rules`** gagne une branche _collection group_ `match /{chemin=**}/dispos/{creneauId} { allow read, delete: if admin(); }` : les règles de partition `match /users/{uid}/dispos/...` ne s'appliquent pas aux requêtes _collection group_, il fallait donc une règle explicite. Les professeurs conservent l'écriture unitaire via leur règle de partition ; Firestore accorde l'accès dès qu'une règle l'autorise ;
- **les créneaux proposés sont conservés** : seule la déclaration des professeurs est effacée. Les `Dispo` de l'éventuel admin sont supprimées aussi (ce sont des déclarations comme les autres).

**Conséquences :** une seule requête et un seul bouton suffisent à repartir de zéro côté déclarations. `collectionGroup('dispos')` est un balayage sans filtre ni tri : aucun index composite n'est requis (`firestore.indexes.json` inchangé). Coût : une lecture par document `dispo` avant suppression — acceptable pour quelques centaines de déclarations.

## 2026-11-03 — Bouton d'appel à l'API planning locale (développement uniquement)

**Contexte :** l'écran d'administration (/admin/import) devait pouvoir déclencher la méthode `get_filtered_json` de `AutoPlanning/api.py` (route `GET /calendar/json`) exposée par le serveur Flask local, sans que ce lien soit disponible en production.

**Décision :**

- **nouveau service `core/planning-api.service.ts`** encapsulant l'appel HTTP (`HttpClient` + `firstValueFrom`), l'état de chargement, les entrées reçues et le message d'erreur ; l'URL de base est la constante `API_PLANNING_URL = 'http://localhost:8000'` (port de `app.run(debug=True, port=8000)`), route `ROUTE_CALENDAR_JSON = '/calendar/json'` ;
- **le service est neutralisé hors développement** : `actif` vaut `isDevMode()`, la section « API planning locale » du template n'est donc rendue qu'en développement ; aucune requête HTTP n'est émise en production ;
- **filtres optionnels** : le champ « Filtres (tags) » alimente le paramètre `?tags=a,b` de la route ;
- **résultat affiché** dans un `<details>` (nombre d'entrées + JSON brut), aucune écriture Firestore n'est faite par ce bouton ;
- **CORS ajouté côté Flask** (`after_request` : `Access-Control-Allow-Origin: *`) car l'origine Angular (`localhost:4200`) diffère de celle du serveur Flask.

**Conséquences :** le bouton est un outil de débogage local, hors périmètre produit (aucune donnée envoyée sur Firebase). Le port 8000 est centralisé dans une constante : à ajuster si le serveur Flask écoute sur 5000 (port cité dans les docstrings de `api.py`).

## 2026-11-03 — Identité du professeur dans la collection `users` (login, nom, prénom)

**Contexte :** la collection `users` ne contenait que la sous-collection `dispos` : la partition `users/{uid}` était anonyme et la console Firebase ne permitait pas de rattacher une déclaration à un professeur. L'API Oasis fournit pourtant une identité stable (`login` LDAP, `nom`, `prénom`).

**Décision :**

- **un document de profil `users/{uid}`** = `{ login, nom, prenom, updatedAt }`, écrit à la connexion (`AuthService.connecterParNom()` → `ProfilService.enregistrer()`) ; l'écriture est _best effort_ : un échec n'empêche jamais la déclaration de disponibilités ;
- **dénormalisation dans chaque `users/{uid}/dispos/{creneauId}`** : `login`, `nom` et `prenom` sont recopiés dans le document de disponibilité (`DispoService.documentDispo()` via `AuthService.identiteEcriture()`), pour que la lecture des dispos en console identifie le professeur sans jointure ;
- **saisie libre (« Autre nom ») : `login` et `nom` vides**, seul le `prénom` saisi est connu — on n'invente pas d'identifiant LDAP ;
- **restauration de session** : le cookie `mesdispos_nom` ne porte que le nom ; le profil complet est relu depuis `users/{uid}` (`ProfilService.charger()`) au démarrage, sans requête supplémentaire si la configuration Firebase est absente ;
- **contrat `FirestoreBackend`** étendu de `setProfil(uid, data)` et `lireProfil(uid)` (le module Firestore n'est jamais importé directement par les services) ;
- **`firestore.rules`** gagne `match /users/{uid} { allow read, write: if (connecte() && request.auth.uid == uid) || uidAnonymeValide(uid); }` : le profil n'est accessible qu'à son titulaire, comme les disponibilités.

**Conséquences :** l'identité du professeur est enfin lisible dans Firestore (RGPD : le `login` et le `prénom` sont désormais conservés en base, ce qui contredit le §5 initial d'AGENTS.md « pas de miroir Firestore du prénom » — la décision du besoin utilisateur prime, elle est documentée ici et dans le README). Le document de profil n'est écrit qu'à la connexion : un professeur qui n'a jamais coché de créneau n'apparaît pas dans la collection `users`.

## 2026-11-03 — `permission-denied` sur `users/{uid}` : règles déployées désynchronisées du dépôt

**Contexte :** l'utilisateur signalait une `FirebaseError: Missing or insufficient permissions.` lors de l'écriture du profil du professeur (`users/{uid}`, nouveau chemin introduit le 2026-11-02 par `ProfilService.enregistrer()`). Le fichier `firestore.rules` du dépôt contenait bien la règle `match /users/{uid} { allow read, write: if (connecte() && request.auth.uid == uid) || uidAnonymeValide(uid); }`, mais **les règles déployées sur `mesdispos-db623` dataient du déploiement précédent** : la branche `users/{uid}` n'y figurait pas.

**Diagnostic (par requêtes REST directes sur l'API Firestore, sans session) :**

| Chemin testé                                        | Avant déploiement         | Après déploiement |
| --------------------------------------------------- | ------------------------- | ----------------- |
| `PATCH users/anon_0123456789ab`                     | **403 PERMISSION_DENIED** | 200               |
| `PATCH users/anon_0123456789ab/dispos/test_creneau` | 200                       | 200               |
| `GET creneaux`                                      | 200                       | 200               |

Le refus portait **uniquement** sur le document de profil : les disponibilités et la lecture des créneaux n'étaient pas concernées. Cela confirmait un désynchronisation « règles déployées ≠ règles du dépôt » et non un bug de code applicatif (ni `uid` mal formé, ni session Firebase absente, ni configuration erronée).

**Décision :**

- **déploiement effectif** de `firestore.rules` sur `mesdispos-db623` (`firebase deploy --only firestore:rules --project mesdispos-db623`) : compilation sans erreur, règles publiées ;
- **vérification par sonde REST** après déploiement (écriture + lecture de `users/anon_…` et de `users/anon_…/dispos/…`, documents de test supprimés) ;
- **règle de travail** : toute modification de `firestore.rules` dans le dépôt doit être suivie d'un redéploiement immédiat, sinon l'application écrit contre des règles périmées. Le dépôt ne peut pas être la référence de vérité du comportement runtime sans ce redéploiement ;
- **aucune modification du code applicatif** : le client écrivait déjà au bon chemin avec le bon `uid`.

**Conséquences :** le transfert du professeur vers Firestore fonctionne à nouveau (profil `users/{uid}` + disponibilités `users/{uid}/dispos/{creneauId}`). Les documents de sonde (`users/anon_0123456789ab` et ses `dispos`) ont été supprimés après vérification — la base ne contient aucun résidu de test. Le build de production a été rejoué (`ng build --configuration=production`, exit 0) sans modification de code.

## 2026-11-03 — Attribution automatique de créneaux à des professeurs (espace administrateur)

**Contexte :** l'utilisateur demande, dans le module administrateur, « une zone permettant de saisir une liste de login et un nombre de créneau, puis fabriquer automatiquement une liste de créneau pour chacun de ses professeurs **comme si eux même l'aient saisie** ». Autrement dit : l'administrateur veut pouvoir declarer à la place de plusieurs professeurs leurs disponibilités, et que le résultat en base soit indiscernable d'une déclaration faite par le professeur lui-même (clic par clic).

**Décision :**

- **nouveau service `data/attribution.service.ts`** : il calcule un _plan_ (aucune écriture) puis l'applique. Deux fonctions pures sont extraites pour être testables : `parserLogins()` (découpe de la saisie) et `choisirCreneaux()` (sélection chronologique hors créneaux déjà retenus) ;
- **résolution de l'`uid`** : la partition Firestore d'un professeur est `anon_<sha256(nom affiché)[:12]>`. L'attribution la **recalcule** depuis la fiche Oasis du `login` saisi, via `utilisateurAnonyme(prof.nomComplet)` — exactement le même calcul que la connexion « liste Oasis ». C'est le seul moyen d'atteindre la bonne partition sans connaître le nom que le professeur a réellement saisi ;
- **documents écrits** : `users/{uid}/dispos/{creneauId}` avec la **même forme** que celle de `DispoService.documentDispo()` (`creneauId`, `date`, `heureDebut`, `heureFin`, `libelle?`, `login`, `nom`, `prenom`, `updatedAt`), plus le document de profil `users/{uid}`. Écriture par batch de 500 (`upsertDispos`) ;
- **prévisualisation obligatoire** : le plan est affiché (professeurs résolus, créneaux déjà retenus, créneaux attribués, logins inconnus) et une confirmation explicite précède l'écriture ;
- **extension du contrat `FirestoreBackend`** : `lireIdsDispos(uid)` (créneaux déjà retenus) et `upsertDispos(items)` (écriture groupée) ;
- **`firestore.rules`** : l'administrateur inscrit dans `admins/{uid}` obtient désormais l'écriture dans **toute** partition `users/{uid}` et `users/{uid}/dispos/…` (`|| admin()`). C'est la contrepartie nécessaire de la fonction. Les règles ont été **redéployées** sur `mesdispos-db623` et vérifiées par sonde REST ;
- **interface** : nouvelle zone `features/admin/attribution.component.*`, intégrée à la page `/admin/import` (et non une route séparée : la navigation administrateur reste simple), visible uniquement pour un administrateur authentifié.

**Limite assumée :** un professeur qui a utilisé la **saisie libre** (« Autre nom ») a un `uid` dérivé du prénom saisi — il n'est donc pas atteignable par `login`. L'attribution vise le professeur tel qu'il s'identifie dans la liste Oasis. Ce point est signalé dans le README et dans l'interface.

**Conséquences :** l'administrateur peut déclarer des disponibilités en une seule manipulation pour un groupe de professeurs. La logique reste testable (fonctions pures + faux backend), l'écriture est idempotente (`setDoc`) — relancer l'attribution réécrit les mêmes documents sans les dupliquer. La règle `|| admin()` élargit volontairement le pouvoir de l'administrateur : c'est le prix de la fonction, et il est explicite dans `firestore.rules`.

## 2026-11-04 — Calendrier des créneaux (plug-in `angular-calendar`)

**Contexte :** la page `/dispos` présentait les créneaux uniquement sous forme de deux listes (disponibles / retenus), groupées par jour. Le besoin utilisateur est de **voir les créneaux dans un calendrier**, au fil des créneaux ajoutés, pour lire la chronologie (et les chevauchements) d'un coup d'œil.

**Décision :**

- le plug-in [`angular-calendar`](https://www.npmjs.com/package/angular-calendar) `0.32.2` est ajouté en dépendance, avec l'adaptateur `date-fns` (`angular-calendar/date-adapters/date-fns`) et ses peers `angular-draggable-droppable` / `angular-resizable-element` ;
- la feuille de style du plug-in est déclarée dans `angular.json` (`styles`), **avant** `src/styles.scss` : les couleurs par défaut (bleu 2003) sont ensuite remplacées par les rôles M3 de l'application (`--mat-sys-*`) via `::ng-deep` dans `creneau-calendar.component.scss` ;
- le calendrier est une **troisième représentation** des mêmes données que les deux listes : il ne stocke rien et n'écrit jamais directement. Un clic sur un événement émet `basculer(creneau)` vers `DispoService` — donc **le clic reste l'enregistrement** (F4), avec rollback + snackbar en cas d'échec ;
- deux vues sont proposées : « semaine » (7 colonnes) et « jour ». Sur smartphone (< 900 px), la vue **jour** est retenue par défaut : 7 colonnes sont illisibles ;
- la conversion `Creneau` → événement passe par une fonction **pure** `creneauVersIntervalle()` (`shared/date.util.ts`) : elle reconstruit un `Date` **local** à partir des chaînes `'YYYY-MM-DD'` et `'HH:mm'`. Aucun `Date` n'est persisté (AGENTS.md §13) : le `Date` n'existe que pour le rendu ;
- la navigation (semaine précédente / aujourd'hui / semaine suivante) utilise les directives `mwlCalendarPreviousView` / `mwlCalendarToday` / `mwlCalendarNextView` ; le titre est produit par le pipe `calendarDate` en locale `fr`, semaine démarrant le lundi (`weekStartsOn = 1`) ;
- la plage horaire affichée est bornée par les créneaux eux-mêmes (`heureDebut()` / `heureFin()`), pour éviter une grille de 24 heures en grande partie vide ;
- le budget `initial` du build passe de 500 kB à 600 kB (le plug-in ajoute ~19 kB au bundle initial, sous le seuil d'erreur de 1 MB).

**Conséquences :** la page `/dispos` gagne une section « Calendrier des créneaux » au-dessus des deux listes (pleine largeur sur desktop). Le bundle initial grossit d'environ 19 kB ; les chunks `dispos-page-component` et `index-esm` embarquent le plug-in. Les tests unitaires du calendrier (`creneau-calendar.component.spec.ts`) et de `creneauVersIntervalle()` sont **écrits mais non exécutés**, conformément au contrat de vérification (§3).

## 2026-11-04 — Liste des disponibles au-dessus du calendrier, calendrier = mes disponibilités
**Contexte :** la page `/dispos` affichait le calendrier (tous les créneaux) **au-dessus** des listes, puis les listes `Créneaux disponibles` et `Mes disponibilités`. Les disponibilités de l'utilisateur étaient donc montrées deux fois (liste + calendrier) et la liste des disponibles était reléguée sous le calendrier.
**Décision :**
- l'ordre de la page est inversé : `Créneaux disponibles` (liste groupée par jour) **puis** `Mes disponibilités` ;
- le calendrier n'affiche **plus que les créneaux retenus** par l'utilisateur (source : `DispoService.retenus()`) : la sélection d'un créneau dans la liste fait apparaître l'événement dans le calendrier, et l'ensemble des disponibilités de l'utilisateur y est visible ;
- la liste `Mes disponibilités` (doublon) est supprimée : le compteur `(N)` est conservé dans le titre de la section `Mes disponibilités` qui encadre le calendrier ;
- dans le calendrier, un clic sur un événement **retire** la disponibilité (et non l'ajoute) ;
- le calendrier se repositionne sur le jour d'un créneau nouvellement retenu (`effect` sur les identifiants connus), sans bouger lors d'une désélection.
**Conséquences :** la lecture est plus directe (la liste propose, le calendrier récapitule). Le plug-in `angular-calendar` n'affiche plus les créneaux non retenus : la légende est simplifiée. Tests unitaires écrits mais non exécutés (contrat §3).


## 2026-11-04 — Correction de l'affichage des créneaux dans le calendrier
**Contexte :** le calendrier n'affichait aucun créneau : seule une barre verte (le liseré des en-têtes de jours) était visible.
**Diagnostic :** deux défauts cumulés.
1. `creneauVersIntervalle()` (`shared/date.util.ts`) utilisait une regex **sans groupe capturant** (`/^\d{1,2}:\d{2}$/`) : `exec()[1]` valait `undefined`, `parseInt` renvoyait `NaN` et les `Date` d'événement étaient **invalides** (`Invalid Date`). Le plug-in `angular-calendar` ignorait alors tous les événements.
2. Le plug-in applique `event.cssClass` sur le **conteneur** `.cal-event-container`, et non sur le `.cal-event` intérieur. Les sélecteurs CSS de l'application (`.cal-event.creneau-evenement`) ne correspondaient donc jamais : les créneaux seraient restés sans fond ni liseré.
**Décision :** regex corrigée en `/^(\d{1,2}):(\d{2})$/` ; les styles d'événement (fond, liseré gauche, texte) sont désormais portés par `.cal-event-container.creneau-evenement` ; le fond transparent du plug-in est neutralisé sur `.cal-event`.
**Conséquences :** les créneaux retenus s'affichent en bloc vert dans la colonne du jour. Un test de non-régression (`creneau-calendar.component.spec.ts`) vérifie qu'un `.cal-event-container` est bien rendu et que la `Date` d'événement est valide.


## 2026-11-04 — Prompt IA (gabarit `template.md` + CSV) dans le menu administrateur
**Contexte :** la constitution des jurys de soutenance demandait de fournir à une IA la liste des mémoires, la liste des professeurs avec leurs disponibilités et la liste des salles. Le gabarit `public/template.md` existe déjà, avec trois champs entre accolades (`{{csv_liste_memoire}}`, `{{csv_liste_dispo}}`, `{{csv_liste_salle}}`) ; les données (`public/memoires.xlsx`, `public/salles.xlsx`) et les disponibilités (Firestore) étaient dispersées.
**Décision :**
- une page **réservée à l'administrateur** (`/admin/prompt`, `adminGuard`) est ajoutée ; le header expose désormais un **menu « Admin »** (`mat-menu`) contenant « Importer des créneaux » et « Prompt IA » (le lien unique précédent devient un menu, pour rester lisible sur mobile) ;
- le prompt est assemblé **dans le navigateur** : `public/template.md` est lu par `HttpClient`, `memoires.xlsx` et `salles.xlsx` par `read-excel-file` (via le contrat injectable `XLSX_BACKEND`), les disponibilités par Firestore — aucune donnée n'est envoyée à un serveur ;
- `FirestoreBackend` gagne deux méthodes : `listerProfils()` (`users`) et `lireToutesDispos()` (`collectionGroup('dispos')`, déjà autorisé en lecture aux administrateurs par `firestore.rules`) ;
- le CSV des disponibilités comporte **une ligne par professeur** (`login`, `nom`, `prenom`, `nb_creneaux`, `disponibilites`) : les créneaux sont regroupés dans une seule cellule, séparés par `; `, ce qui est plus lisible pour l'IA qu'une ligne par créneau ;
- les classeurs exports portent **deux lignes d'en-tête** (noms techniques `[[ CODE ]]`, puis libellés humains) : l'indexation des colonnes détecte l'un ou l'autre format et se replie sur l'ordre positionnel ;
- la copie utilise `navigator.clipboard.writeText`, avec repli sur `document.execCommand('copy')` (contexte non sécurisé) ;
- le gabarit est injectable depuis l'URL publique : la mécanique est donc utilisable pour d'autres travaux de l'administration (toutefois §13 reste inchangé : pas d'export d'attribution, pas de Cloud Functions).
**Conséquences :** l'administrateur obtient en un clic un prompt collable dans n'importe quelle IA. La lecture des disponibilités de tous les professeurs est réservée à l'administrateur (elle l'est déjà dans les règles). Les tests unitaires des fonctions pures (`prompt-ia.service.spec.ts`) sont **écrits mais non exécutés**, conformément au contrat de vérification (§3).

## 2026-11-05 — Attribution des créneaux à l'ensemble des professeurs
**Contexte :** l'espace administrateur (`/admin/import`) permettait d'attribuer des créneaux à une liste de `login` Oasis saisie au clavier. Le besoin récurrent est inverse : attribuer un ou plusieurs créneaux **à tous les professeurs** de l'établissement, sans saisie.
**Décision :**
- `AttributionService.preparer(saisie, nombre, tousLesProfs = false)` accepte un troisième argument : quand il vaut `true`, la cible est l'**ensemble** des professeurs de la liste Oasis (`ProfService`) et la saisie des logins est ignorée (aucun login n'est signalé « inconnu ») ;
- l'interface (`AttributionComponent`) expose une case à cocher « Attribuer à tous les professeurs de la liste Oasis » ; le champ des logins est alors désactivé, et la prévisualisation + la confirmation restent obligatoires avant toute écriture ;
- les lectures des créneaux déjà retenus sont désormais **parallélisées par lots de 20** (`TAILLE_LECTURE_PARALLELE`) : une attribution à toute la liste implique ~400 partitions, qu'une lecture séquentielle rendrait trop lente ;
- les créneaux attribués sont les mêmes qu'un clic du professeur : `users/{uid}/dispos/{creneauId}`, donc visibles dans « Mes disponibilités » à la prochaine connexion.
**Conséquences :** l'attribution de masse reste **idempotente** (`setDoc`) et exclut les créneaux déjà retenus par chaque professeur. La liste Oasis fait foi pour « l'ensemble des professeurs » : un professeur qui s'est identifié en saisie libre (nom arbitraire) ne peut pas être ciblé (cf. l'ADR sur l'attribution). Tests unitaires **écrits mais non exécutés** (contrat §3).
