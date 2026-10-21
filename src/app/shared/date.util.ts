/**
 * Utilitaires purs de dates, d'heures et de noms — testables sans Angular
 * (AGENTS.md §2 `shared/date.util.ts`, §5, §6 F6).
 *
 * Règle transverse (§13) : **jamais** de `Date`/`Timestamp`/epoch stocké. Les
 * créneaux restent des chaînes `'YYYY-MM-DD'` et `'HH:mm'`. Un `Date` n'apparaît
 * que transientement, pour lire une cellule Excel.
 */

/** Longueur maximale d'un prénom / pseudonyme (F2 mode A). */
export const LONGUEUR_NOM_MAX = 50;

/** Résultat typé d'une normalisation : valeur ou message français. */
export type Resultat<T> = { ok: true; valeur: T } | { ok: false; erreur: string };

/** `trim` + collapse des espaces internes + suppression des espaces insécables. */
export function normaliserNom(saisi: string | null | undefined): string {
  return (saisi ?? '')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Validation d'un prénom : 1 ≤ longueur ≤ 50 après normalisation. */
export function validerNom(saisi: string | null | undefined): Resultat<string> {
  const nom = normaliserNom(saisi);
  if (nom.length === 0) {
    return { ok: false, erreur: 'Saisissez votre prénom pour continuer.' };
  }
  if (nom.length > LONGUEUR_NOM_MAX) {
    return {
      ok: false,
      erreur: `Le prénom ne doit pas dépasser ${LONGUEUR_NOM_MAX} caractères.`,
    };
  }
  return { ok: true, valeur: nom };
}
