import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { FIRESTORE_BACKEND, FirestoreReelBackend } from './core/firestore.backend';
import { XLSX_BACKEND, XLSXReelBackend } from './core/xlsx.backend';
import { routes } from './app.routes';

// Angular n'embarque que `en-US` : les données de la locale française doivent
// être enregistrées pour que `formatDate` (utilisé par `angular-calendar` et
// par les pipes de date) fonctionne avec `locale="fr"` (sinon NG0701).
registerLocaleData(localeFr, 'fr');

/**
 * `appConfig` — DI au niveau de l'application.
 *
 * Les `Backend` abstraient Firestore et `read-excel-file` derrière des
 * `InjectionToken`s (`FIRESTORE_BACKEND`, `XLSX_BACKEND`) ; leur
 * implémentation *réelle* est branchée ici, et les tests unitaires
 * (`*.spec.ts`) en fournissent un faux via `TestBed.configureTestingModule`.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    { provide: FIRESTORE_BACKEND, useExisting: FirestoreReelBackend },
    { provide: XLSX_BACKEND, useExisting: XLSXReelBackend },
  ],
};
