import { Component, effect, input } from '@angular/core';
import { CalendarEvent } from 'angular-calendar';

import { fournisseursCalendrier } from '../dispos/calendrier.formatters';
import { ProfsCalendarA11y } from './profs-calendrier.formatters';
import { jourIso } from '../../shared/date.util';
import { ecartJours, IMPORTS_CALENDRIER, type VueCalendrier } from '../../shared/calendrier.util';
import { CalendrierBase } from '../../shared/calendrier-base';

export type VueProfs = VueCalendrier;

/**
 * `ProfsCalendarComponent` — calendrier des disponibilités **agrégées** de
 * plusieurs professeurs (espace administrateur).
 *
 * Le composant ne stocke rien : il reçoit les événements (`CalendarEvent`)
 * construits par la page parente, à partir des professeurs cochés dans la
 * liste située au-dessus. Un événement = une disponibilité d'un professeur.
 *
 * Les créneaux restent des chaînes `'YYYY-MM-DD'` / `'HH:mm'` côté modèle
 * (cf. AGENTS.md §13) : la conversion en `Date` local n'a lieu qu'au moment
 * du rendu.
 */
@Component({
  selector: 'app-profs-calendar',
  imports: [...IMPORTS_CALENDRIER],
  providers: [fournisseursCalendrier(ProfsCalendarA11y)],
  templateUrl: './profs-calendar.component.html',
  styleUrl: './profs-calendar.component.scss',
})
export class ProfsCalendarComponent extends CalendrierBase {
  /** Événements affichés (une disponibilité par professeur et par créneau). */
  readonly evenements = input.required<CalendarEvent[]>();

  constructor() {
    super();
    // La vue se place sur le premier jour comportant une disponibilité : sans
    // cela, le calendrier s'ouvrirait sur « aujourd'hui », souvent vide.
    effect(() => {
      const evenements = this.evenements();
      if (evenements.length === 0) {
        return;
      }
      const jours = this.joursAffiches();
      const jourCourant = jourIso(this.viewDate());
      const dansLaVue = [...jours].some((jour) => Math.abs(ecartJours(jour, jourCourant)) <= 3);
      if (!dansLaVue) {
        this.viewDate.set(evenements[0]?.start ?? new Date());
      }
    });
  }
}
