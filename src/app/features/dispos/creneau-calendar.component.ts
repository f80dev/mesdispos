import { Component, computed, effect, input, output } from '@angular/core';
import { CalendarEvent } from 'angular-calendar';

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
  private idsConnus = new Set<string>();

  constructor() {
    super();
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
