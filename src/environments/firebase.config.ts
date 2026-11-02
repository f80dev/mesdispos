/**
 * Configuration Firebase Web — MesDispos (AGENTS.md §14).
 *
 * ⚠️ Ces valeurs sont des LITÉRALES `REPLACE_ME_*` : elles doivent être
 * remplacées par les valeurs de VOTRE projet (console Firebase →
 * Paramètres du projet → « Vos applications » → Config).
 *
 * Ces identifiants sont **publics par conception** (ils identifient le projet,
 * ils ne donnent aucun droit d'écriture : c'est `firestore.rules` qui protège
 * les données). Ils peuvent donc être commités — au contraire d'une clé de
 * service ou d'un `.env` secret, jamais commités (§11).
 */

/** Identifiants du projet Firebase, tels qu'exposés par la console. */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDCvQj-U1afpsM3j-uemNJBBtWHO0Mb7cY',
  authDomain: 'mesdispos-db623.firebaseapp.com',
  projectId: 'mesdispos-db623',
  storageBucket: 'mesdispos-db623.firebasestorage.app',
  messagingSenderId: '558354493421',
  appId: '1:558354493421:web:9276c2ae90631c5965c1e4',
  measurementId: 'G-YLHW4EM0PD',
};

/** `true` quand les identifiants ont été remplacés par l'humain. */
export function firebaseConfigure(): boolean {
  return !Object.values(FIREBASE_CONFIG).some((valeur) => valeur.startsWith('REPLACE_ME'));
}
