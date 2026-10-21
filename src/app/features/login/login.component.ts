import { A11yModule } from '@angular/cdk/a11y';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { CookieService } from '../../core/cookie.service';
import { ROUTES } from '../../app.routes';
import { LONGUEUR_NOM_MAX } from '../../shared/date.util';

// Mobile : carte unique centrée, champ focalisé, bouton pleine largeur ≥ 48 px,
// aucun débordement horizontal à 375 px.
// Desktop : carte centrée 420 px max, deux boutons empilés, beaucoup d'air.
@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    A11yModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly cookie = inject(CookieService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly champ = viewChild<ElementRef<HTMLInputElement>>('champ');

  readonly maxLength = LONGUEUR_NOM_MAX;

  /** Formulaire à un seul champ — mode A, aucun appel réseau (F2). */
  readonly formulaire = this.fb.group({
    prenom: ['', [Validators.required, Validators.maxLength(LONGUEUR_NOM_MAX)]],
  });

  readonly prenom = toSignal(this.formulaire.controls.prenom.valueChanges, { initialValue: '' });

  /** « Continuer » reste désactivé tant que la valeur, après `trim`, est vide. */
  readonly peutContinuer = computed(() => this.prenom().trim().length > 0);

  /** Route initialement demandée (`?retour=/admin/import` ou `?retour=/dispos`). */
  private readonly retour = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('retour'))),
    { initialValue: null },
  );

  /**
   * L'accès admin reste **exclusivement** en mode B (F2 mode B) : sur
   * `/admin/import`, la carte « Prénom » est remplacée par « Continuer avec
   * Google », sans message d'erreur (refus silencieux demandé par le cahier).
   */
  readonly modeGoogleSeul = computed(() => this.retour() === ROUTES.admin);

  readonly enCoursGoogle = signal<boolean>(false);
  readonly erreur = this.auth.erreur;
  readonly messageGoogle = computed(() =>
    this.modeGoogleSeul()
      ? 'Cet espace est réservé aux administrateurs. Connectez-vous avec Google.'
      : 'Vous pouvez aussi utiliser votre compte Google.',
  );

  constructor() {
    // Pré-remplissage : la valeur courante du cookie, à chaque visite en mode A.
    const nomCookie = this.cookie.lireNom();
    if (nomCookie) {
      this.formulaire.controls.prenom.setValue(nomCookie);
    }
  }

  /** Soumission du formulaire du mode A. */
  async continuer(): Promise<void> {
    if (!this.peutContinuer()) {
      return;
    }
    const cible = this.retour() ?? ROUTES.dispos;
    const ok = await this.auth.connecterParNom(this.prenom());
    if (ok) {
      await this.router.navigateByUrl(cible);
    }
  }

  /** Mode B — connexion Google (popup desktop, redirect mobile). */
  async connecterGoogle(): Promise<void> {
    this.enCoursGoogle.set(true);
    try {
      await this.auth.connecterGoogle();
      const cible = this.retour() ?? ROUTES.dispos;
      if (this.auth.user()) {
        await this.router.navigateByUrl(cible);
      }
    } finally {
      this.enCoursGoogle.set(false);
    }
  }

  /** « Utiliser un autre nom » : efface le cookie et remet le focus (§F2). */
  utiliserUnAutreNom(): void {
    this.auth.oublierNom();
    this.formulaire.controls.prenom.setValue('');
    this.champ()?.nativeElement.focus();
  }
}
