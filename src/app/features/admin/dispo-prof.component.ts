import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import type { CalendarEvent } from 'angular-calendar';

import { ComposantAdmin } from '../../core/composant-admin';
import { DispoProfService, filtrerProfsDispo, type ProfDispo } from '../../data/dispo-prof.service';
import { ProfService, type Prof } from '../../data/prof.service';
import { creneauVersIntervalle } from '../../shared/date.util';
import { avecValeurs, basculerValeur } from '../../shared/collection.util';
import { ProfsCalendarComponent } from './profs-calendar.component';
import { MatAccordion, MatExpansionPanel, MatExpansionPanelHeader } from '@angular/material/expansion';

/**
 * Nombre de variantes de couleur attribuées aux professeurs dans le
 * calendrier (rôles M3 : primary, secondary, tertiary, success, error,
 * surface). Au-delà, les couleurs sont recyclées.
 */
export const PALETTE_PROFS = 6;

// Mobile  : liste des professeurs (cases à cocher) au-dessus du calendrier,
//           colonne unique, cibles tactiles ≥ 48 px.
// Desktop : liste sur 2 colonnes au-dessus du calendrier, largeur max 1100 px.
@Component({
  selector: 'app-dispo-prof',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    ProfsCalendarComponent,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatAccordion,
  ],
  templateUrl: './dispo-prof.component.html',
  styleUrl: './dispo-prof.component.scss',
})
export class DispoProfComponent extends ComposantAdmin {
  private readonly service = inject(DispoProfService);
  private readonly annuaireService = inject(ProfService);

  /** Tous les professeurs ayant déclaré au moins une disponibilité. */
  readonly profs = this.service.profs;

  /** Vrai pendant la lecture des disponibilités. */
  readonly chargement = this.service.chargement;

  /** Message d'erreur de lecture. */
  readonly erreur = this.service.erreur;

  /** Texte de recherche dans la liste des professeurs. */
  readonly recherche = signal<string>('');

  /** `uid` des professeurs cochés. */
  readonly selection = signal<ReadonlySet<string>>(new Set<string>());

  /** Professeurs affichés dans la liste (après recherche). */
  readonly profsAffiches = computed(() => filtrerProfsDispo(this.profs(), this.recherche()));

  /** Nombre de professeurs cochés. */
  readonly nombreCoches = computed(() => this.selection().size);

  /**
   * Événements du calendrier : une disponibilité par professeur et par
   * créneau. Les disponibilités des professeur cochés sont superposées.
   */
  readonly evenements = computed<CalendarEvent[]>(() => {
    const selection = this.selection();
    const evenements: CalendarEvent[] = [];
    this.profs().forEach((prof, index) => {
      if (!selection.has(prof.uid)) {
        return;
      }
      for (const dispo of prof.dispos) {
        const intervalle = creneauVersIntervalle(dispo);
        if (!intervalle) {
          continue;
        }
        evenements.push({
          id: `${prof.uid}_${dispo.creneauId}`,
          title: `${dispo.heureDebut} – ${dispo.heureFin}`,
          start: intervalle.debut,
          end: intervalle.fin,
          cssClass: `creneau-evenement prof-evenement prof-c${index % PALETTE_PROFS}`,
          meta: { prof, dispo },
        });
      }
    });
    return evenements;
  });

  /** Nombre de disponibilités affichées dans le calendrier. */
  readonly nombreEvenements = computed(() => this.evenements().length);

  /**
   * Annuaire des enseignants (API Oasis) indexé par `login` : il apporte le
   * secteur de rattachement et l'adresse professionnelle, absents des
   * documents de disponibilité.
   */
  readonly annuaire = computed<ReadonlyMap<string, Prof>>(
    () => new Map(this.annuaireService.profs().map((prof) => [prof.login, prof])),
  );

  constructor() {
    super();
    void this.service.charger();
    void this.annuaireService.charger();
  }

  /** Secteur de rattachement d'un professeur (`—` si inconnu). */
  secteur(prof: ProfDispo): string {
    const secteur = this.annuaire().get(prof.login)?.secteur?.trim();
    return secteur && secteur.length > 0 ? secteur : '—';
  }

  /** Adresse professionnelle d'un professeur (`null` si inconnue). */
  mail(prof: ProfDispo): string | null {
    const mail = this.annuaire().get(prof.login)?.mailPro?.trim();
    return mail && mail.length > 0 ? mail : null;
  }

  /**
   * Nombre de créneaux disponibles **plannifiés** pour un professeur : les
   * créneaux déclarés qui figurent effectivement dans le planning (0 si le
   * professeur n'est pas coché).
   */
  nombreCreneauxPlannifies(prof: ProfDispo): number {
    if (!this.estCoche(prof.uid)) {
      return 0;
    }
    return prof.dispos.filter((dispo) => creneauVersIntervalle(dispo) !== null).length;
  }

  /**
   * Adresse `mailto:` pour contacter un professeur (sujet et corps préremplis).
   * `null` si l'adresse professionnelle est inconnue.
   */
  lienMail(prof: ProfDispo): string | null {
    const mail = this.mail(prof);
    if (!mail) {
      return null;
    }
    const sujet = 'Vos disponibilités — MesDispos';
    const corps = `Bonjour ${prof.prenom || prof.nomComplet},\n\n`;
    return `mailto:${mail}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  }

  /** Met à jour le texte de recherche à partir de l'événement `input`. */
  surRecherche(evenement: Event): void {
    this.recherche.set((evenement.target as HTMLInputElement).value);
  }

  /** Coche / décoche un professeur. */
  basculer(uid: string, coche: boolean): void {
    this.selection.set(basculerValeur(this.selection(), uid, coche));
  }

  /** `true` si le professeur est coché. */
  estCoche(uid: string): boolean {
    return this.selection().has(uid);
  }

  /** Coche tous les professeurs affichés (après recherche). */
  toutCocher(): void {
    this.selection.set(
      avecValeurs(
        this.selection(),
        this.profsAffiches().map((prof) => prof.uid),
      ),
    );
  }

  /** Décoche tous les professeurs. */
  toutDecocher(): void {
    this.selection.set(new Set<string>());
  }

  /** Bouton « Réessayer ». */
  recharger(): void {
    void this.service.charger();
  }

  /** Nombre de disponibilités d'un professeur (affiché dans la liste). */
  nombreDispos(prof: ProfDispo): number {
    return prof.dispos.length;
  }
}
