/**
 * Utilitaires partagés par les deux calendriers de l'application
 * (`creneau-calendar` côté enseignant, `profs-calendar` côté administrateur).
 *
 * Objectif : une seule définition des imports, du type de vue, du calcul de la
 * vue par défaut et de l'extraction des métadonnées d'un événement, plutôt
 * qu'une copie dans chaque composant.
 */
import {
  CalendarDatePipe,
  CalendarDayViewComponent,
  CalendarEvent,
  CalendarNextViewDirective,
  CalendarPreviousViewDirective,
  CalendarTodayDirective,
  CalendarView,
  CalendarWeekViewComponent,
} from 'angular-calendar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/** Vue courante d'un calendrier : journée ou semaine. */
export type VueCalendrier = CalendarView.Day | CalendarView.Week;

/** Imports Angular communs aux deux calendriers. */
export const IMPORTS_CALENDRIER = [
  CalendarDatePipe,
  CalendarDayViewComponent,
  CalendarNextViewDirective,
  CalendarPreviousViewDirective,
  CalendarTodayDirective,
  CalendarWeekViewComponent,
  MatButtonModule,
  MatIconModule,
];

/**
 * Vue par défaut : « jour » sur smartphone, « semaine » au-delà de 900 px
 * (7 colonnes sont illisibles sur un petit écran).
 */
export function vueParDefaut(): VueCalendrier {
  return typeof window !== 'undefined' && window.innerWidth < 900
    ? CalendarView.Day
    : CalendarView.Week;
}

/** Nombre de jours entre deux jours ISO (positif = `a` après `b`). */
export function ecartJours(a: string, b: string): number {
  const dateA = new Date(`${a}T00:00:00`);
  const dateB = new Date(`${b}T00:00:00`);
  return Math.round((dateA.getTime() - dateB.getTime()) / 86_400_000);
}

/**
 * Extrait les métadonnées d'un événement du calendrier de façon tolérante :
 * `null` si l'événement ou l'une des clés requises est absent.
 */
export function extraireMeta<T extends object>(
  evenement: CalendarEvent | null | undefined,
  cles: readonly (keyof T)[],
): T | null {
  const meta = evenement?.meta as Partial<T> | undefined;
  if (!meta || cles.some((cle) => !meta[cle])) {
    return null;
  }
  return meta as T;
}
