/**
 * `CalendrierBase` — socle commun des deux calendriers.
 *
 * Les composants `CreneauCalendarComponent` (enseignant) et
 * `ProfsCalendarComponent` (administrateur) ne diffèrent que par la **source**
 * des événements et par le contenu d'une case. Tout le reste — navigation,
 * vue courante, plage horaire affichée, pastille des jours — est identique et
 * vit ici une seule fois.
 */
import { computed, signal, type Signal } from '@angular/core';
import { CalendarEvent, CalendarView } from 'angular-calendar';

import { jourIso } from './date.util';
import { vueParDefaut, type VueCalendrier } from './calendrier.util';

export abstract class CalendrierBase {
  /** Événements affichés — fournis par le composant concret. */
  abstract readonly evenements: Signal<CalendarEvent[]>;

  /** Vue affichée (« jour » ou « semaine »). */
  readonly vue = signal<VueCalendrier>(vueParDefaut());

  /** Date pivot de la vue courante (navigation précédent / aujourd'hui / suivant). */
  readonly viewDate = signal<Date>(new Date());

  /** Exposition de l'énumération pour le template. */
  readonly CalendarView = CalendarView;

  /** Locale française (titres de colonnes, libellés de jours). */
  readonly locale = 'fr';

  /** La semaine française commence le lundi. */
  readonly weekStartsOn = 1;

  /** Jours ('YYYY-MM-DD') comportant au moins un événement affiché. */
  readonly joursAffiches = computed<ReadonlySet<string>>(() => {
    const jours = new Set<string>();
    for (const evenement of this.evenements()) {
      jours.add(jourIso(evenement.start));
    }
    return jours;
  });

  /**
   * Première heure affichée (bornée par les événements), pour éviter une grille
   * vide. Aucune marge n'est ajoutée : la grille démarre à l'heure du
   * premier créneau, ce qui réduit la hauteur affichée.
   */
  readonly heureDebut = computed(() => {
    const heures = this.evenements()
      .map((evenement) => evenement.start.getHours())
      .filter((heure) => Number.isFinite(heure));
    if (heures.length === 0) {
      return 8;
    }
    return Math.max(0, Math.min(23, Math.min(...heures)));
  });

  /**
   * Dernière heure affichée (bornée par les événements) : dernière heure pleine
   * couverte par un créneau, sans heure supplémentaire.
   */
  readonly heureFin = computed(() => {
    const heures = this.evenements()
      .map((evenement) => evenement.end?.getHours() ?? Number.NaN)
      .filter((heure) => Number.isFinite(heure));
    if (heures.length === 0) {
      return 19;
    }
    return Math.max(this.heureDebut(), Math.min(23, Math.max(...heures)));
  });

  /** Ce jour comporte-t-il au moins un événement affiché ? (pastille d'en-tête) */
  aDesAffiches(date: Date): boolean {
    return this.joursAffiches().has(jourIso(date));
  }

  /**
   * Les 7 jours de la semaine affichée (lundi → dimanche), à partir de la
   * date pivot de la vue courante.
   */
  readonly joursSemaineCourante = computed<Date[]>(() => {
    const pivot = this.viewDate();
    const decalage = (pivot.getDay() - this.weekStartsOn + 7) % 7;
    const lundi = new Date(pivot.getFullYear(), pivot.getMonth(), pivot.getDate() - decalage);
    return Array.from({ length: 7 }, (_, index) =>
      new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + index),
    );
  });

  /**
   * Numéros de jour de la semaine (0 = dimanche) **sans aucun événement** dans
   * la semaine affichée : le plug-in `angular-calendar` exclut alors ces
   * colonnes de la vue « semaine » (aucune colonne vide à l'écran).
   */
  readonly joursExclus = computed<number[]>(() =>
    this.joursSemaineCourante()
      .filter((jour) => !this.joursAffiches().has(jourIso(jour)))
      .map((jour) => jour.getDay()),
  );

  /** La semaine affichée ne comporte aucun événement. */
  readonly semaineVide = computed(
    () => this.joursSemaineCourante().every((jour) => !this.joursAffiches().has(jourIso(jour))),
  );

  /** Le jour affiché (vue « jour ») ne comporte aucun événement. */
  readonly jourCourantVide = computed(() => !this.joursAffiches().has(jourIso(this.viewDate())));

  /** Bascule entre la vue « semaine » et la vue « jour ». */
  changerVue(vue: VueCalendrier): void {
    this.vue.set(vue);
  }
}
