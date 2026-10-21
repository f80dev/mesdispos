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
  apiKey: 'REPLACE_ME_API_KEY',
  authDomain: 'REPLACE_ME_AUTH_DOMAIN.firebaseapp.com',
  projectId: 'REPLACE_ME_PROJECT_ID',
  storageBucket: 'REPLACE_ME_PROJECT_ID.appspot.com',
  messagingSenderId: 'REPLACE_ME_MESSAGING_SENDER_ID',
  appId: 'REPLACE_ME_APP_ID',
};

/**
 * Domaines de messagerie Google autorisés à se connecter (mode B).
 * Tableau vide = tout compte Google accepté. Contrôle côté client ; un contrôle
 * équivalent côté rules est_documenté pour plus tard (ADR §11).
 */
export const ALLOWED_EMAIL_DOMAINS: string[] = [];

/** `true` quand les identifiants ont été remplacés par l'humain. */
export function firebaseConfigure(): boolean {
  return !Object.values(FIREBASE_CONFIG).some((valeur) => valeur.startsWith('REPLACE_ME'));
}

/** Un domaine est-il accepté ? (liste vide = tout accepter) */
export function domaineAutorise(email: string | null | undefined): boolean {
  if (ALLOWED_EMAIL_DOMAINS.length === 0) {
    return true;
  }
  if (!email) {
    return false;
  }
  const domaine = email.split('@')[1]?.toLowerCase() ?? '';
  return ALLOWED_EMAIL_DOMAINS.some((autorise) => autorise.toLowerCase() === domaine);
}
