import { Injectable } from '@angular/core';
import {
  CalendarA11y,
  CalendarDateFormatter,
  CalendarEvent,
  CalendarEventTitleFormatter,
  type A11yParams,
  type DateFormatterParams,
} from 'angular-calendar';

import { libelleCreneauAccessible } from '../../shared/date.util';
import type { Creneau } from '../../data/models';

/** Métadonnées portées par un événement du calendrier. */
export interface MetaCreneau {
  /** Le créneau représenté par l'événement. */
  creneau: Creneau;
  /** `true` si le créneau est déjà retenu par l'utilisateur. */
  retenu: boolean;
}

/** Extraire les métadonnées d'un événement (tolérant aux événements sans méta). */
export function metaCreneau(evenement: CalendarEvent | null | undefined): MetaCreneau | null {
  const meta = evenement?.meta as Partial<MetaCreneau> | undefined;
  return meta && meta.creneau ? { creneau: meta.creneau, retenu: meta.retenu === true } : null;
}

/* -------------------------------------------------------------------------- */
/* Format des dates                                                            */
/* -------------------------------------------------------------------------- */

const JOURS = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });
const JOURS_COURTS = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const JOUR_MOIS = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const JOUR_MOIS_COURT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const JOUR_MOIS_ANNEE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Décale une date de `n` jours (fuseau local). */
function decaler(date: Date, jours: number): Date {
  const copie = new Date(date.getTime());
  copie.setDate(copie.getDate() + jours);
  return copie;
}

/**
 * `CalendrierDateFormatter` — libellés du calendrier **en français**.
 *
 * Le plug-in formate par défaut avec `formatDate(..., 'h a')` (« 8 AM »), des
 * noms de jours anglais (« Monday ») et des titres anglo-saxons
 * (« Jan 12 - 18, 2026 »). On les remplace par des libellés français
 * conformes à la charte de l'application (24 h, « 8 h 45 », « lundi »).
 */
@Injectable()
export class CalendrierDateFormatter extends CalendarDateFormatter {
  override weekViewColumnHeader({ date }: DateFormatterParams): string {
    return JOURS_COURTS.format(date).replace('.', '');
  }

  override weekViewColumnSubHeader({ date }: DateFormatterParams): string {
    return JOUR_MOIS_COURT.format(date);
  }

  override weekViewHour({ date }: DateFormatterParams): string {
    return HEURE.format(date);
  }

  override dayViewHour({ date }: DateFormatterParams): string {
    return HEURE.format(date);
  }

  override dayViewTitle({ date }: DateFormatterParams): string {
    return JOUR_MOIS_ANNEE.format(date);
  }

  /** « 12 – 18 janvier 2026 » (ou « 28 déc. 2026 – 3 janv. 2027 »). */
  override weekViewTitle({ date, weekStartsOn = 1 }: DateFormatterParams): string {
    const debutSemaine = weekStartsOn ?? 1;
    const decalage = (date.getDay() - debutSemaine + 7) % 7;
    const debut = decaler(date, -decalage);
    const fin = decaler(debut, 6);

    const memeMois =
      debut.getFullYear() === fin.getFullYear() && debut.getMonth() === fin.getMonth();
    if (memeMois) {
      const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' }).format(debut);
      return `${jour} – ${JOUR_MOIS_ANNEE.format(fin)}`;
    }
    return `${JOUR_MOIS_ANNEE.format(debut)} – ${JOUR_MOIS_ANNEE.format(fin)}`;
  }
}

/* -------------------------------------------------------------------------- */
/* Titres d'événements                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `CalendrierEventTitleFormatter` — titres d'événements en français.
 *
 * Le titre affiché dans la case est l'horaire seul (« 08:45 – 09:30 ») ; le
 * libellé éventuel du créneau est rendu dans une seconde ligne par le
 * template `eventTitleTemplate` du composant.
 */
@Injectable()
export class CalendrierEventTitleFormatter extends CalendarEventTitleFormatter {
  override week(event: CalendarEvent, title: string): string {
    return this.horaire(event) ?? title;
  }

  override day(event: CalendarEvent, title: string): string {
    return this.horaire(event) ?? title;
  }

  override weekTooltip(event: CalendarEvent, title: string): string {
    const meta = metaCreneau(event);
    if (!meta) {
      return title;
    }
    const base = this.horaire(event) ?? title;
    return meta.creneau.libelle ? `${base} — ${meta.creneau.libelle}` : base;
  }

  override dayTooltip(event: CalendarEvent, title: string): string {
    return this.weekTooltip(event, title);
  }

  /** Horaire « 08:45 – 09:30 » du créneau porté par l'événement. */
  private horaire(event: CalendarEvent): string | null {
    const meta = metaCreneau(event);
    if (!meta) {
      return null;
    }
    return `${meta.creneau.heureDebut} – ${meta.creneau.heureFin}`;
  }
}

/* -------------------------------------------------------------------------- */
/* Accessibilité                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `CalendrierA11y` — descriptions alternatives en français.
 *
 * Le plug-in annonce « Saturday October 19th, Event, from 11:00am to 5:00pm »
 * (anglais, format 12 h). On réutilise le libellé d'accessibilité des cartes
 * de créneau (§F3) : « Disponible lundi 12 janvier de 8 h 45 à 9 h 30 ».
 */
@Injectable()
export class CalendrierA11y extends CalendarA11y {
  override eventDescription({ event }: A11yParams): string {
    const meta = metaCreneau(event);
    if (meta) {
      return libelleCreneauAccessible(meta.creneau, meta.retenu);
    }
    return super.eventDescription({ event, locale: 'fr' });
  }
}
