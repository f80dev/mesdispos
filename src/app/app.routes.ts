import { Routes } from '@angular/router';

import { adminGuard } from './core/admin.guard';
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
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'dispos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dispos/dispos-page.component').then((m) => m.DisposPageComponent),
  },
  {
    // Accès admin : connecté (mode B obligatoire) ET document `admins/{uid}`.
    path: 'admin/import',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/import.component').then((m) => m.ImportComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'dispos' },
  { path: '**', redirectTo: '' },
];
