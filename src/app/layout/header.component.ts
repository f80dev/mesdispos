import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';

import { AdminService } from '../core/admin.service';
import { AuthService } from '../core/auth.service';
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
  private readonly admin = inject(AdminService);

  /** Signal unifié : session « nom seul » ou session Firebase (admin). */
  readonly user = this.auth.user;

  /** Initiale affichée dans l'avatar circulaire. */
  readonly initiale = computed(() => {
    const nom = this.user()?.displayName?.trim() ?? '';
    return (nom.charAt(0) || '?').toUpperCase();
  });

  /** Exposé au template pour `routerLink` sans réécrire le chemin en dur. */
  protected readonly ROUTES = ROUTES;

  /**
   * Le lien d'import n'apparaît QUE pour un administrateur (session Firebase
   * inscrite dans `admins`) — l'import des créneaux lui est réservé.
   */
  readonly estAdminCourant = this.admin.autorise;

  /** Déconnexion : efface le cookie (session « nom ») ou ferme la session Firebase. */
  async seDeconnecter(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl(ROUTES.login);
  }
}
