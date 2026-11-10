import { Injectable } from '@angular/core';
import { CalendarA11y, CalendarEvent, type A11yParams } from 'angular-calendar';

import { dateLocale, formaterJour, libelleHeure } from '../../shared/date.util';
import { extraireMeta } from '../../shared/calendrier.util';
import type { ProfDispo } from '../../data/dispo-prof.service';
import type { Dispo } from '../../data/models';

/** Métadonnées portées par un événement du calendrier des professeurs. */
export interface MetaDispoProf {
  /** Le professeur dont la disponibilité est représentée. */
  readonly prof: ProfDispo;
  /** La disponibilité représentée. */
  readonly dispo: Dispo;
}

/** Extraire les métadonnées d'un événement (tolérant aux événements sans méta). */
export function metaDispoProf(evenement: CalendarEvent | null | undefined): MetaDispoProf | null {
  return extraireMeta<MetaDispoProf>(evenement, ['prof', 'dispo']);
}

/**
 * `ProfsCalendarA11y` — description alternative française des événements.
 *
 * Le plug-in annonce par défaut « Saturday October 19th, Event, from 11:00am
 * to 5:00pm » (anglais, format 12 h). On le remplace par un libellé
 * explicite : « Judith ABENSOUR, disponible lundi 12 janvier de 8 h 45 à
 * 9 h 30 ».
 */
@Injectable()
export class ProfsCalendarA11y extends CalendarA11y {
  override eventDescription({ event }: A11yParams): string {
    const meta = metaDispoProf(event);
    if (!meta) {
      return super.eventDescription({ event, locale: 'fr' });
    }
    const jour = dateLocale(meta.dispo.date);
    const jourFr = jour ? formaterJour(jour) : meta.dispo.date;
    return `${meta.prof.nomComplet}, disponible ${jourFr} de ${libelleHeure(meta.dispo.heureDebut)} à ${libelleHeure(meta.dispo.heureFin)}`;
  }
}
