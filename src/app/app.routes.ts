import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';

/** Chemins applicatifs (source de vérité des redirections et des guards). */
export const ROUTES = {
  login: '/login',
  dispos: '/dispos',
  admin: '/admin/import',
} as const;

/**
 * Routes de l'application (F1). Les composants sont **chargés à la demande**
 * (`loadComponent`) : le SDK Firestore et `read-excel-file` ne sont donc pas
 * dans le bundle initial.
 *
 * Étape 4 : seules les redirections globales sont câblées — `/login` (étape 5),
 * `/dispos` (étape 8) et `/admin/import` (étape 10) sont ajoutés au fil de
 * l'eau pour que chaque commit reste buildable.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: ROUTES.dispos.slice(1),
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dispos/dispos-page.component').then((m) => m.DisposPageComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: ROUTES.dispos.slice(1) },
  { path: '**', redirectTo: '' },
];
