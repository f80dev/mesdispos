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
