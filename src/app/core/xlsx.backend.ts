/**
 * Abstraction `read-excel-file` — injectable via `XLSX_BACKEND`.
 *
 * Permet aux tests unitaires de fournir un faux parseur Excel (table 2D)
 * sans `vi.mock`.
 *
 * En production, l'implémentation par défaut (`XLSXReelBackend`) appelle
 * `readXlsxFile` dynamiquement.
 */
import { InjectionToken } from '@angular/core';

export interface XLSXBackend {
  /** Parse un fichier `.xlsx` et renvoie un tableau de lignes. */
  lire(fichier: File): Promise<unknown[][]>;
}

export const XLSX_BACKEND = new InjectionToken<XLSXBackend>('XLSXBackend');
