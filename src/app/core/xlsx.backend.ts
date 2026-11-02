/**
 * Lecture des classeurs Excel — **contrat** injectable (`XLSX_BACKEND`) + son
 * implémentation production (`XLSXReelBackend`).
 *
 * L'abstraction permet aux tests unitaires de fournir un faux parseur Excel
 * (tableau 2D) sans `vi.mock`. En production, `read-excel-file` est importé
 * dynamiquement : le SDK n'est chargé que quand l'utilisateur ouvre l'écran
 * d'import admin.
 */
import { Injectable, InjectionToken } from '@angular/core';

export interface XLSXBackend {
  /** Parse un fichier `.xlsx` et renvoie un tableau de lignes. */
  lire(fichier: File): Promise<unknown[][]>;
}

export const XLSX_BACKEND = new InjectionToken<XLSXBackend>('XLSXBackend');

@Injectable({ providedIn: 'root' })
export class XLSXReelBackend implements XLSXBackend {
  async lire(fichier: File): Promise<unknown[][]> {
    const mod = await import('read-excel-file');
    return (await mod.default(fichier)) as unknown[][];
  }
}
