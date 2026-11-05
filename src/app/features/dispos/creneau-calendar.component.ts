import { Component, computed, effect, input, output, signal } from '@angular/core';
import {
  CalendarA11y,
  CalendarDateFormatter,
  CalendarDatePipe,
  CalendarDayViewComponent,
  CalendarEvent,
  CalendarEventTitleFormatter,
  CalendarNextViewDirective,
  CalendarPreviousViewDirective,
  CalendarTodayDirective,
  CalendarView,
  CalendarWeekViewComponent,
  DateAdapter,
  provideCalendar,
} from 'angular-calendar';
import { adapterFactory } from 'angular-calendar/date-adapters/date-fns';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import {
  CalendrierA11y,
  CalendrierDateFormatter,
  CalendrierEventTitleFormatter,
  metaCreneau,
} from './calendrier.formatters';
import { creneauVersIntervalle, dateLocale, jourIso } from '../../shared/date.util';
import type { Creneau } from '../../data/models';

/** Vue courante du calendrier : journée ou semaine. */
export type VueCalendrier = CalendarView.Day | CalendarView.Week;

/**
 * `CreneauCalendarComponent` — calendrier chronologique des créneaux
 * (plug-in `angular-calendar`, vues « jour » et « semaine »).
 *
 * Le calendrier est une **troisième représentation** des mêmes données que les
 * deux listes de la page `/dispos` : il ne stocke rien, il affiche les
 * créneaux (`Creneau`) et signale le clic (F4 — le clic EST l'enregistrement).
 *
 * Les créneaux sont dessinés en heure locale ; les dates restent des chaînes
 * `'YYYY-MM-DD'` et `'HH:mm'` côté modèle (cf. AGENTS.md §13 : jamais de
 * `Date` persisté).
 *
 * Présentation : les formateurs français (`./calendrier.formatters.ts`)
 * remplacent les libellés anglais du plug-in (« 8 AM », « Monday »), et la
 * feuille de style globale (`src/styles.scss`) remplace sa palette « legacy »
 * (fond blanc, événements bleus) par les rôles M3 de l'application.
 */
@Component({
  selector: 'app-creneau-calendar',
  imports: [
    CalendarDatePipe,
    CalendarDayViewComponent,
    CalendarNextViewDirective,
    CalendarPreviousViewDirective,
    CalendarTodayDirective,
    CalendarWeekViewComponent,
    MatButtonModule,
    MatIconModule,
  ],
  providers: [
    ...provideCalendar(
      { provide: DateAdapter, useFactory: adapterFactory },
      {
        dateFormatter: { provide: CalendarDateFormatter, useClass: CalendrierDateFormatter },
        eventTitleFormatter: {
          provide: CalendarEventTitleFormatter,
          useClass: CalendrierEventTitleFormatter,
        },
        a11y: { provide: CalendarA11y, useClass: CalendrierA11y },
      },
    ),
  ],
  templateUrl: './creneau-calendar.component.html',
  styleUrl: './creneau-calendar.component.scss',
})
export class CreneauCalendarComponent {
  /** Tous les créneaux proposés (retenus ou non). */
  readonly creneaux = input.required<Creneau[]>();

  /** Identifiants des créneaux déjà retenus (pour la coloration). */
  readonly idsSelectionnes = input<ReadonlySet<string>>(new Set<string>());

  /** Émis au clic sur un créneau du calendrier : le parent déclenche l'écriture. */
  readonly basculer = output<Creneau>();

  /**
   * Vue affichée (« jour » ou « semaine »). Sur smartphone, la vue « jour » est
   * retenue par défaut : 7 colonnes sont illisibles sous 900 px.
   */
  readonly vue = signal<VueCalendrier>(
    typeof window !== 'undefined' && window.innerWidth < 900 ? CalendarView.Day : CalendarView.Week,
  );

  /** Date pivot de la vue courante (navigation précédent / aujourd'hui / suivant). */
  readonly viewDate = signal<Date>(new Date());

  /** Jours ('YYYY-MM-DD') comportant au moins un créneau affiché. */
  readonly joursAffiches = computed(() => {
    const jours = new Set<string>();
    for (const creneau of this.creneaux()) {
      jours.add(creneau.date);
    }
    return jours;
  });

  /** Identifiants de la liste précédente — sert à détecter les ajouts. */
  private idsConnus = new Set<string>();

  constructor() {
    // Le calendrier affiche les disponibilités de l'utilisateur. À chaque
    // arrivée d'un créneau retenu, la vue se positionne sur son jour : un
    // créneau sélectionné devient immédiatement visible dans le calendrier.
    // La désélection d'un créneau ne déplace pas la vue.
    effect(() => {
      const creneaux = this.creneaux();
      const nouveaux = creneaux.filter((creneau) => !this.idsConnus.has(creneau.id));
      this.idsConnus = new Set(creneaux.map((creneau) => creneau.id));
      if (nouveaux.length === 0) {
        return;
      }
      const jour = [...nouveaux].map((creneau) => creneau.date).sort()[0] ?? '';
      const cible = dateLocale(jour);
      if (cible) {
        this.viewDate.set(cible);
      }
    });
  }

  /** Exposition de l'énumération pour le template. */
  readonly CalendarView = CalendarView;

  /** Locale française (titres de colonnes, libellés de jours). */
  readonly locale = 'fr';

  /** La semaine française commence le lundi. */
  readonly weekStartsOn = 1;

  /** Événements du calendrier, dérivés des créneaux (couleurs selon l'état). */
  readonly evenements = computed<CalendarEvent[]>(() => {
    const selectionnes = this.idsSelectionnes();
    const evenements: CalendarEvent[] = [];
    for (const creneau of this.creneaux()) {
      const intervalle = creneauVersIntervalle(creneau);
      if (!intervalle) {
        continue;
      }
      const retenu = selectionnes.has(creneau.id);
      evenements.push({
        id: creneau.id,
        title: `${creneau.heureDebut} – ${creneau.heureFin}`,
        start: intervalle.debut,
        end: intervalle.fin,
        cssClass: retenu ? 'creneau-evenement creneau-retenu' : 'creneau-evenement',
        meta: { creneau, retenu },
      });
    }
    return evenements;
  });

  /** Première heure affichée (bornée par les créneaux), pour éviter une grille vide. */
  readonly heureDebut = computed(() => {
    const heures = this.creneaux()
      .map((creneau) => Number.parseInt(creneau.heureDebut.slice(0, 2), 10))
      .filter((heure) => Number.isFinite(heure));
    if (heures.length === 0) {
      return 8;
    }
    return Math.max(0, Math.min(...heures) - 1);
  });

  /** Dernière heure affichée (bornée par les créneaux). */
  readonly heureFin = computed(() => {
    const heures = this.creneaux()
      .map((creneau) => Number.parseInt(creneau.heureFin.slice(0, 2), 10))
      .filter((heure) => Number.isFinite(heure));
    if (heures.length === 0) {
      return 19;
    }
    return Math.min(24, Math.max(...heures) + 1);
  });

  /** Un clic sur un événement du calendrier = un clic sur le créneau (F4). */
  surClicEvenement(evenement: CalendarEvent): void {
    const meta = metaCreneau(evenement);
    if (meta) {
      this.basculer.emit(meta.creneau);
    }
  }

  /** Libellé (optionnel) du créneau porté par l'événement — 2ᵉ ligne de la case. */
  libelleEvenement(evenement: CalendarEvent): string | undefined {
    return metaCreneau(evenement)?.creneau.libelle;
  }

  /** Ce jour comporte-t-il au moins une disponibilité affichée ? (pastille d'en-tête) */
  aDesAffiches(date: Date): boolean {
    return this.joursAffiches().has(jourIso(date));
  }

  /** Bascule entre la vue « semaine » et la vue « jour ». */
  changerVue(vue: VueCalendrier): void {
    this.vue.set(vue);
  }
}
