import { Component, OnDestroy, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { CreneauCardComponent } from './creneau-card.component';
import { CreneauService } from '../../data/creneau.service';
import { DispoService } from '../../data/dispo.service';
import { DateGroupPipe } from '../../layout/date-group.pipe';
import { grouperParJour } from '../../shared/date.util';
import type { Creneau } from '../../data/models';

// Mobile: deux sections EMPILÉES dans cet ordre — « Créneaux disponibles »
//           puis « Mes disponibilités (N) » — une colonne, boutons pleine largeur.
// Desktop: grille 2 colonnes (Disponibles | Mes disponibilités), largeur max
//           1100 px centrée, cartes sur 2 colonnes si le texte le permet.
@Component({
  selector: 'app-dispos-page',
  imports: [
    CreneauCardComponent,
    DateGroupPipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './dispos-page.component.html',
  styleUrl: './dispos-page.component.scss',
})
export class DisposPageComponent implements OnDestroy {
  private readonly creneauxService = inject(CreneauService);
  private readonly dispoService = inject(DispoService);

  /** Groupes de jours pour la section « Créneaux disponibles ». */
  readonly groupesDisponibles = computed(() => grouperParJour(this.dispoService.disponibles()));

  /** Groupes de jours pour la section « Mes disponibilités ». */
  readonly groupesRetenus = computed(() => grouperParJour(this.dispoService.retenus()));

  /** Compteur temps réel « Mes disponibilités (N) » (F3). */
  readonly nombreRetenus = this.dispoService.nombreRetenus;

  /** Chargement tant qu'un `onSnapshot` n'a pas répondu. */
  readonly chargement = computed(
    () => this.creneauxService.chargement() || this.dispoService.chargement(),
  );

  /** Message d'erreur de lecture (avec action « Réessayer »). */
  readonly erreur = computed(() => this.creneauxService.erreur() ?? this.dispoService.erreur());

  constructor() {
    this.creneauxService.ecouter();
    this.dispoService.ecouter();
  }

  ngOnDestroy(): void {
    this.creneauxService.arreter();
    this.dispoService.arreter();
  }

  /** F4 — le clic EST l'enregistrement : mise à jour optimiste + écriture immédiate. */
  basculer(creneau: Creneau): void {
    void this.dispoService.basculer(creneau);
  }

  estEnCours(creneauId: string): boolean {
    return this.dispoService.estEnCours(creneauId);
  }

  /** Bouton « Réessayer » de l'état d'erreur (F3). */
  reessayerLecture(): void {
    this.creneauxService.reecouter();
    this.dispoService.reecouter();
  }
}
