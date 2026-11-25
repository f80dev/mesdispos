import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AdminService } from './admin.service';
import { AuthService } from './auth.service';
import { ROUTES } from '../app.routes';

/**
 * `authGuard` — laisse passer un professeur (« nom seul », cookie) ou un
 * administrateur (session Firebase Google) ; sinon redirection vers `/login`
 * en mémorisant la route demandée (`?retour=…`) pour y revenir après
 * connexion (F1, §7).
 *
 * L'espace professeur (`/dispos`) est **interdit aux administrateurs** : une
 * session Firebase administratrice est renvoyée vers `/admin/dispos`
 * (dispo-prof), qui reste derrière `adminGuard`.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const admin = inject(AdminService);

  const utilisateur = await auth.attendreSession();
  if (utilisateur) {
    // Session administratrice → espace professeur interdit.
    if (utilisateur.session === 'firebase') {
      const sessionAdmin = auth.sessionAdmin();
      if (sessionAdmin && (await admin.verifier(sessionAdmin.uid))) {
        return router.createUrlTree([ROUTES.adminDispos]);
      }
    }
    return true;
  }
  return router.createUrlTree([ROUTES.login], {
    queryParams: { retour: state.url },
  });
};
