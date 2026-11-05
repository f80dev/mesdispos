/**
 * Utilitaires **CSV** — fabrication du prompt destiné à une IA (§ admin).
 *
 * Format CSV minimal : champs séparés par des virgules, champs contenant une
 * virgule, un guillemet ou un retour à la ligne entourés de guillemets, un
 * guillemet interne doublé (`""`). Séparateur de listes interne : `; `.
 *
 * Fonctions **pures** : testables sans Angular ni réseau.
 */

/** Caractère utilisé pour séparer les éléments d'une liste dans une cellule. */
export const SEPARATEUR_LISTE = '; ';

/**
 * Échappe une valeur destinée à une cellule CSV.
 *
 * @param valeur la valeur brute (chaîne)
 * @returns la valeur entre guillemets si nécessaire, telle quelle sinon
 */
export function echapperCsv(valeur: string): string {
  const texte = valeur ?? '';
  if (/["\n\r,]/.test(texte)) {
    return `"${texte.replace(/"/g, '""')}"`;
  }
  return texte;
}

/**
 * Construit un document CSV à partir d'en-têtes et de lignes.
 *
 * @param entetes les en-têtes de colonnes (une ligne d'en-tête est produite)
 * @param lignes les lignes de données (tableaux de valeurs)
 * @returns le document CSV terminé par un saut de ligne
 */
export function versCsv(
  entetes: readonly string[],
  lignes: readonly (readonly string[])[],
): string {
  const morceaux = [entetes.map(echapperCsv).join(',')];
  for (const ligne of lignes) {
    morceaux.push(ligne.map(echapperCsv).join(','));
  }
  return morceaux.join('\n') + '\n';
}

/**
 * Remplace les champs entre accolades `{{clé}}` d'un gabarit.
 *
 * Les espaces autour de la clé sont tolérés (`{{ csv_liste_memoire }}`).
 * Une clé absente du gabarit est simplement ignorée ; une clé absente de
 * `valeurs` laisse le champ **vide** (le gabarit reste valide).
 *
 * @param gabarit le texte du gabarit (ex. `public/template.md`)
 * @param valeurs les valeurs à injecter, par nom de champ
 * @returns le gabarit complété
 */
export function remplacerGabarit(
  gabarit: string,
  valeurs: Readonly<Record<string, string>>,
): string {
  return gabarit.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (tout, cle: string) => {
    const valeur = valeurs[cle];
    return valeur === undefined ? tout : valeur;
  });
}

/**
 * Normalise un en-tête de colonne pour la comparaison : sans accent, sans
 * ponctuation, en minuscules (`'Heure de début'` → `'heuredebut'`).
 */
export function normaliserEnteteCsv(entete: unknown): string {
  return String(entete ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Convertit une cellule Excel en chaîne exploitable (les nombres sont
 * convertis, les `null` deviennent la chaîne vide).
 */
export function celluleTexte(valeur: unknown): string {
  if (valeur === null || valeur === undefined) {
    return '';
  }
  if (valeur instanceof Date) {
    return valeur.toISOString();
  }
  return String(valeur).trim();
}
