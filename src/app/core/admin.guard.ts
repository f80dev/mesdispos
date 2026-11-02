import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { FIRESTORE_BACKEND } from './firestore.backend';
import { NotifService } from './notif.service';
import { AuthService } from './auth.service';
import { ROUTES } from '../app.routes';

/**
 * `adminGuard` — accès `/admin/import` réservé aux administrateurs (F6).
 *
 * L'admin s'identifie par une **session Firebase Google** (`sessionAdmin`) :
 * son `uid` doit exister dans la collection `admins` (document écrit depuis la
 * console Firebase). Les professeurs, eux, n'utilisent pas Google (session
 * « nom seul » par cookie).
 *
 * Sans session Firebase, ou sans document `admins/{uid}` : snackbar
 * « Accès réservé à un administrateur » puis redirection `/dispos` (ou
 * `/login` si personne n'est connecté).
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
  const admin = auth.sessionAdmin();
  if (!admin) {
    // Aucune session administrateur : on renvoie vers la page de connexion,
    // qui propose la connexion Google dédiée.
    notif.info('Connexion administrateur requise');
    return router.createUrlTree([ROUTES.login], { queryParams: { retour: ROUTES.admin } });
  }
  if (!(await backend.estAdmin(admin.uid))) {
    notif.info('Accès réservé à un administrateur');
    return router.createUrlTree([ROUTES.dispos]);
  }
  return true;
};
