import {
  Component,
  computed,
  effect,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CalendarEvent, CalendarView } from 'angular-calendar';

import {
  CalendrierA11y,
  CalendrierEventTitleFormatter,
  fournisseursCalendrier,
  metaCreneau,
} from './calendrier.formatters';
import { creneauVersIntervalle, dateLocale } from '../../shared/date.util';
import { IMPORTS_CALENDRIER } from '../../shared/calendrier.util';
import { CalendrierBase } from '../../shared/calendrier-base';
import type { VueCalendrier } from '../../shared/calendrier.util';
import type { Creneau } from '../../data/models';

export type { VueCalendrier };

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
  imports: [...IMPORTS_CALENDRIER],
  providers: [fournisseursCalendrier(CalendrierA11y, CalendrierEventTitleFormatter)],
  templateUrl: './creneau-calendar.component.html',
  styleUrl: './creneau-calendar.component.scss',
})
export class CreneauCalendarComponent extends CalendrierBase {
  /** Tous les créneaux proposés (retenus ou non). */
  readonly creneaux = input.required<Creneau[]>();

  /** Identifiants des créneaux déjà retenus (pour la coloration). */
  readonly idsSelectionnes = input<ReadonlySet<string>>(new Set<string>());

  /** Émis au clic sur un créneau du calendrier : le parent déclenche l'écriture. */
  readonly basculer = output<Creneau>();

  /** Identifiants de la liste précédente — sert à détecter les ajouts. */
  private idsRetenusConnus = new Set<string>();

  /** Élément de la grille : sa hauteur pilote la taille des lignes horaires. */
  private readonly grille = viewChild<ElementRef<HTMLElement>>('grille');

  /** Hauteur disponible (px) pour la grille, mesurée sur l'élément. */
  private readonly hauteurGrille = signal(0);

  /**
   * Hauteur d'un demi-segment horaire (px). La grille occupe toute la hauteur
   * disponible : les lignes horaires s'étirent pour la remplir, sans jamais
   * descendre sous une lisibilité acceptable ni dépasser une taille excessive.
   */
  readonly hauteurSegment = computed(() => {
    const hauteur = this.hauteurGrille();
    if (hauteur <= 0) {
      return 16;
    }
    const nbHeures = this.heureFin() - this.heureDebut() + 1;
    const nbSegments = Math.max(1, nbHeures * 2);
    // Hauteur réservée à l'en-tête des colonnes de jours.
    const disponible = hauteur - 56;
    return Math.max(14, Math.min(44, Math.floor(disponible / nbSegments)));
  });

  constructor() {
    super();
    // Vue « semaine » imposée : les vues « jour »/« semaine » ont été retirées.
    this.vue.set(CalendarView.Week);
    // Le calendrier affiche **tous** les créneaux. À chaque arrivée d'un
    // créneau retenu, la vue se positionne sur son jour : un créneau
    // sélectionné devient immédiatement visible dans le calendrier.
    // La désélection d'un créneau ne déplace pas la vue.
    effect(() => {
      const selectionnes = this.idsSelectionnes();
      const nouveaux = [...selectionnes].filter((id) => !this.idsRetenusConnus.has(id));
      this.idsRetenusConnus = new Set(selectionnes);
      if (nouveaux.length === 0) {
        return;
      }
      const parId = new Map(this.creneaux().map((creneau) => [creneau.id, creneau]));
      const jour = nouveaux
        .map((id) => parId.get(id)?.date ?? '')
        .filter((date) => date !== '')
        .sort()[0];
      const cible = dateLocale(jour ?? '');
      if (cible) {
        this.viewDate.set(cible);
      }
    });

    // Positionnement initial : le calendrier s'ouvre sur le premier jour
    // comportant des créneaux (indépendamment de l'état de sélection).
    effect(() => {
      const creneaux = this.creneaux();
      if (this.premierCreneauPositionne || creneaux.length === 0) {
        return;
      }
      this.premierCreneauPositionne = true;
      const cible = dateLocale(creneaux[0].date);
      if (cible) {
        this.viewDate.set(cible);
      }
    });

    // Mesure de la grille : la hauteur disponible détermine la taille des
    // lignes horaires, pour que le calendrier occupe toute la page.
    effect((onCleanup) => {
      const element = this.grille()?.nativeElement;
      if (!element) {
        return;
      }
      const observateur = new ResizeObserver((entrees) => {
        const hauteur = entrees[0]?.contentRect.height ?? 0;
        this.hauteurGrille.set(Math.round(hauteur));
      });
      observateur.observe(element);
      onCleanup(() => observateur.disconnect());
    });
  }

  /** Le premier jour comportant des créneaux a déjà été atteint. */
  private premierCreneauPositionne = false;

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
        cssClass: retenu
          ? 'creneau-evenement creneau-retenu'
          : 'creneau-evenement creneau-non-retenu',
        meta: { creneau, retenu },
      });
    }
    return evenements;
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
}
