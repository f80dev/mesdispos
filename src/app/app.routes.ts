import { Routes } from '@angular/router';

import { adminGuard } from './core/admin.guard';
import { authGuard } from './core/auth.guard';

/** Chemins applicatifs (source de vérité des redirections et des guards). */
export const ROUTES = {
  login: '/login',
  dispos: '/dispos',
  admin: '/admin',
  adminImport: '/admin/import',
  adminPrompt: '/admin/prompt',
  adminDispos: '/admin/dispos',
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
    // Écran admin par défaut : le prompt IA.
    path: 'admin',
    redirectTo: 'admin/prompt',
    pathMatch: 'full',
  },
  {
    // Accès admin : connecté (mode B obligatoire) ET document `admins/{uid}`.
    path: 'admin/import',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/import.component').then((m) => m.ImportComponent),
  },
  {
    // Prompt IA (gabarit `template.md` + CSV) : réservé à l'administrateur.
    path: 'admin/prompt',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/prompt.component').then((m) => m.PromptIaComponent),
  },
  {
    // Disponibilités des professeurs : liste cochable + calendrier agrégé.
    path: 'admin/dispos',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/dispo-prof.component').then((m) => m.DispoProfComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'dispos' },
  { path: '**', redirectTo: '' },
];
