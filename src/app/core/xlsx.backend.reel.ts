/**
 * `XLSXReelBackend` — l'implémentation production du `XLSXBackend`.
 *
 * Importe `read-excel-file` **dynamiquement** pour rester sous le budget
 * initial (le SDK n'est chargé que quand l'utilisateur ouvre
 * l'écran d'import admin).
 */
import { Injectable } from '@angular/core';
import type { XLSXBackend } from './xlsx.backend';

@Injectable({ providedIn: 'root' })
export class XLSXReelBackend implements XLSXBackend {
  async lire(fichier: File): Promise<unknown[][]> {
    const mod = await import('read-excel-file');
    return (await mod.default(fichier)) as unknown[][];
  }
}
