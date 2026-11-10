import { Injectable } from '@angular/core';
import { CalendarA11y, type A11yParams, type CalendarEvent } from 'angular-calendar';

import { dateLocale, formaterJour, libelleHeure } from '../../shared/date.util';
import { extraireMeta } from '../../shared/calendrier.util';
import type { Soutenance } from '../../data/planning-import.service';

/** Métadonnées portées par un événement du calendrier de planning. */
export interface MetaSoutenance {
  /** La soutenance représentée par l'événement. */
  readonly soutenance: Soutenance;
}

/** Extraire les métadonnées d'un événement (tolérant aux événements sans méta). */
export function metaSoutenance(evenement: CalendarEvent | null | undefined): MetaSoutenance | null {
  return extraireMeta<MetaSoutenance>(evenement, ['soutenance']);
}

/**
 * `PlanningCalendarA11y` — description alternative française des soutenances.
 *
 * Le plug-in annonce par défaut « Saturday October 19th, Event, from 11:00am
 * to 5:00pm ». On le remplace par un libellé explicite :
 * « Titre du mémoire, étudiant·e, salle S12, lundi 12 janvier de 9 h à 10 h ».
 */
@Injectable()
export class PlanningCalendarA11y extends CalendarA11y {
  override eventDescription({ event }: A11yParams): string {
    const meta = metaSoutenance(event);
    if (!meta) {
      return super.eventDescription({ event, locale: 'fr' });
    }
    const soutenance = meta.soutenance;
    const jour = dateLocale(soutenance.date);
    const jourFr = jour ? formaterJour(jour) : soutenance.date;
    const pieces = [
      soutenance.titre || 'Soutenance',
      soutenance.etudiant,
      soutenance.salle ? `salle ${soutenance.salle}` : '',
      `${jourFr} de ${libelleHeure(soutenance.heureDebut)} à ${libelleHeure(soutenance.heureFin)}`,
    ].filter((piece) => piece.length > 0);
    return pieces.join(', ');
  }
}
