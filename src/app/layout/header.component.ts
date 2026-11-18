import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';

import { AdminService } from '../core/admin.service';
import { AuthService } from '../core/auth.service';
import { ROUTES } from '../app.routes';
import { settings } from '../../environments/settings';
import { ThemeSwitcherComponent } from './theme-switcher.component';

// Mobile: header compact — logo court, avatar sans nom, bouton déconnexion
//           48 px. Aucune barre horizontale à 375 px.
// Desktop: logo « MesDispos », nom + avatar à droite, lien admin si concerné.
@Component({
  selector: 'app-header',
  imports: [RouterLink, MatIconModule, MatButtonModule, MatMenuModule, ThemeSwitcherComponent],
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

  /**
   * Nombre de jours restants avant la date limite de réponse
   * (`settings.deadline`, format `JJ/MM/AAAA`). `null` si la date est illisible.
   * Compte des journées entières : la limite est atteinte le jour même.
   */
  private readonly deadlineDate = parseDeadline(settings.deadline);

  readonly joursRestants = computed(() => {
    const deadline = this.deadlineDate;
    if (!deadline) {
      return null;
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
}

/** Parse une date `JJ/MM/AAAA` en Date locale (minuit). `null` si invalide. */
function parseDeadline(valeur: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valeur?.trim() ?? '');
  if (!m) {
    return null;
  }
  const [, jour, mois, annee] = m;
  const date = new Date(Number(annee), Number(mois) - 1, Number(jour));
  if (date.getFullYear() !== Number(annee) || date.getMonth() !== Number(mois) - 1) {
    return null;
  }
  return date;
}
