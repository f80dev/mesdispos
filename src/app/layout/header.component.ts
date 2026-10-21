import { Component, computed, inject, signal } from '@angular/core';
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

  /** Signal unifié : mode A (anonyme) comme mode B (Google). */
  readonly user = this.auth.user;

  /** Initiale affichée dans l'avatar circulaire quand il n'y a pas de photo. */
  readonly initiale = computed(() => {
    const nom = this.user()?.displayName?.trim() ?? '';
    return (nom.charAt(0) || '?').toUpperCase();
  });

  readonly url = computed(() => this.router.url);

  /** Exposé au template pour `routerLink` sans réécrire le chemin en dur. */
  protected readonly ROUTES = ROUTES;

  /** Le lien d'import n'apparaît QUE pour un admin en mode B (F6). */
  readonly estAdminCourant = signal<boolean>(false);

  constructor() {
    void this.verifierDroitsAdmin();
  }

  private async verifierDroitsAdmin(): Promise<void> {
    const utilisateur = this.auth.user();
    if (!utilisateur || utilisateur.anon) {
      return;
    }
    this.estAdminCourant.set(await this.backend.estAdmin(utilisateur.uid));
  }

  /** Déconnexion : efface le cookie (mode A) ou Firebase (mode B), puis `/login`. */
  async seDeconnecter(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl(ROUTES.login);
  }
}
