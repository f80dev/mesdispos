import { Injectable, inject } from '@angular/core';

import { FIRESTORE_BACKEND } from '../core/firestore.backend';
import { MESSAGE_CONFIG_MANQUANTE } from '../core/firebase';
import { XLSX_BACKEND, type XLSXBackend } from '../core/xlsx.backend';
import { utilisateurAnonyme } from '../core/auth.service';
import { lireLignesProfs, type LigneProfImport } from './prof.service';
import {
  ErreurImport,
  EXTENSION_ACCEPTEE,
  MESSAGE_FORMAT,
} from './excel-import.service';

/** Résultat de l'analyse d'un fichier `profs.xlsx` (liste des professeurs). */
export interface ResultatImportProfs {
  valides: LigneProfImport[];
  invalides: LigneProfImport[];
}

/**
 * `ProfsImportService` — import de la liste des professeurs (espace
 * administrateur), dans le **même format** que `profs.xlsx` (feuille
 * « Enseignants ») : colonnes « Identifiant Oasis », « Nom usuel »,
 * « Prénom usuel », « Secteur », « Statut » et « Email ».
 *
 * L'import écrit une partition `users/{uid}` par professeur, avec `uid` dérivé
 * du nom affiché (`anon_<sha256(nomComplet)[:12]>`) — le même identifiant que
 * celui produit par la connexion « nom seul ». L'adresse électronique et le
 * statut du fichier sont enregistrés avec la fiche.
 */
@Injectable({ providedIn: 'root' })
export class ProfsImportService {
  private readonly backend = inject(FIRESTORE_BACKEND);
  private readonly xlsx: XLSXBackend = inject(XLSX_BACKEND);

  /** Lit, normalise et valide un fichier `profs.xlsx`. Ne bloque pas sur les lignes invalides. */
  async lire(fichier: File): Promise<ResultatImportProfs> {
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

    const lignes = lireLignesProfs(rangees);
    const loginsEnBase = await this.loginsEnBase();
    const vusDansFichier = new Set<string>();
    const valides: LigneProfImport[] = [];
    const invalides: LigneProfImport[] = [];

    for (const ligne of lignes) {
      if (ligne.erreur === undefined && loginsEnBase.has(ligne.login)) {
        ligne.erreur = 'Professeur déjà présent en base.';
      }
      if (ligne.erreur === undefined) {
        if (vusDansFichier.has(ligne.login)) {
          ligne.erreur = 'Doublon dans le fichier.';
        } else {
          vusDansFichier.add(ligne.login);
        }
      }
      (ligne.erreur === undefined ? valides : invalides).push(ligne);
    }

    return { valides, invalides };
  }

  /**
   * Upsert batch des professeurs dans `users/{uid}`, par lots de 500.
   * @returns le nombre de professeurs écrits.
   */
  async importer(lignes: readonly LigneProfImport[]): Promise<{ importes: number }> {
    if (!this.backend.configure) {
      throw new ErreurImport(MESSAGE_CONFIG_MANQUANTE);
    }
    const items = lignes
      .filter((ligne) => ligne.erreur === undefined)
      .map((ligne) => ({
        uid: utilisateurAnonyme([ligne.prenom, ligne.nom].filter(Boolean).join(' ')).uid,
        data: {
          login: ligne.login,
          nom: ligne.nom,
          prenom: ligne.prenom,
          ...(ligne.secteur ? { secteur: ligne.secteur } : {}),
          ...(ligne.email ? { email: ligne.email } : {}),
          ...(ligne.statut ? { statut: ligne.statut } : {}),
          updatedAt: Date.now(),
        },
      }));
    const importes = await this.backend.upsertProfils(items);
    return { importes };
  }

  /** Logins déjà présents dans `users` (détection des doublons en base). */
  private async loginsEnBase(): Promise<Set<string>> {
    if (!this.backend.configure) {
      return new Set<string>();
    }
    try {
      const profils = await this.backend.listerProfils();
      return new Set(
        profils
          .map((profil) => (typeof profil.data?.['login'] === 'string' ? profil.data['login'] : ''))
          .filter((login) => login.length > 0),
      );
    } catch {
      return new Set<string>();
    }
  }
}
