import { Pipe, type PipeTransform } from '@angular/core';

const FORMATTEUR = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * `dateGroup` — `'YYYY-MM-DD'` → « lundi 12 janvier 2026 » (F3).
 *
 * La date est reconstruite en **local** (`new Date(a, m - 1, j)`) et non passée
 * à `new Date('2026-01-12')` (qui vaut minuit UTC et reculerait d'un jour dans
 * les fuseaux à l'ouest de Greenwich). Aucun stockage d'`epoch` : ce pipe est un
 * simple rendu (ADR : « fuseaux et pipe de date »).
 */
@Pipe({ name: 'dateGroup', standalone: true, pure: true })
export class DateGroupPipe implements PipeTransform {
  transform(valeur: string | null | undefined): string {
    if (!valeur) {
      return '';
    }
    const morceaux = valeur.slice(0, 10).split('-');
    if (morceaux.length !== 3) {
      return valeur;
    }
    const [annee, mois, jour] = morceaux.map((partie) => Number.parseInt(partie, 10));
    if (Number.isNaN(annee) || Number.isNaN(mois) || Number.isNaN(jour)) {
      return valeur;
    }
    const date = new Date(annee, mois - 1, jour);
    if (date.getFullYear() !== annee || date.getMonth() !== mois - 1 || date.getDate() !== jour) {
      return valeur;
    }
    return FORMATTEUR.format(date);
  }
}
