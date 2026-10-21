/**
 * Initialisation Firebase — SDK **modulaire** uniquement (AGENTS.md §4/§13).
 *
 * Pas de `@angular/fire` : le SDK est enveloppé ici et consommé par des services
 * Angular injectables.
 *
 * ⚡ Le SDK lui-même est chargé en **import dynamique** : le bundle initial ne
 * contient ni `firebase/auth` ni `firebase/firestore`. Conséquences :
 *  - le mode A « Nom seul » (cookie) ne télécharge aucun octet de SDK Firebase
 *    et n'émet aucun appel réseau (F2 mode A) ;
 *  - le bundle initial reste très en dessous du budget de 500 kB ;
 *  - `firebase/auth` n'est chargé que pour restaurer une session Google ou sur
 *    clic sur « Continuer avec Google ».
 */
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

import { FIREBASE_CONFIG, firebaseConfigure } from '../../environments/firebase.config';

export { firebaseConfigure };

/** Module `firebase/app` mémoïsé. */
let moduleApp: typeof import('firebase/app') | null = null;

/** Module `firebase/auth` mémoïsé. */
let moduleAuth: typeof import('firebase/auth') | null = null;

/** Module `firebase/firestore` mémoïsé. */
let moduleFirestore: typeof import('firebase/firestore') | null = null;

/** Charge (une seule fois) le module `firebase/app`. */
export async function chargerApp(): Promise<typeof import('firebase/app')> {
  moduleApp ??= await import('firebase/app');
  return moduleApp;
}

/** Charge (une seule fois) le module `firebase/auth`. */
export async function chargerAuth(): Promise<typeof import('firebase/auth')> {
  moduleAuth ??= await import('firebase/auth');
  return moduleAuth;
}

/** Charge (une seule fois) le module `firebase/firestore`. */
export async function chargerFirestore(): Promise<typeof import('firebase/firestore')> {
  moduleFirestore ??= await import('firebase/firestore');
  return moduleFirestore;
}

/** Instance applicative Firebase (créée au premier usage). */
export async function firebaseApp(): Promise<FirebaseApp> {
  const { getApp, getApps, initializeApp } = await chargerApp();
  return getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
}

/** Instance Auth (mode B « Google » uniquement). */
export async function firebaseAuth(): Promise<Auth> {
  const [app, { getAuth }] = await Promise.all([firebaseApp(), chargerAuth()]);
  return getAuth(app);
}

/** Instance Firestore (créneaux + disponibilités, import admin). */
export async function firebaseDb(): Promise<Firestore> {
  const [app, { getFirestore }] = await Promise.all([firebaseApp(), chargerFirestore()]);
  return getFirestore(app);
}
