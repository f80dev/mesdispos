import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AdminService, MESSAGE_ADMIN_REQUIS } from '../../core/admin.service';
import { NotifService } from '../../core/notif.service';
import {
  MESSAGE_COPIE_ECHEC,
  PromptIaService,
  URL_GABARIT,
  URL_MEMOIRES,
  URL_SALLES,
} from '../../data/prompt-ia.service';

// Mobile  : boutons pleine largeur (48 px), compteurs sur une ligne,
//           aperçu du prompt replié (défilement interne autorisé).
// Desktop : boutons alignés à gauche, aperçu sur toute la largeur.
@Component({
  selector: 'app-prompt-ia',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, MatProgressSpinnerModule],
  templateUrl: './prompt.component.html',
  styleUrl: './prompt.component.scss',
})
export class PromptIaComponent {
  private readonly promptService = inject(PromptIaService);
  private readonly notif = inject(NotifService);
  private readonly admin = inject(AdminService);

  /** Le prompt IA est réservé à l'administrateur (route + interface). */
  readonly autorise = this.admin.autorise;
  readonly verifie = this.admin.verifie;
  readonly messageAdminRequis = MESSAGE_ADMIN_REQUIS;

  readonly enCours = this.promptService.enCours;
  readonly erreur = this.promptService.erreur;
  readonly prompt = this.promptService.prompt;
  readonly statistiques = this.promptService.statistiques;

  /** Vrai pendant la copie dans le presse-papiers. */
  readonly copieEnCours = signal<boolean>(false);

  /** Fichiers utilisés : affichés pour que l'administrateur sache ce qui est lu. */
  readonly urlGabarit = URL_GABARIT;
  readonly urlMemoires = URL_MEMOIRES;
  readonly urlSalles = URL_SALLES;

  /** Assemble le prompt (gabarit + CSV) sans le copier. */
  async generer(): Promise<void> {
    if (!this.autorise()) {
      this.notif.erreur(MESSAGE_ADMIN_REQUIS);
      return;
    }
    try {
      await this.promptService.generer();
      this.notif.info('Prompt généré : il est prêt à être copié.');
    } catch (erreur) {
      this.notif.erreur(erreur instanceof Error ? erreur.message : 'Génération impossible.');
    }
  }

  /** Assemble (au besoin) le prompt et le copie dans le presse-papiers. */
  async copier(): Promise<void> {
    if (!this.autorise()) {
      this.notif.erreur(MESSAGE_ADMIN_REQUIS);
      return;
    }
    this.copieEnCours.set(true);
    try {
      const copie = await this.promptService.copier();
      if (copie) {
        this.notif.succes('Prompt copié dans le presse-papiers.');
      } else {
        this.notif.erreur(MESSAGE_COPIE_ECHEC);
      }
    } catch (erreur) {
      this.notif.erreur(erreur instanceof Error ? erreur.message : 'Copie impossible.');
    } finally {
      this.copieEnCours.set(false);
    }
  }
}
