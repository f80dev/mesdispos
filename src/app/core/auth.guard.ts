import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from './auth.service';
import { ROUTES } from '../app.routes';

/**
 * `authGuard` — laisse passer un professeur (« nom seul », cookie) ou un
 * administrateur (session Firebase Google) ; sinon redirection vers `/login`
 * en mémorisant la route demandée (`?retour=…`) pour y revenir après
 * connexion (F1, §7).
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const utilisateur = await auth.attendreSession();
  if (utilisateur) {
    return true;
  }
  return router.createUrlTree([ROUTES.login], {
    queryParams: { retour: state.url },
  });
};
