import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatTab, MatTabGroup } from '@angular/material/tabs';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { ROUTES } from '../../app.routes';

/** Onglet de l'espace administrateur : libellé + route associée. */
export interface OngletAdmin {
  readonly label: string;
  readonly route: string;
}

// Mobile  : bandeau d'onglets sous le header, défilement horizontal maîtrisé,
//           cibles tactiles ≥ 48 px.
// Desktop : bandeau d'onglets aligné à gauche, largeur max 1100 px centrée.
@Component({
  selector: 'app-admin-main',
  imports: [MatTabGroup, MatTab],
  templateUrl: './admin-main.component.html',
  styleUrl: './admin-main.component.scss',
})
export class AdminMain {
  private readonly router = inject(Router);

  /** Onglets de l'espace administrateur. */
  readonly onglets: readonly OngletAdmin[] = [
    { label: 'Prompt', route: ROUTES.adminPrompt },
    { label: 'Disponibilités', route: ROUTES.adminDispos },
    { label: 'Imports et Données', route: ROUTES.adminImport },
  ];

  /** URL courante (mise à jour à chaque navigation). */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((evenement): evenement is NavigationEnd => evenement instanceof NavigationEnd),
      map((evenement) => evenement.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Index de l'onglet correspondant à la route courante. */
  readonly indexActif = computed(() => {
    const url = this.url();
    const trouve = this.onglets.findIndex((onglet) => url.startsWith(onglet.route));
    return trouve < 0 ? 0 : trouve;
  });

  /** Navigation vers l'onglet sélectionné. */
  allerA(index: number): void {
    const onglet = this.onglets[index];
    if (!onglet || this.url().startsWith(onglet.route)) {
      return;
    }
    void this.router.navigateByUrl(onglet.route);
  }
}
