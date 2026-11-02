import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../core/auth.service';
import { FIRESTORE_BACKEND } from '../core/firestore.backend';
import { ROUTES } from '../app.routes';

// Mobile: header compact — logo court, avatar sans nom, bouton déconnexion
//           48 px. Aucune barre horizontale à 375 px.
// Desktop: logo « MesDispos », nom + avatar à droite, lien admin si concerné.
@Component({
  selector: 'app-header',
  imports: [RouterLink, MatIconModule, MatButtonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly backend = inject(FIRESTORE_BACKEND);

  /** Signal unifié : session « nom seul » ou session Firebase (admin). */
  readonly user = this.auth.user;

  /** Initiale affichée dans l'avatar circulaire. */
  readonly initiale = computed(() => {
    const nom = this.user()?.displayName?.trim() ?? '';
    return (nom.charAt(0) || '?').toUpperCase();
  });

  /** Exposé au template pour `routerLink` sans réécrire le chemin en dur. */
  protected readonly ROUTES = ROUTES;

  /** Le lien d'import n'apparaît QUE pour un admin (session Firebase). */
  readonly estAdminCourant = signal<boolean>(false);

  constructor() {
    // Le lien admin dépend de la session Firebase Google : on le recalcule
    // dès que la session change.
    effect(() => {
      void this.verifierDroitsAdmin(this.auth.sessionAdmin()?.uid ?? null);
    });
  }

  private async verifierDroitsAdmin(uid: string | null): Promise<void> {
    if (!uid) {
      this.estAdminCourant.set(false);
      return;
    }
    this.estAdminCourant.set(await this.backend.estAdmin(uid));
  }

  /** Déconnexion : efface le cookie (session « nom ») ou ferme la session Firebase. */
  async seDeconnecter(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl(ROUTES.login);
  }
}
