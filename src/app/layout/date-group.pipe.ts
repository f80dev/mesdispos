import { Pipe, type PipeTransform } from '@angular/core';

import { dateLocale } from '../shared/date.util';

const FORMATTEUR = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * `dateGroup` — `'YYYY-MM-DD'` → « lundi 12 janvier 2026 » (F3).
 *
 * La conversion passe par `dateLocale()` (utilitaire pur partagé) : la date est
 * reconstruite en **local** et non passée à `new Date('2026-01-12')` (qui vaut
 * minuit UTC et reculerait d'un jour dans les fuseaux à l'ouest de Greenwich).
 * Aucun stockage d'`epoch` : ce pipe est un simple rendu (ADR : « fuseaux et
 * pipe de date »).
 */
@Pipe({ name: 'dateGroup', standalone: true, pure: true })
export class DateGroupPipe implements PipeTransform {
  transform(valeur: string | null | undefined): string {
    if (!valeur) {
      return '';
    }
    const date = dateLocale(valeur);
    return date ? FORMATTEUR.format(date) : valeur;
  }
}
