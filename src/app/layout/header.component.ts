import { Component, computed, inject, type OnDestroy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';

import { AdminService } from '../core/admin.service';
import { AuthService } from '../core/auth.service';
import { ConfigService } from '../data/config.service';
import { ROUTES } from '../app.routes';
import { dateLocale } from '../shared/date.util';
import { ThemeSwitcherComponent } from './theme-switcher.component';

// Mobile: header compact — logo court, avatar sans nom, bouton déconnexion
//           48 px. Aucune barre horizontale à 375 px.
// Desktop: logo « MesDispos », nom + avatar à droite, lien admin si concerné.
@Component({
  selector: 'app-header',
  imports: [MatIconModule, MatButtonModule, MatMenuModule, ThemeSwitcherComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly admin = inject(AdminService);

  /** Configuration applicative (date limite stockée en base). */
  private readonly config = inject(ConfigService);

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

  /**
   * Nombre de jours restants avant la date limite de réponse.
   *
   * La date limite est lue **en base** (`config/app`, format `YYYY-MM-DD`) ;
   * `settings.deadline` n'est que le repli quand le document est absent.
   * Compte des journées entières : la limite est atteinte le jour même.
   */
  private readonly deadlineDate = computed(() => dateLocale(this.config.deadline()));


  readonly joursRestants = computed(() => {
    const deadline = this.deadlineDate();
    if (!deadline) {
      return 0
    }
    const aujourdhui = new Date();
    const minuit = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate());
    const diff = deadline.getTime() - minuit.getTime();
    return Math.round(diff / 86_400_000);
  });

  /** Libellé court affiché dans le header (« J-12 »). */
  readonly libelleEcheance = computed(() => {
    const jours = this.joursRestants();
    if (jours === null) {
      return '';
    }
    return jours > 0 ? `J-${jours}` : jours === 0 ? 'Aujourd’hui' : 'Terminé';
  });

  /** Déconnexion : efface le cookie (session « nom ») ou ferme la session Firebase. */
  async seDeconnecter(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl(ROUTES.login);
  }

  constructor() {
    // La date limite est lue en base : le compte à rebours suit la valeur
    // enregistrée par l'administrateur, sans redéploiement.
    this.config.ecouter();
  }

  ngOnDestroy(): void {
    this.config.arreter();
  }
}
