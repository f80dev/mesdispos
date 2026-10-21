import { Injectable, inject } from '@angular/core';

import { FIRESTORE_BACKEND } from '../core/firestore.backend';
import { MESSAGE_CONFIG_MANQUANTE } from '../core/firebase';
import { XLSX_BACKEND, type XLSXBackend } from '../core/xlsx.backend';
import { idCreneau } from './models';
import { normalizeDate, normalizeHeure } from '../shared/date.util';
import type { Creneau, LigneImport, ResultatImport } from './models';

/** Extension acceptée : `.xlsx` uniquement (§13 : « PAS de `.xls` »). */
export const EXTENSION_ACCEPTEE = '.xlsx';

/** Message de refus poli de tout autre format (AC-12). */
export const MESSAGE_FORMAT = 'Format non pris en charge : utilisez un fichier Excel .xlsx';

/** Taille maximale d'un batch Firestore (F6 : 500 opérations, découpage auto). */
export const TAILLE_BATCH = 500;

/** Erreur métier de l'import (format de fichier, feuille illisible…). */
export class ErreurImport extends Error {}

/**
 * Réduit un en-tête à une clé de comparaison insensible à la casse, aux accents
 * et à la ponctuation : `'Heure de début'` → `'heurededebut'`, `'Libellé'` →
 * `'libelle'`, `'HEURE_DEBUT'` → `'heuredebut'`.
 */
export function normaliserEntete(entete: string): string {
  return entete
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

// Ordre de priorité : `date` → `heure_debut` → `heure_fin` → `libelle`.
// On utilise l'inclusion (`cle.includes(alias)`) pour absorber les formulations
// libres comme « Heure de début », « heure de fin (hh:mm) », « Date séance »…
const ALIAS: ReadonlyArray<{ colonne: keyof Colonnes; alias: readonly string[] }> = [
  { colonne: 'date', alias: ['date', 'jour', 'le'] },
  { colonne: 'debut', alias: ['heuredebut', 'debut', 'hdebut', 'heuredebut'] },
  { colonne: 'fin', alias: ['heurefin', 'hfin', 'fin', 'heuredefin'] },
  { colonne: 'libelle', alias: ['libelle', 'intitule', 'label', 'nom'] },
];

interface Colonnes {
  date: number;
  debut: number;
  fin: number;
  libelle: number;
}

/** Repère la colonne de chaque champ, sans jamais réutiliser un même en-tête. */
export function indexerColonnes(entetes: readonly string[]): Colonnes {
  const cles = entetes.map(normaliserEntete);
  const colonnes: Colonnes = { date: -1, debut: -1, fin: -1, libelle: -1 };
  const prises = new Set<number>();

  for (const { colonne, alias } of ALIAS) {
    const trouve = cles.findIndex(
      (cle, index) => !prises.has(index) && alias.some((nom) => cle.includes(nom)),
    );
    if (trouve >= 0) {
      colonnes[colonne] = trouve;
      prises.add(trouve);
    }
  }
  return colonnes;
}

function cellule(
  row: readonly unknown[],
  index: number,
): string | number | boolean | Date | undefined {
  if (index < 0) {
    return undefined;
  }
  const valeur = row[index];
  return valeur === null ? undefined : (valeur as string | number | boolean | Date | undefined);
}

function ligneVide(row: readonly unknown[]): boolean {
  return row.every(
    (valeur) => valeur === null || valeur === undefined || String(valeur).trim() === '',
  );
}

/**
 * `ExcelImportService` — import des créneaux (F6).
 *
 * Format attendu (1ʳᵉ feuille, 1ʳᵉ ligne = en-têtes, insensibles casse/accents) :
 * `date`, `heure_debut` (ou `debut`), `heure_fin` (ou `fin`), `libelle` (facultatif).
 * La lecture se fait **dans le navigateur** (`XLSX_BACKEND`) : aucun fichier
 * n'est envoyé sur un serveur.
 *
 * Les écritures Firestore passent par `FIRESTORE_BACKEND` (abstraction
 * injectable) pour rester testable sans `vi.mock`.
 */
@Injectable({ providedIn: 'root' })
export class ExcelImportService {
  private readonly backend = inject(FIRESTORE_BACKEND);
  private readonly xlsx: XLSXBackend = inject(XLSX_BACKEND);

  /** Lit, normalise et valide un fichier `.xlsx`. Ne bloque pas sur les lignes invalides. */
  async lire(fichier: File): Promise<ResultatImport> {
    const nom = fichier.name.toLowerCase();
    if (!nom.endsWith(EXTENSION_ACCEPTEE)) {
      throw new ErreurImport(MESSAGE_FORMAT);
    }

    let rangees: unknown[][];
    try {
      rangees = await this.xlsx.lire(fichier);
    } catch {
      throw new ErreurImport('Fichier illisible ou corrompu : impossible de lire le classeur.');
    }
    if (rangees.length === 0) {
      return { valides: [], invalides: [] };
    }

    const colonnes = indexerColonnes(rangees[0] as readonly string[]);
    if (colonnes.date < 0 || colonnes.debut < 0 || colonnes.fin < 0) {
      throw new ErreurImport(
        'Colonnes attendues : date, heure_debut (ou debut), heure_fin (ou fin), libelle (facultatif).',
      );
    }

    const dejaEnBase = await this.identifiantsEnBase();
    const vusDansFichier = new Set<string>();
    const valides: LigneImport[] = [];
    const invalides: LigneImport[] = [];

    for (let index = 1; index < rangees.length; index++) {
      const row = rangees[index] as readonly unknown[];
      if (ligneVide(row)) {
        continue;
      }
      const ligne = this.analyserLigne(index + 1, row, colonnes);
      if (ligne.erreur === undefined && dejaEnBase.has(idCreneau(ligne))) {
        ligne.erreur = 'Créneau déjà présent en base.';
      }
      if (ligne.erreur === undefined) {
        const cle = idCreneau(ligne);
        if (vusDansFichier.has(cle)) {
          ligne.erreur = 'Doublon dans le fichier.';
        } else {
          vusDansFichier.add(cle);
        }
      }
      if (ligne.erreur === undefined) {
        valides.push(ligne);
      } else {
        invalides.push(ligne);
      }
    }

    return { valides, invalides };
  }

  /** Valide une ligne et renvoie les messages français (§F6). */
  private analyserLigne(
    numeroLigne: number,
    row: readonly unknown[],
    colonnes: { date: number; debut: number; fin: number; libelle: number },
  ): LigneImport {
    const date = normalizeDate(cellule(row, colonnes.date));
    const debut = normalizeHeure(cellule(row, colonnes.debut));
    const fin = normalizeHeure(cellule(row, colonnes.fin));
    const brut = cellule(row, colonnes.libelle);
    const libelle = typeof brut === 'string' && brut.trim().length > 0 ? brut.trim() : undefined;

    const ligne: LigneImport = {
      ligne: numeroLigne,
      date: date.ok ? date.valeur : '',
      heureDebut: debut.ok ? debut.valeur : '',
      heureFin: fin.ok ? fin.valeur : '',
      ...(libelle ? { libelle } : {}),
    };

    if (!date.ok) {
      return { ...ligne, erreur: 'Date invalide (AAAA-MM-JJ ou JJ/MM/AAAA).' };
    }
    if (!debut.ok) {
      return { ...ligne, erreur: 'Heure de début invalide (HH:mm).' };
    }
    if (!fin.ok) {
      return { ...ligne, erreur: 'Heure de fin invalide (HH:mm).' };
    }
    if (ligne.heureFin <= ligne.heureDebut) {
      return { ...ligne, erreur: "L'heure de fin doit être postérieure à l'heure de début." };
    }
    return ligne;
  }

  /** Identifiants déjà présents dans `creneaux` (détection des doublons en base). */
  private async identifiantsEnBase(): Promise<Set<string>> {
    if (!this.backend.configure) {
      return new Set<string>();
    }
    try {
      const ids = await this.backend.listerIdsCreneaux();
      return new Set(ids);
    } catch {
      // Base injoignable : on n'empêche pas l'import (les rules rejoueront le contrôle).
      return new Set<string>();
    }
  }

  /**
   * Upsert batch dans `creneaux/{id}`, par lots de {@link TAILLE_BATCH}
   * opérations (F6). Renvoie le nombre de créneaux écrits.
   */
  async importer(lignes: readonly LigneImport[]): Promise<{ importes: number }> {
    if (!this.backend.configure) {
      throw new ErreurImport(MESSAGE_CONFIG_MANQUANTE);
    }
    const creneaux: Creneau[] = lignes
      .filter((ligne) => ligne.erreur === undefined)
      .map((ligne) => ({
        id: idCreneau(ligne),
        date: ligne.date,
        heureDebut: ligne.heureDebut,
        heureFin: ligne.heureFin,
        ...(ligne.libelle ? { libelle: ligne.libelle } : {}),
      }));

    const items = creneaux.map((creneau) => ({
      id: creneau.id,
      data: creneau as unknown,
    }));
    const importes = await this.backend.upsertCreneaux(items);
    return { importes };
  }
}
