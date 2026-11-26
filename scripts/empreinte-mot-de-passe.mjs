/**
 * Calcul de l'empreinte SHA-256 du mot de passe administrateur.
 *
 * L'empreinte est à copier dans le document Firestore `config/admin`
 * (champ `empreinte`) : c'est elle que `firestore.rules` compare à celle
 * fournie par l'application lors d'une connexion par mot de passe.
 *
 * Usage : npm run empreinte-mdp -- "mon mot de passe"
 */
import { createHash } from 'node:crypto';

const motDePasse = process.argv.slice(2).join(' ').trim();

if (!motDePasse) {
  console.error('Usage : npm run empreinte-mdp -- "mon mot de passe"');
  process.exit(1);
}

// L'application applique `trim()` au mot de passe avant de le hacher : le
// script fait de même, sinon les espaces superflus produiraient deux
// empreintes différentes pour un même mot de passe.
console.log(createHash('sha256').update(motDePasse, 'utf8').digest('hex'));
