/**
 * Opérations immuables sur les ensembles (`ReadonlySet`).
 *
 * Les signals de sélection (professeurs cochés, créneaux en cours d'écriture)
 * sont remplacés à chaque changement : ces petites fonctions évitent de
 * recopier le motif « copier l'ensemble puis ajouter/retirer » dans chaque
 * composant ou service.
 */

/** Nouvel ensemble contenant `valeur`. */
export function avecValeur<T>(ensemble: ReadonlySet<T>, valeur: T): ReadonlySet<T> {
  const suivant = new Set(ensemble);
  suivant.add(valeur);
  return suivant;
}

/** Nouvel ensemble contenant toutes les `valeurs` fournies. */
export function avecValeurs<T>(ensemble: ReadonlySet<T>, valeurs: Iterable<T>): ReadonlySet<T> {
  const suivant = new Set(ensemble);
  for (const valeur of valeurs) {
    suivant.add(valeur);
  }
  return suivant;
}

/** Nouvel ensemble sans `valeur`. */
export function sansValeur<T>(ensemble: ReadonlySet<T>, valeur: T): ReadonlySet<T> {
  const suivant = new Set(ensemble);
  suivant.delete(valeur);
  return suivant;
}

/** Nouvel ensemble où `valeur` est ajoutée (`actif`) ou retirée. */
export function basculerValeur<T>(
  ensemble: ReadonlySet<T>,
  valeur: T,
  actif: boolean,
): ReadonlySet<T> {
  return actif ? avecValeur(ensemble, valeur) : sansValeur(ensemble, valeur);
}
