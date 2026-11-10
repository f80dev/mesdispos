import { Component, computed, effect, input, linkedSignal, signal } from '@angular/core';
import { CalendarEvent } from 'angular-calendar';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';

import { fournisseursCalendrier } from '../dispos/calendrier.formatters';
import { PlanningCalendarA11y } from './planning-calendrier.formatters';
import { IMPORTS_CALENDRIER } from '../../shared/calendrier.util';
import { dateLocale } from '../../shared/date.util';
import type { Soutenance } from '../../data/planning-import.service';

/**
 * `PlanningCalendarComponent` — calendrier **hebdomadaire** du planning de
 * soutenances produit par l'IA, filtrable par **salle**.
 *
 * Le composant ne stocke rien : il reçoit les soutenances (`Soutenance`) et
 * construit les événements du plug-in `angular-calendar`. Le filtre porte sur
 * les salles cochées : par défaut, toutes les salles sont visibles.
 *
 * Les heures restent des chaînes `'YYYY-MM-DD'` / `'HH:mm'` côté modèle
 * (cf. AGENTS.md §13) : la conversion en `Date` local n'a lieu qu'au moment
 * du rendu.
 */
@Component({
  selector: 'app-planning-calendar',
  imports: [
    ...IMPORTS_CALENDRIER,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
  ],
  providers: [fournisseursCalendrier(PlanningCalendarA11y)],
  templateUrl: './planning-calendar.component.html',
  styleUrl: './planning-calendar.component.scss',
})
export class PlanningCalendarComponent {
  /** Les soutenances du planning à afficher. */
  readonly soutenances = input.required<Soutenance[]>();

  /** Première soutenance du planning (date + heure de début), ou `null`. */
  private readonly premiereSoutenance = computed<Date | null>(() => {
    let meilleure: Soutenance | null = null;
    for (const soutenance of this.soutenances()) {
      if (
        !meilleure ||
        soutenance.date < meilleure.date ||
        (soutenance.date === meilleure.date && soutenance.heureDebut < meilleure.heureDebut)
      ) {
        meilleure = soutenance;
      }
    }
    return meilleure ? dateLocale(meilleure.date) : null;
  });

  /**
   * Date pivot de la semaine affichée.
   *
   * Par défaut, la vue est positionnée sur la **semaine de la première
   * séance** : `linkedSignal` la recale dès le premier rendu, puis à chaque
   * nouveau planning importé. La navigation manuelle (semaine précédente /
   * suivante / actuelle) reste prioritaire tant que le planning ne change pas.
   */
  readonly viewDate = linkedSignal<Date>(() => this.premiereSoutenance() ?? new Date());

  /**
   * Salles cochées dans la liste déroulante : `true` = la salle est
   * affichée. Par défaut, toutes les salles du planning sont cochées.
   */
  readonly sallesChoisis = signal<string[]>([]);

  /** Salles déjà connues : sert à détecter les salles ajoutées ensuite. */
  private sallesConnues = new Set<string>();

  /** Toutes les salles présentes dans le planning, triées. */
  readonly salles = computed<string[]>(() => {
    const salle = new Set<string>();
    for (const soutenance of this.soutenances()) {
      if (soutenance.salle.length > 0) {
        salle.add(soutenance.salle);
      }
    }
    return [...salle].sort((a, b) => a.localeCompare(b, 'fr'));
  });

  /** Nombre de soutenances effectivement affichées (après filtre). */
  readonly nombreAffiche = computed<number>(() => this.evenements().length);

  /** Applique la sélection de la liste déroulante (une ou plusieurs salles). */
  selectionnerSalles(selection: readonly string[]): void {
    this.sallesChoisis.set([...selection]);
  }

  /** Affiche toutes les salles (retire le filtre). */
  toutAfficher(): void {
    this.sallesChoisis.set(this.salles());
  }

  /** Masque toutes les salles. */
  toutMasquer(): void {
    this.sallesChoisis.set([]);
  }

  /** Événements du calendrier : une soutenance = un événement d'une heure. */
  readonly evenements = computed<CalendarEvent[]>(() => {
    const choisies = this.sallesChoisis();
    const evenements: CalendarEvent[] = [];
    for (const soutenance of this.soutenances()) {
      if (soutenance.salle.length > 0 && !choisies.includes(soutenance.salle)) {
        continue;
      }
      const debut = dateLocale(soutenance.date);
      if (!debut) {
        continue;
      }
      const heureDebut = /^(\d{1,2}):(\d{2})$/.exec(soutenance.heureDebut);
      const heureFin = /^(\d{1,2}):(\d{2})$/.exec(soutenance.heureFin);
      if (!heureDebut || !heureFin) {
        continue;
      }
      const annee = debut.getFullYear();
      const mois = debut.getMonth();
      const jour = debut.getDate();
      evenements.push({
        id: `${soutenance.date}_${soutenance.heureDebut}_${soutenance.salle}`,
        title: `${soutenance.heureDebut} – ${soutenance.heureFin}`,
        start: new Date(
          annee,
          mois,
          jour,
          Number.parseInt(heureDebut[1] as string, 10),
          Number.parseInt(heureDebut[2] as string, 10),
        ),
        end: new Date(
          annee,
          mois,
          jour,
          Number.parseInt(heureFin[1] as string, 10),
          Number.parseInt(heureFin[2] as string, 10),
        ),
        cssClass: 'soutenance-evenement',
        meta: { soutenance },
      });
    }
    return evenements;
  });

  /** Première heure affichée (bornée par les événements). */
  readonly heureDebut = computed<number>(() => {
    const heures = this.evenements()
      .map((evenement) => evenement.start.getHours())
      .filter((heure) => Number.isFinite(heure));
    return heures.length === 0 ? 8 : Math.max(0, Math.min(...heures) - 1);
  });

  /** Dernière heure affichée (bornée par les événements). */
  readonly heureFin = computed<number>(() => {
    const heures = this.evenements()
      .map((evenement) => evenement.end?.getHours() ?? Number.NaN)
      .filter((heure) => Number.isFinite(heure));
    return heures.length === 0 ? 19 : Math.min(24, Math.max(...heures) + 1);
  });

  constructor() {
    // Les salles sont cochées par défaut : les nouvelles salles du planning
    // sont ajoutées à la sélection, les décochages de l'administrateur sont
    // conservés.
    effect(() => {
      const salles = this.salles();
      const nouvelles = salles.filter((salle) => !this.sallesConnues.has(salle));
      if (nouvelles.length === 0) {
        return;
      }
      for (const salle of nouvelles) {
        this.sallesConnues.add(salle);
      }
      this.sallesChoisis.set([...this.sallesChoisis(), ...nouvelles]);
    });
  }

  /** Semaine précédente. */
  public semainePrecedente(): void {
    this.decaler(-7);
  }

  /** Semaine suivante. */
  public semaineSuivante(): void {
    this.decaler(7);
  }

  /** Revient à la semaine courante. */
  public semaineActuelle(): void {
    this.viewDate.set(new Date());
  }

  private decaler(jours: number): void {
    const date = new Date(this.viewDate().getTime());
    date.setDate(date.getDate() + jours);
    this.viewDate.set(date);
  }
}
