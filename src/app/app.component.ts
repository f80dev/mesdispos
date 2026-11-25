import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { HeaderComponent } from './layout/header.component';
import { ROUTES } from './app.routes';
import { ThemeService } from './core/theme.service';
import { AdminService } from './core/admin.service';
import { AdminMain } from './features/admin/admin-main.component';

import { settings } from '../environments/settings';


// Mobile: header compact masqué sur /login, contenu pleine largeur.
// Desktop: header permanent 56 px + contenu centré (max 1100 px).
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, AdminMain],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class App {
  private readonly router = inject(Router);

  /** Service de thème : instancié au démarrage pour appliquer le thème mémorisé. */
  readonly theme = inject(ThemeService);

  /** Droits administrateur : le bandeau admin n'est visible que pour eux. */
  private readonly admin = inject(AdminService);

  /** `true` quand la session courante est administrateur. */
  readonly estAdmin = this.admin.autorise;

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((evenement): evenement is NavigationEnd => evenement instanceof NavigationEnd),
      map((evenement) => evenement.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Le header est permanent « sauf `/login` » (F2). */
  readonly surLogin = computed(() => this.url().startsWith(ROUTES.login));

  /** Écran de démarrage : image plein écran affichée 2 s. */
  readonly splashVisible = signal(true);

  constructor() {
    setTimeout(() => this.splashVisible.set(false), 2000);
  }

  protected readonly settings = settings;

}
