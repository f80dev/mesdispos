/**
 * Initialisation Firebase — SDK **modulaire** uniquement (AGENTS.md §4/§13).
 *
 * Pas de `@angular/fire` : le SDK est enveloppé ici et consommé par des services
 * Angular injectables. Les instances sont créées **paresseusement** : le mode A
 * « Nom seul » (cookie) ne touche jamais Firebase et n'émet aucun appel réseau
 * (F2 mode A : « Aucun appel Firebase Auth ; aucune dépendance réseau »).
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { FIREBASE_CONFIG, firebaseConfigure } from '../../environments/firebase.config';

export { firebaseConfigure };

/** Instance applicative Firebase (créée au premier usage). */
export function firebaseApp(): FirebaseApp {
  const apps = getApps();
  return apps.length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
}

/** Instance Auth (mode B « Google » uniquement). */
export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}

/** Instance Firestore (créneaux + disponibilités, import admin). */
export function firebaseDb(): Firestore {
  return getFirestore(firebaseApp());
}
