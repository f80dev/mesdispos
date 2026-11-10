/**
 * `PlanningImportService` — import du **planning de soutenances** produit par
 * l'IA (à partir du gabarit `public/template.md`).
 *
 * Le classeur attendu porte une feuille « Planning » (à défaut, la première
 * feuille) dont les colonnes sont, d'après le gabarit :
 * `Date`, `Heure`, `Titre du mémoire`, `Étudiant·e`, `Directeur·rice`,
 * `Jury 2`, `Jury 3`, `Salle`.
 *
 * Les en-têtes sont tolérés à la casse, aux accents et à la ponctuation
 * (`Heure de début`, `heure_debut`, `Titre mémoire`…). La colonne « Heure »
 * contient une **plage** `'HH:mm-HH:mm'` (heure de début - heure de fin) ;
 * une heure simple est également acceptée, auquel cas l'heure de fin est
 * déduite (une soutenance dure **1 h**, règle 5 du gabarit).
 *
 * La lecture se fait **dans le navigateur** (`XLSX_BACKEND`) : aucun fichier
 * n'est envoyé à un serveur. Aucun `Date` n'est persisté : le planning reste
 * exprimé en chaînes `'YYYY-MM-DD'` et `'HH:mm'` (cf. AGENTS.md §13).
 */
import { Injectable, inject } from '@angular/core';

import { XLSX_BACKEND, type XLSXBackend } from '../core/xlsx.backend';
import { normaliserEntete } from './excel-import.service';
import { normalizeDate, normalizeHeure, type Resultat } from '../shared/date.util';

/** Nom de la feuille de planning dans le classeur produit par l'IA. */
export const FEUILLE_PLANNING = 'Planning';

/** Durée d'une soutenance (règle 5 du gabarit) : 1 h. */
export const DUREE_SOUTENANCE_MINUTES = 60;

/** Message de refus poli de tout format autre que `.xlsx`. */
export const MESSAGE_FORMAT_PLANNING =
  'Format non pris en charge : utilisez un fichier Excel .xlsx';

/** Message affiché quand aucune colonne exploitable n'est trouvée. */
export const MESSAGE_COLONNES_PLANNING =
  'Colonnes attendues : date, heure, titre du mémoire, étudiant, directeur, jury 2, jury 3, salle.';

/** Une soutenance planifiée (une ligne du planning). */
export interface Soutenance {
  /** Jour de la soutenance, `'YYYY-MM-DD'`. */
  readonly date: string;
  /** Heure de début, `'HH:mm'`. */
  readonly heureDebut: string;
  /** Heure de fin, `'HH:mm'` (début + 1 h par défaut). */
  readonly heureFin: string;
  /** Titre du mémoire soutenu. */
  readonly titre: string;
  /** Étudiant·e soutenu·e. */
  readonly etudiant: string;
  /** Directeur·rice de mémoire. */
  readonly directeur: string;
  /** Deuxième membre du jury. */
  readonly jury2: string;
  /** Troisième membre du jury. */
  readonly jury3: string;
  /** Salle affectée (vide si le fichier n'en précise aucune). */
  readonly salle: string;
}

/** Une ligne lue dans le classeur, valide ou non. */
export interface LignePlanning {
  /** Numéro de la ligne dans le fichier (pour les messages d'erreur). */
  readonly ligne: number;
  /** La soutenance décrite, si la ligne est exploitable. */
  readonly soutenance?: Soutenance;
  /** Message français si la ligne est invalide. */
  readonly erreur?: string;
}

/** Résultat de la lecture d'un classeur de planning. */
export interface ResultatPlanning {
  /** Lignes exploitables, triées chronologiquement. */
  readonly valides: Soutenance[];
  /** Lignes rejetées, avec leur message. */
  readonly invalides: LignePlanning[];
}

/* -------------------------------------------------------------------------- */
/* Repérage des colonnes                                                       */
/* -------------------------------------------------------------------------- */

type ClePlanning =
  'date' | 'heure' | 'heureFin' | 'titre' | 'etudiant' | 'directeur' | 'jury2' | 'jury3' | 'salle';

interface DefinitionColonne {
  readonly cle: ClePlanning;
  readonly alias: readonly string[];
  /** Fragments qui disqualifient l'en-tête pour ce champ. */
  readonly exclut?: readonly string[];
}

/**
 * Alias acceptés, **dans l'ordre de priorité**.
 *
 * L'inclusion (`cle.includes(alias)`) absorbe les formulations libres :
 * « Étudiant·e » → `etudiante`, « Titre du mémoire » → `titredumemoire`,
 * « jury 2 » → `jury2`…
 */
const COLONNES: readonly DefinitionColonne[] = [
  { cle: 'date', alias: ['date', 'jour'] },
  {
    cle: 'heure',
    alias: ['heuredebut', 'heure', 'horaire', 'debut'],
    // « Heure de fin » ne doit pas être prise pour l'heure de début.
    exclut: ['fin'],
  },
  { cle: 'heureFin', alias: ['heurefin', 'fin'] },
  { cle: 'titre', alias: ['titredumemoire', 'titrememoire', 'titre', 'memoire'] },
  { cle: 'etudiant', alias: ['etudiant', 'etudiante', 'nometudiant'] },
  { cle: 'directeur', alias: ['directeur', 'directric', 'directeurdememoire'] },
  { cle: 'jury2', alias: ['jury2', 'deuxiememembre'] },
  { cle: 'jury3', alias: ['jury3', 'troisiememembre'] },
  { cle: 'salle', alias: ['salle', 'salles', 'room'] },
];

/**
 * Repère la colonne de chaque champ, sans jamais réutiliser un même en-tête.
 *
 * Fonction **pure** : testable sans Angular.
 */
export function indexerColonnesPlanning(entetes: readonly unknown[]): Record<ClePlanning, number> {
  const cles = entetes.map((entete) => normaliserEntete(String(entete ?? '')));
  const colonnes = Object.fromEntries(COLONNES.map(({ cle }) => [cle, -1])) as Record<
    ClePlanning,
    number
  >;
  const prises = new Set<number>();

  for (const { cle, alias, exclut } of COLONNES) {
    const trouve = cles.findIndex(
      (cleEntete, index) =>
        !prises.has(index) &&
        alias.some((nom) => cleEntete.includes(nom)) &&
        !(exclut ?? []).some((nom) => cleEntete.includes(nom)),
    );
    if (trouve >= 0) {
      colonnes[cle] = trouve;
      prises.add(trouve);
    }
  }
  return colonnes;
}

function cellule(row: readonly unknown[], index: number): unknown {
  if (index < 0) {
    return undefined;
  }
  return row[index] ?? undefined;
}

function texte(row: readonly unknown[], index: number): string {
  const valeur = cellule(row, index);
  if (valeur === undefined || valeur === null) {
    return '';
  }
  if (valeur instanceof Date) {
    return valeur.toISOString();
  }
  return String(valeur).trim();
}

function ligneVide(row: readonly unknown[]): boolean {
  return row.every(
    (valeur) => valeur === null || valeur === undefined || String(valeur).trim() === '',
  );
}

/** Ajoute `minutes` à une heure `'HH:mm'` (pas de changement de jour géré). */
export function ajouterMinutes(heure: string, minutes: number): string {
  const morceaux = /^(\d{1,2}):(\d{2})$/.exec(heure.trim());
  if (!morceaux) {
    return heure;
  }
  const total =
    Number.parseInt(morceaux[1] as string, 10) * 60 + Number.parseInt(morceaux[2] as string, 10);
  const borne = Math.min(23 * 60 + 59, total + minutes);
  const heures = Math.floor(borne / 60);
  const minutesRestantes = borne % 60;
  return `${heures.toString().padStart(2, '0')}:${minutesRestantes.toString().padStart(2, '0')}`;
}

/** Compare deux soutenances chronologiquement (date puis heure de début). */
export function comparerSoutenances(a: Soutenance, b: Soutenance): number {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
  }
  if (a.heureDebut !== b.heureDebut) {
    return a.heureDebut < b.heureDebut ? -1 : 1;
  }
  return a.salle.localeCompare(b.salle, 'fr');
}

/**
 * Séparateurs acceptés entre l'heure de début et l'heure de fin dans une
 * même cellule : trait d'union, demi-cadratin, tiret cadratin.
 */
const SEPARATEURS_HEURE = /\s*[-–—]\s*/;

/**
 * Analyse une cellule d'horaire du planning.
 *
 * Deux formes sont admises :
 *  - une **plage** `'HH:mm-HH:mm'` (forme produite par l'IA) : les deux
 *    extrémités sont exploitées ;
 *  - une **heure simple** `'HH:mm'` (ou cellule Excel) : seule l'heure de
 *    début est connue, l'heure de fin est déduite (+ 1 h).
 *
 * Fonction **pure** : testable sans Angular.
 */
export function analyserPlageHeure(valeur: unknown): Resultat<{ debut: string; fin?: string }> {
  if (typeof valeur === 'string') {
    const texte = valeur.trim();
    if (texte.length > 0 && SEPARATEURS_HEURE.test(texte)) {
      const morceaux = texte.split(SEPARATEURS_HEURE).filter((morceau) => morceau.length > 0);
      if (morceaux.length !== 2) {
        return { ok: false, erreur: 'Heure invalide (HH:mm ou HH:mm-HH:mm).' };
      }
      const debut = normalizeHeure(morceaux[0]);
      const fin = normalizeHeure(morceaux[1]);
      if (!debut.ok) {
        return debut;
      }
      if (!fin.ok) {
        return fin;
      }
      return { ok: true, valeur: { debut: debut.valeur, fin: fin.valeur } };
    }
  }

  const debut = normalizeHeure(valeur);
  if (!debut.ok) {
    return { ok: false, erreur: 'Heure invalide (HH:mm ou HH:mm-HH:mm).' };
  }
  return { ok: true, valeur: { debut: debut.valeur } };
}

/**
 * Analyse une feuille de planning déjà lue (tableau 2D).
 *
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function analyserFeuillePlanning(rangees: readonly unknown[][]): ResultatPlanning {
  const valides: Soutenance[] = [];
  const invalides: LignePlanning[] = [];

  if (rangees.length === 0) {
    return { valides, invalides };
  }

  const colonnes = indexerColonnesPlanning(rangees[0] as readonly unknown[]);
  if (colonnes.date < 0 || colonnes.heure < 0) {
    throw new Error(MESSAGE_COLONNES_PLANNING);
  }

  for (let index = 1; index < rangees.length; index++) {
    const row = rangees[index] as readonly unknown[];
    if (ligneVide(row)) {
      continue;
    }
    const numero = index + 1;

    const date = normalizeDate(cellule(row, colonnes.date));
    const plage = analyserPlageHeure(cellule(row, colonnes.heure));
    if (!date.ok) {
      invalides.push({ ligne: numero, erreur: 'Date invalide (AAAA-MM-JJ ou JJ/MM/AAAA).' });
      continue;
    }
    if (!plage.ok) {
      invalides.push({ ligne: numero, erreur: plage.erreur });
      continue;
    }
    // L'heure de fin vient, dans l'ordre : de la plage `HH:mm-HH:mm` de la
    // colonne « Heure », d'une colonne « heure de fin » dédiée, sinon de la
    // durée réglementaire d'une soutenance (1 h).
    const finColonne =
      colonnes.heureFin >= 0 ? normalizeHeure(cellule(row, colonnes.heureFin)) : null;
    const finExplicite = plage.valeur.fin ?? (finColonne?.ok ? finColonne.valeur : undefined);
    const heureFin = finExplicite ?? ajouterMinutes(plage.valeur.debut, DUREE_SOUTENANCE_MINUTES);
    if (heureFin <= plage.valeur.debut) {
      invalides.push({
        ligne: numero,
        erreur: "L'heure de fin doit être postérieure à l'heure de début.",
      });
      continue;
    }

    valides.push({
      date: date.valeur,
      heureDebut: plage.valeur.debut,
      heureFin,
      titre: texte(row, colonnes.titre),
      etudiant: texte(row, colonnes.etudiant),
      directeur: texte(row, colonnes.directeur),
      jury2: texte(row, colonnes.jury2),
      jury3: texte(row, colonnes.jury3),
      salle: texte(row, colonnes.salle),
    });
  }

  valides.sort(comparerSoutenances);
  return { valides, invalides };
}

/**
 * `PlanningImportService` — lecture d'un classeur de planning dans le
 * navigateur.
 */
@Injectable({ providedIn: 'root' })
export class PlanningImportService {
  private readonly xlsx: XLSXBackend = inject(XLSX_BACKEND);

  /**
   * Lit, normalise et valide un classeur de planning `.xlsx`.
   *
   * @param fichier le classeur déposé par l'administrateur
   * @returns les soutenances exploitables et les lignes rejetées
   */
  async lire(fichier: File): Promise<ResultatPlanning> {
    if (!/\.xlsx$/i.test(fichier.name)) {
      throw new Error(MESSAGE_FORMAT_PLANNING);
    }

    let rangees: unknown[][];
    try {
      rangees = await this.lireFeuillePlanning(fichier);
    } catch (erreur) {
      if (erreur instanceof Error && erreur.message === MESSAGE_COLONNES_PLANNING) {
        throw erreur;
      }
      throw new Error('Fichier illisible ou corrompu : impossible de lire le classeur.');
    }

    return analyserFeuillePlanning(rangees);
  }

  /**
   * Lit la feuille « Planning » ; à défaut, la première feuille du classeur.
   *
   * La feuille peut s'appeler « planning », « Planning », « Feuille 1 »…
   * `read-excel-file` échoue si la feuille demandée n'existe pas : on retombe
   * alors sur la première feuille.
   */
  private async lireFeuillePlanning(fichier: File): Promise<unknown[][]> {
    try {
      return await this.xlsx.lire(fichier, FEUILLE_PLANNING);
    } catch {
      return this.xlsx.lire(fichier);
    }
  }
}
