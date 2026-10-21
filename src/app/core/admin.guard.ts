import { inject } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { Router, type CanActivateFn } from '@angular/router';

import { firebaseConfigure, firebaseDb } from './firebase';
import { NotifService } from './notif.service';
import { AuthService } from './auth.service';
import { ROUTES } from '../app.routes';

/**
 * Un compte est administrateur si et seulement si le document
 * `admins/{uid}` existe (écrit **uniquement** depuis la console Firebase,
 * cf. `firestore.rules` : `allow write: if false`).
 */
export async function estAdmin(uid: string): Promise<boolean> {
  if (!firebaseConfigure()) {
    return false;
  }
  try {
    const snapshot = await getDoc(doc(firebaseDb(), 'admins', uid));
    return snapshot.exists();
  } catch {
    return false;
  }
}

/**
 * `adminGuard` — accès `/admin/import` réservé au **mode B** (F2 mode B,
 * F6) : il faut être connecté, en mode Google (pas anonyme) *et* avoir un
 * document `admins/{uid}`. Sinon : snackbar « Accès réservé à un
 * administrateur » puis redirection `/dispos` (ou `/login` si non connecté).
 */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notif = inject(NotifService);

  const utilisateur = await auth.attendreSession();
  if (!utilisateur) {
    return router.createUrlTree([ROUTES.login], { queryParams: { retour: ROUTES.admin } });
  }
  if (utilisateur.anon || !(await estAdmin(utilisateur.uid))) {
    notif.info('Accès réservé à un administrateur');
    return router.createUrlTree([ROUTES.dispos]);
  }
  return true;
};
