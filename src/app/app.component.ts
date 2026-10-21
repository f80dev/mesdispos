import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { HeaderComponent } from './layout/header.component';
import { ROUTES } from './app.routes';

// Mobile: header compact masqué sur /login, contenu pleine largeur.
// Desktop: header permanent 56 px + contenu centré (max 1100 px).
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class App {
  private readonly router = inject(Router);

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
}
