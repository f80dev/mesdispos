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

/* -------------------------------------------------------------------------- */
/* Normalisation des cellules Excel (F6) — voir l'ADR « Fuseaux et cellules » */
/* -------------------------------------------------------------------------- */

/**
 * Nombre de jours entre l'époque Excel (1899-12-30) et l'époque Unix (1970-01-01).
 * Reprend exactement la constante de `read-excel-file`
 * (`commonjs/read/parseDate.js`) pour rester cohérent avec la bibliothèque.
 */
const JOURS_AVANT_EPOQUE_UNIX = 70 * 365 + 19; // 25569
const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

function pad2(valeur: number): string {
  return valeur.toString().padStart(2, '0');
}

function invalide(attendu: string): { ok: false; erreur: string } {
  return { ok: false, erreur: `${attendu} invalide.` };
}

/** Vrai si l'année/mois/jour forment une date de calendrier existante. */
function jourDeCalendrier(annee: number, mois: number, jour: number): boolean {
  if (annee < 1900 || annee > 9999 || mois < 1 || mois > 12 || jour < 1 || jour > 31) {
    return false;
  }
  const sonde = new Date(Date.UTC(annee, mois - 1, jour));
  return (
    sonde.getUTCFullYear() === annee &&
    sonde.getUTCMonth() === mois - 1 &&
    sonde.getUTCDate() === jour
  );
}

/**
 * Normalise une date en `'YYYY-MM-DD'`.
 *
 * Sources acceptées : objet `Date` (cellule Excel ou calendrier), nombre (série
 * Excel), chaîne `AAAA-MM-JJ`, `JJ/MM/AAAA` ou `JJ-MM-AAAA` (avec un éventuel
 * suffixe horaire ignoré).
 *
 * Choix de fuseau (ADR) : pour un `Date` issu d'une cellule Excel, les getters
 * **UTC** sont utilisés — `read-excel-file` construit l'instant à minuit UTC
 * (`new Date(Math.round((serial - 25569) * 86400000))`), donc les getters UTC
 * renvoient toujours la date voulue, quel que soit le fuseau du lecteur. Les
 * getters **locaux** sont réservés à l'affichage (`date-group.pipe`).
 */
export function normalizeDate(valeur: unknown): Resultat<string> {
  if (valeur instanceof Date) {
    if (Number.isNaN(valeur.getTime())) {
      return invalide('Date');
    }
    return {
      ok: true,
      valeur: `${valeur.getUTCFullYear()}-${pad2(valeur.getUTCMonth() + 1)}-${pad2(valeur.getUTCDate())}`,
    };
  }

  if (typeof valeur === 'number' && Number.isFinite(valeur)) {
    // Série Excel : même conversion que read-excel-file, puis lecture UTC.
    const instant = new Date(Math.round((valeur - JOURS_AVANT_EPOQUE_UNIX) * MS_PAR_JOUR));
    return normalizeDate(instant);
  }

  if (typeof valeur === 'string') {
    const texte = valeur.trim().replace(/[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?$/, '');
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texte);
    const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(texte);
    if (iso) {
      const [, a, m, j] = iso;
      const annee = Number(a);
      const mois = Number(m);
      const jour = Number(j);
      return jourDeCalendrier(annee, mois, jour)
        ? { ok: true, valeur: `${annee}-${pad2(mois)}-${pad2(jour)}` }
        : invalide('Date');
    }
    if (fr) {
      const [, j, m, a] = fr;
      const annee = Number(a);
      const mois = Number(m);
      const jour = Number(j);
      return jourDeCalendrier(annee, mois, jour)
        ? { ok: true, valeur: `${annee}-${pad2(mois)}-${pad2(jour)}` }
        : invalide('Date');
    }
  }

  return invalide('Date');
}

/**
 * Normalise une heure en `'HH:mm'`.
 *
 * Sources acceptées : `Date` (cellule Excel — base 1899-12-30, lue en **UTC**),
 * fraction de journée (`0.363…` = 08:43), chaînes `HH:mm`, `HH:mm:ss`, `HHhmm`
 * ou `HHmm`.
 */
export function normalizeHeure(valeur: unknown): Resultat<string> {
  if (valeur instanceof Date) {
    if (Number.isNaN(valeur.getTime())) {
      return invalide('Heure');
    }
    const heures = valeur.getUTCHours();
    const minutes = valeur.getUTCMinutes();
    if (heures > 23 || minutes > 59) {
      return invalide('Heure');
    }
    return { ok: true, valeur: `${pad2(heures)}:${pad2(minutes)}` };
  }

  if (typeof valeur === 'number' && Number.isFinite(valeur)) {
    // Fraction de journée Excel : 1 = 24 h 00.
    if (valeur < 0 || valeur >= 1) {
      return invalide('Heure');
    }
    const minutesTotales = Math.round(valeur * 24 * 60);
    return {
      ok: true,
      valeur: `${pad2(Math.floor(minutesTotales / 60))}:${pad2(minutesTotales % 60)}`,
    };
  }

  if (typeof valeur === 'string') {
    const texte = valeur.trim();
    const avecDeuxPoints = /^(\d{1,2}):(\d{2})(:(\d{2}))?$/.exec(texte);
    if (avecDeuxPoints) {
      const heures = Number(avecDeuxPoints[1]);
      const minutes = Number(avecDeuxPoints[2]);
      if (heures > 23 || minutes > 59) {
        return invalide('Heure');
      }
      return { ok: true, valeur: `${pad2(heures)}:${pad2(minutes)}` };
    }
    const compact = /^(\d{1,2})\s*[hH]?(\d{2})$/.exec(texte);
    if (compact) {
      const heures = Number(compact[1]);
      const minutes = Number(compact[2]);
      if (heures > 23 || minutes > 59) {
        return invalide('Heure');
      }
      return { ok: true, valeur: `${pad2(heures)}:${pad2(minutes)}` };
    }
  }

  return invalide('Heure');
}

/** Élément triable : on n'importe pas `Creneau` ici (shared/ reste générique). */
export interface CreneauTriable {
  readonly date: string;
  readonly heureDebut: string;
  readonly heureFin: string;
}

/**
 * Tri croissant date puis heure de début puis heure de fin (F5). Tri **pur** :
 * renvoie une nouvelle liste, ne mute pas l'entrée, et conserve l'ordre stable
 * des éléments ex æquo (mêmes date + heures).
 */
export function trierCreneaux<T extends CreneauTriable>(creneaux: readonly T[]): T[] {
  return [...creneaux].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? -1 : 1;
    }
    if (a.heureDebut !== b.heureDebut) {
      return a.heureDebut < b.heureDebut ? -1 : 1;
    }
    if (a.heureFin !== b.heureFin) {
      return a.heureFin < b.heureFin ? -1 : 1;
    }
    return 0;
  });
}

const FORMATTEUR_JOUR = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Élément affichable dans un libellé d'accessibilité. */
export interface CreneauAffichable {
  readonly date: string;
  readonly heureDebut: string;
  readonly heureFin: string;
}

/** `'08:45'` → `'8 h 45'` (typographie française, F3). */
export function libelleHeure(heure: string): string {
  const morceaux = /^(\d{1,2}):(\d{2})$/.exec(heure.trim());
  if (!morceaux) {
    return heure;
  }
  const heures = Number.parseInt(morceaux[1] as string, 10);
  return `${heures} h ${morceaux[2]}`;
}

/**
 * Libellé d'accessibilité d'une ligne de créneau (F3) :
 * « Disponible lundi 12 janvier de 8 h 45 à 9 h 30 », ou « Retenu … » si le
 * créneau est dans « Mes disponibilités ».
 */
export function libelleCreneauAccessible(creneau: CreneauAffichable, selectionne: boolean): string {
  const morceaux = creneau.date.slice(0, 10).split('-');
  const annee = Number.parseInt(morceaux[0] ?? '', 10);
  const mois = Number.parseInt(morceaux[1] ?? '', 10);
  const jour = Number.parseInt(morceaux[2] ?? '', 10);
  const jourFr =
    Number.isNaN(annee) || Number.isNaN(mois) || Number.isNaN(jour)
      ? creneau.date
      : FORMATTEUR_JOUR.format(new Date(annee, mois - 1, jour));
  return `${selectionne ? 'Retenu' : 'Disponible'} ${jourFr} de ${libelleHeure(creneau.heureDebut)} à ${libelleHeure(creneau.heureFin)}`;
}

/** Regroupe des créneaux par jour en conservant le tri (F3). */
export function grouperParJour<T extends CreneauTriable>(
  creneaux: readonly T[],
): Array<{ date: string; creneaux: T[] }> {
  const groupes = new Map<string, T[]>();
  for (const creneau of trierCreneaux(creneaux)) {
    const groupe = groupes.get(creneau.date);
    if (groupe) {
      groupe.push(creneau);
    } else {
      groupes.set(creneau.date, [creneau]);
    }
  }
  return [...groupes.entries()].map(([date, entries]) => ({ date, creneaux: entries }));
}
