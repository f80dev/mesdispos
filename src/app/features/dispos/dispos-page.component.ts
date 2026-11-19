import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { CreneauCardComponent } from './creneau-card.component';
import { CreneauCalendarComponent } from './creneau-calendar.component';
import { AuthService } from '../../core/auth.service';
import { NotifService } from '../../core/notif.service';
import { CreneauService } from '../../data/creneau.service';
import { DispoService } from '../../data/dispo.service';
import { ProfilService } from '../../data/profil.service';
import { DateGroupPipe } from '../../layout/date-group.pipe';
import { grouperParJour } from '../../shared/date.util';
import type { Creneau } from '../../data/models';

// Mobile: liste des « Créneaux disponibles » en tête, puis le calendrier des
//           « Mes disponibilités (N) » (vue « jour ») — une colonne, lignes
//           ≥ 48 px.
// Desktop: liste des créneaux disponibles au-dessus du calendrier de vos
//           disponibilités, largeur max 1100 px.
@Component({
  selector: 'app-dispos-page',
  imports: [
    CreneauCalendarComponent,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './dispos-page.component.html',
  styleUrl: './dispos-page.component.scss',
})
export class DisposPageComponent implements OnDestroy {
  private readonly creneauxService = inject(CreneauService);
  private readonly dispoService = inject(DispoService);
  private readonly auth = inject(AuthService);
  private readonly notif = inject(NotifService);

  /** Profil du professeur (identité + préférence « soutenance en anglais »). */
  private readonly profilService = inject(ProfilService);

  /**
   * Préférence « peut suivre des soutenances en anglais » : lue dans
   * `users/{uid}.soutenanceAnglais` (document de profil).
   */
  readonly soutenanceAnglais = computed(
    () => this.profilService.profil()?.soutenanceAnglais === true,
  );

  /** `true` pendant l'écriture de la préférence (case désactivée). */
  readonly enregistrementAnglais = signal<boolean>(false);

  /** Identifiants des créneaux retenus (coloration du calendrier). */
  readonly idsSelectionnes = this.dispoService.idsSelectionnes;

  /** Créneaux retenus par l'utilisateur — compteur et liste de la section. */
  readonly creneauxRetenus = this.dispoService.retenus;

  /**
   * **Tous** les créneaux proposés (retenus ou non) — source du calendrier :
   * chaque créneau y est positionné, rouge quand le professeur ne s'est pas
   * déclaré disponible, vert quand il l'a fait.
   */
  readonly creneauxDuCalendrier = this.creneauxService.creneaux;

  /** Groupes de jours pour la section « Créneaux disponibles ». */
  readonly groupesDisponibles = computed(() => grouperParJour(this.dispoService.disponibles()));

  /** Compteur temps réel « Mes disponibilités (N) » (F3). */
  readonly nombreRetenus = this.dispoService.nombreRetenus;

  /** Compteur temps réel « Créneaux disponibles (N) ». */
  readonly nombreDisponibles = computed(() => this.dispoService.disponibles().length);

  /** Chargement tant qu'un `onSnapshot` n'a pas répondu. */
  readonly chargement = computed(
    () => this.creneauxService.chargement() || this.dispoService.chargement(),
  );

  /** Message d'erreur de lecture (avec action « Réessayer »). */
  readonly erreur = computed(() => this.creneauxService.erreur() ?? this.dispoService.erreur());

  constructor() {
    this.creneauxService.ecouter();
    this.dispoService.ecouter();
  }

  ngOnDestroy(): void {
    this.creneauxService.arreter();
    this.dispoService.arreter();
  }

  /** F4 — le clic EST l'enregistrement : mise à jour optimiste + écriture immédiate. */
  basculer(creneau: Creneau): void {
    void this.dispoService.basculer(creneau);
  }

  estEnCours(creneauId: string): boolean {
    return this.dispoService.estEnCours(creneauId);
  }

  /** Bouton « Réessayer » de l'état d'erreur (F3). */
  reessayerLecture(): void {
    this.creneauxService.reecouter();
    this.dispoService.reecouter();
  }

  /**
   * Case à cocher « je peux suivre des soutenances en anglais ».
   *
   * L'écriture est **immédiate** (comme le clic sur un créneau) : mise à jour
   * optimiste, puis `users/{uid}.soutenanceAnglais`. En cas d'échec, l'état
   * est remis à sa valeur précédente et un message « Réessayer » s'affiche.
   */
  async definirSoutenanceAnglais(valeur: boolean): Promise<void> {
    const uid = this.auth.uidEcriture();
    if (!uid) {
      this.notif.info('Session expirée : reconnectez-vous pour enregistrer cette préférence.');
      return;
    }
    this.enregistrementAnglais.set(true);
    try {
      const ok = await this.profilService.definirSoutenanceAnglais(uid, valeur);
      if (!ok) {
        this.notif.reessayer('Enregistrement impossible. Réessayer', () => {
          void this.definirSoutenanceAnglais(valeur);
        });
      }
    } finally {
      this.enregistrementAnglais.set(false);
    }
  }
}
