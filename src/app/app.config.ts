import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { FIRESTORE_BACKEND } from './core/firestore.backend';
import { FirestoreReelBackend } from './core/firestore.backend.reel';
import { XLSX_BACKEND } from './core/xlsx.backend';
import { XLSXReelBackend } from './core/xlsx.backend.reel';
import { routes } from './app.routes';

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
    { provide: FIRESTORE_BACKEND, useExisting: FirestoreReelBackend },
    { provide: XLSX_BACKEND, useExisting: XLSXReelBackend },
  ],
};
