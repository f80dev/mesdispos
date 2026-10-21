import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { FIRESTORE_BACKEND } from './firestore.backend';
import { NotifService } from './notif.service';
import { AuthService } from './auth.service';
import { ROUTES } from '../app.routes';

/**
 * `adminGuard` — accès `/admin/import` réservé au **mode B** (F2 mode B,
 * F6) : il faut être connecté, en mode Google (pas anonyme) *et* avoir un
 * document `admins/{uid}`. Sinon : snackbar « Accès réservé à un
 * administrateur » puis redirection `/dispos` (ou `/login` si non connecté).
 *
 * L'appel Firestore passe par l'abstraction `FIRESTORE_BACKEND` pour rester
 * testable avec un faux (cf. `firestore.backend.ts`).
 */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notif = inject(NotifService);
  const backend = inject(FIRESTORE_BACKEND);

  const utilisateur = await auth.attendreSession();
  if (!utilisateur) {
    return router.createUrlTree([ROUTES.login], { queryParams: { retour: ROUTES.admin } });
  }
  if (utilisateur.anon || !(await backend.estAdmin(utilisateur.uid))) {
    notif.info('Accès réservé à un administrateur');
    return router.createUrlTree([ROUTES.dispos]);
  }
  return true;
};
