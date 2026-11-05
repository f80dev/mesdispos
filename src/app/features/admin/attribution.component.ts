import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import {
  AttributionService,
  MAX_CREENEAUX_PAR_PROF,
  type PlanAttribution,
} from '../../data/attribution.service';
import { AdminService, MESSAGE_ADMIN_REQUIS } from '../../core/admin.service';
import { CreneauService } from '../../data/creneau.service';
import { NotifService } from '../../core/notif.service';
import { DateGroupPipe } from '../../layout/date-group.pipe';

// Mobile  : champs pleine largeur, boutons 48 px empilés, tableau des
//           Teachers en cartes (défilement horizontal autorisé).
// Desktop : tableau à 4 colonnes, boutons alignés à gauche.
@Component({
  selector: 'app-attribution',
  imports: [
    DateGroupPipe,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './attribution.component.html',
  styleUrl: './attribution.component.scss',
})
export class AttributionComponent {
  private readonly attribution = inject(AttributionService);
  private readonly admin = inject(AdminService);
  private readonly notif = inject(NotifService);

  /** L'attribution est réservée à l'administrateur (route + interface). */
  readonly autorise = this.admin.autorise;
  readonly messageAdminRequis = MESSAGE_ADMIN_REQUIS;
  readonly maxCreneaux = MAX_CREENEAUX_PAR_PROF;

  /** Logins saisie (un par ligne, ou séparés par des espaces). */
  readonly logins = signal<string>('');

  /**
   * `true` : attribuer à **l'ensemble** des professeurs de la liste Oasis,
   * sans saisie de login.
   */
  readonly tousLesProfs = signal<boolean>(false);

  /** Nombre de créneaux à attribuer **à chaque** professeur. */
  readonly nombre = signal<number>(1);

  /** Vrai pendant le calcul du plan ou l'écriture. */
  readonly enCours = this.attribution.enCours;

  /** Message d'erreur du service. */
  readonly erreur = this.attribution.erreur;

  /** Plan calculé, affiché avant écriture. */
  readonly plan = this.attribution.plan;

  /** Vrai quand la confirmation d'écriture est demandée. */
  readonly confirmation = signal<boolean>(false);

  /** Nombre de créneaux déjà retenus par le professeur, tous 곳 confondus. */
  readonly totalCreneaux = computed(() =>
    (this.plan()?.cibles ?? []).reduce((total, cible) => total + cible.creneaux.length, 0),
  );

  /** Professeurs résolus. */
  readonly cibles = computed(() => this.plan()?.cibles ?? []);

  /**
   * Nombre de lignes du tableau de prévisualisation : au-delà, les autres
   * professeurs sont regroupés dans un détail repliable (l'attribution à
   * tous les professeurs implique ~400 lignes).
   */
  static readonly MAX_LIGNES_PREVISUALISATION = 100;

  /** Professeurs affichés dans le tableau. */
  readonly ciblesAffichees = computed(() =>
    this.cibles().slice(0, AttributionComponent.MAX_LIGNES_PREVISUALISATION),
  );

  /** Professeurs non affichés dans le tableau (détaillés plus bas). */
  readonly ciblesRestantes = computed(() =>
    this.cibles().slice(AttributionComponent.MAX_LIGNES_PREVISUALISATION),
  );

  /** Logins inconnus de la liste Oasis. */
  readonly inconnus = computed(() => this.plan()?.inconnus ?? []);

  /** Vrai quand le plan est calculable (au moins un login, un nombre valide). */
  readonly peutPreparer = computed(
    () =>
      (this.tousLesProfs() || this.logins().trim().length > 0) &&
      this.nombre() >= 1 &&
      this.nombre() <= MAX_CREENEAUX_PAR_PROF,
  );

  /** Bascule « tous les professeurs » : la saisie des logins devient inutile. */
  surTousLesProfs(evenement: { checked: boolean }): void {
    this.tousLesProfs.set(evenement.checked);
    this.confirmation.set(false);
  }

  constructor() {
    // L'abonnement temps réel aux créneaux proposés est piloté par la page
    // hôte (`ImportComponent`) : l'attribution consomme la liste déjà chargée.
  }

  /** Met à jour le champ « logins » à partir de l'événement `input`. */
  surLogins(evenement: Event): void {
    this.logins.set((evenement.target as HTMLInputElement | HTMLTextAreaElement).value);
    this.confirmation.set(false);
  }

  /** Met à jour le champ « nombre de créneaux » à partir de l'événement `input`. */
  surNombre(evenement: Event): void {
    const brut = (evenement.target as HTMLInputElement).value;
    const nombre = Number.parseInt(brut, 10);
    this.nombre.set(Number.isNaN(nombre) ? 0 : nombre);
    this.confirmation.set(false);
  }

  /** Calcule le plan d'attribution (aucune écriture). */
  async preparer(): Promise<void> {
    if (!this.autorise()) {
      this.notif.erreur(MESSAGE_ADMIN_REQUIS);
      return;
    }
    const plan = await this.attribution.preparer(this.logins(), this.nombre(), this.tousLesProfs());
    if (!plan) {
      return;
    }
    this.confirmation.set(false);
    this.notif.info(
      `${plan.cibles.length} professeur(s) résolu(s), ${this.totalCreneaux()} créneau(x) à attribuer.`,
    );
  }

  /** Demande la confirmation avant l'écriture. */
  demanderConfirmation(): void {
    if (!this.autorise()) {
      this.notif.erreur(MESSAGE_ADMIN_REQUIS);
      return;
    }
    this.confirmation.set(true);
  }

  /** Referme la confirmation sans écrire. */
  annulerConfirmation(): void {
    this.confirmation.set(false);
  }

  /** Écrit le plan : les disponibilités sont créées comme si le professeur
   *  les avait lui-même cochées. */
  async attribuer(): Promise<void> {
    if (!this.autorise()) {
      this.notif.erreur(MESSAGE_ADMIN_REQUIS);
      return;
    }
    const plan: PlanAttribution | null = this.plan();
    if (!plan) {
      return;
    }
    try {
      const ecrits = await this.attribution.appliquer(plan);
      this.confirmation.set(false);
      this.notif.succes(
        `${ecrits} disponibilité(s) attribuée(s) à ${plan.cibles.length} professeur(s).`,
      );
      // Le plan est épuisé : on le vide pour éviter un double clic.
      this.attribution.plan.set(null);
      this.logins.set('');
    } catch (erreur) {
      this.notif.erreur(
        erreur instanceof Error ? erreur.message : "L'attribution a échoué. Réessayez.",
      );
    }
  }
}
