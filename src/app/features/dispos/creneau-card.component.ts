import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { libelleCreneauAccessible } from '../../shared/date.util';
import type { Creneau } from '../../data/models';

// Mobile: une ligne = un bouton pleine largeur, hauteur 48 px minimum,
//           horaire en gros, libellé dessous, état à droite.
// Desktop: même ligne, deux colonnes de cartes possibles dans la section.
@Component({
  selector: 'app-creneau-card',
  imports: [MatIconModule, MatProgressSpinnerModule],
  templateUrl: './creneau-card.component.html',
  styleUrl: './creneau-card.component.scss',
})
export class CreneauCardComponent {
  /** Créneau affiché. */
  readonly creneau = input.required<Creneau>();

  /** `true` si le créneau est retenu (section « Mes disponibilités »). */
  readonly selectionne = input.required<boolean>();

  /** `true` pendant l'écriture Firestore (spinner 16 px). */
  readonly enCours = input<boolean>(false);

  /** Émis au clic : le parent déclenche l'écriture immédiate (F4). */
  readonly basculer = output<Creneau>();

  /**
   * Libellé d'accessibilité exigé par F3 :
   * « Disponible lundi 12 janvier de 8 h 45 à 9 h 30 » (ou « Retenu … »).
   */
  readonly libelleAccessible = computed(() =>
    libelleCreneauAccessible(this.creneau(), this.selectionne()),
  );
}
