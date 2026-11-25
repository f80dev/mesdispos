/**
 * `BackupService` — **sauvegarde complète de la base** sous forme d'archive
 * ZIP, téléchargée directement par le navigateur de l'administrateur.
 *
 * Contenu de l'archive (une entrée par fichier, tout en JSON + deux CSV
 * lisibles dans Excel) :
 *
 * | Fichier          | Contenu                                              |
 * |------------------|------------------------------------------------------|
 * | `lisez-moi.txt`  | description du contenu et de la date de sauvegarde    |
 * | `meta.json`      | horodatage, version de l'application, volumétrie       |
 * | `creneaux.json`  | tous les créneaux proposés (`creneaux/{id}`)           |
 * | `creneaux.csv`   | idem, au format CSV                                   |
 * | `profils.json`   | tous les professeurs (`users/{uid}`)                   |
 * | `dispos.json`    | toutes les disponibilités (`users/{uid}/dispos/{id}`)  |
 * | `dispos.csv`     | idem, au format CSV                                   |
 *
 * La lecture passe par `FIRESTORE_BACKEND` : l'archive est donc assemblée
 * sans accès direct au SDK Firebase (testable avec un faux backend).
 *
 * La collection `admins` **n'est pas** exportée : `firestore.rules` n'en
 * permet la lecture qu'à son propre titulaire (et ces documents portent une
 * empreinte d'accès administrateur — autant ne pas les diffuser).
 */
import { Injectable, inject, signal } from '@angular/core';
import { strToU8, zipSync } from 'fflate';

import { FIRESTORE_BACKEND, type CreneauAdmin } from './firestore.backend';

/** Message d'erreur affiché quand la sauvegarde n'a pas pu être produite. */
export const MESSAGE_BACKUP_ECHEC = 'La sauvegarde a échoué. Réessayez.';

/** Résumé chiffré d'une sauvegarde. */
export interface ResumeSauvegarde {
  /** Nombre de créneaux exportés. */
  readonly creneaux: number;
  /** Nombre de profils de professeurs exportés. */
  readonly profils: number;
  /** Nombre de disponibilités exportées. */
  readonly dispos: number;
  /** Taille de l'archive, en octets. */
  readonly octets: number;
}

/** Contenu brut d'une sauvegarde (avant compression). */
export interface ContenuSauvegarde {
  readonly creneaux: readonly CreneauAdmin[];
  readonly profils: readonly { uid: string; data: Record<string, unknown> }[];
  readonly dispos: readonly { uid: string; id: string; data: Record<string, unknown> }[];
  /** Horodatage ISO de la sauvegarde. */
  readonly horodatage: string;
  /** Version de l'application (informative). */
  readonly version: string;
}

/** Nom du fichier ZIP, horodaté (ex. `mesdispos-sauvegarde-2026-11-25_1432.zip`). */
export function nomFichierSauvegarde(date: Date = new Date()): string {
  const pad = (valeur: number): string => String(valeur).padStart(2, '0');
  const jour = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const heure = `${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `mesdispos-sauvegarde-${jour}_${heure}.zip`;
}

/** Échappe une valeur pour l'écriture dans un CSV (séparateur `;`). */
function celluleCsv(valeur: unknown): string {
  if (valeur === null || valeur === undefined) {
    return '';
  }
  const texte = typeof valeur === 'object' ? JSON.stringify(valeur) : String(valeur);
  return /[";\n\r]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

/** Assemble les lignes d'un CSV (séparateur `;`, BOM UTF-8 pour Excel). */
function versCsv(entetes: readonly string[], lignes: readonly (readonly unknown[])[]): string {
  const parties = [entetes, ...lignes].map((ligne) => ligne.map(celluleCsv).join(';'));
  return '﻿' + parties.join('\r\n') + '\r\n';
}

/** Texte d'introduction placed dans l'archive. */
function lirezMoi(contenu: ContenuSauvegarde): string {
  return [
    'MesDispos — sauvegarde complète de la base',
    '',
    `Date de la sauvegarde : ${contenu.horodatage}`,
    `Version de l'application : ${contenu.version}`,
    '',
    'Contenu de l’archive :',
    `- creneaux.json / creneaux.csv : les ${contenu.creneaux.length} créneaux proposés ;`,
    `- profils.json : les ${contenu.profils.length} profils de professeurs (login, nom, prénom) ;`,
    `- dispos.json / dispos.csv : les ${contenu.dispos.length} disponibilités déclarées ;`,
    '- meta.json : horodatage et volumétrie de la sauvegarde.',
    '',
    'La collection « admins » n’est pas exportée (elle porte les accès',
    'administrateurs, lisibles par leur seul titulaire).',
    '',
    'Les données sont au format JSON (UTF-8) ; les fichiers CSV s’ouvrent',
    'directement dans Excel (séparateur « ; »).',
  ].join('\n');
}

/**
 * Assemble l'archive ZIP à partir du contenu brut.
 *
 * Fonction **pure** : testable sans Angular ni Firestore.
 *
 * @returns les octets de l'archive ZIP.
 */
export function construireArchive(contenu: ContenuSauvegarde): Uint8Array {
  const meta = {
    application: 'MesDispos',
    version: contenu.version,
    horodatage: contenu.horodatage,
    creneaux: contenu.creneaux.length,
    profils: contenu.profils.length,
    dispos: contenu.dispos.length,
  };

  const creneaux: Record<string, unknown>[] = contenu.creneaux.map((creneau) => ({
    id: creneau.id,
    ...creneau.data,
  }));
  const profils: Record<string, unknown>[] = contenu.profils.map((profil) => ({
    uid: profil.uid,
    ...profil.data,
  }));
  const dispos: Record<string, unknown>[] = contenu.dispos.map((dispo) => ({
    uid: dispo.uid,
    creneauId: dispo.id,
    ...dispo.data,
  }));

  return zipSync({
    'lisez-moi.txt': strToU8(lirezMoi(contenu)),
    'meta.json': strToU8(JSON.stringify(meta, null, 2)),
    'creneaux.json': strToU8(JSON.stringify(creneaux, null, 2)),
    'creneaux.csv': strToU8(
      versCsv(
        ['id', 'date', 'heureDebut', 'heureFin', 'libelle'],
        creneaux.map((c) => [
          c['id'] ?? '',
          c['date'] ?? '',
          c['heureDebut'] ?? '',
          c['heureFin'] ?? '',
          c['libelle'] ?? '',
        ]),
      ),
    ),
    'profils.json': strToU8(JSON.stringify(profils, null, 2)),
    'dispos.json': strToU8(JSON.stringify(dispos, null, 2)),
    'dispos.csv': strToU8(
      versCsv(
        ['uid', 'creneauId', 'date', 'heureDebut', 'heureFin', 'libelle'],
        dispos.map((d) => [
          d['uid'] ?? '',
          d['creneauId'] ?? '',
          d['date'] ?? '',
          d['heureDebut'] ?? '',
          d['heureFin'] ?? '',
          d['libelle'] ?? '',
        ]),
      ),
    ),
  });
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly backend = inject(FIRESTORE_BACKEND);

  /** `true` pendant la fabrication de l'archive. */
  readonly enCours = signal<boolean>(false);

  /** Message d'erreur de la sauvegarde, `null` si tout va bien. */
  readonly erreur = signal<string | null>(null);

  /**
   * Lit la base et renvoie le contenu brut de la sauvegarde.
   *
   * @throws si le backend ne sait pas lire les créneaux (sauvegarde
   *   impossible) ou si la lecture Firestore échoue.
   */
  async lire(): Promise<ContenuSauvegarde> {
    if (!this.backend.configure) {
      throw new Error('Firebase non configuré');
    }
    if (!this.backend.lireTousCreneaux) {
      throw new Error(MESSAGE_BACKUP_ECHEC);
    }
    const [creneaux, profils, dispos] = await Promise.all([
      this.backend.lireTousCreneaux(),
      this.backend.listerProfils(),
      this.backend.lireToutesDispos(),
    ]);
    return {
      creneaux,
      profils,
      dispos,
      horodatage: new Date().toISOString(),
      version: '1',
    };
  }

  /**
   * Produit l'archive ZIP de la base et **déclenche le téléchargement**.
   *
   * @returns le résumé chiffré de la sauvegarde.
   */
  async telecharger(): Promise<ResumeSauvegarde> {
    this.enCours.set(true);
    this.erreur.set(null);
    try {
      const contenu = await this.lire();
      const octets = construireArchive(contenu);
      const nom = nomFichierSauvegarde();
      const blob = new Blob([octets as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = nom;
      lien.rel = 'noopener';
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      // Laisse au navigateur le temps de démarrer le téléchargement.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return {
        creneaux: contenu.creneaux.length,
        profils: contenu.profils.length,
        dispos: contenu.dispos.length,
        octets: octets.length,
      };
    } catch (erreur) {
      this.erreur.set(erreur instanceof Error ? erreur.message : MESSAGE_BACKUP_ECHEC);
      throw erreur;
    } finally {
      this.enCours.set(false);
    }
  }
}
