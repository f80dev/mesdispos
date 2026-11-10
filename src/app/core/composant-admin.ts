import { inject } from '@angular/core';

import { AdminService, MESSAGE_ADMIN_REQUIS } from './admin.service';
import { NotifService } from './notif.service';

/**
 * Socle commun des pages d'administration.
 *
 * Il expose l'état d'autorisation (`autorise`, `verifie`) et centralise le
 * contrôle « administrateur requis » que chaque action répétait jusqu'ici :
 *
 * ```ts
 * if (!this.exigerAdmin()) {
 *   return;
 * }
 * ```
 *
 * Aucun composant n'a plus à réinjecter `AdminService` / `NotifService` ni à
 * recopier le message d'erreur.
 */
export abstract class ComposantAdmin {
  protected readonly admin = inject(AdminService);
  protected readonly notif = inject(NotifService);

  /** Vrai quand la session courante est inscrite dans `admins/{uid}`. */
  readonly autorise = this.admin.autorise;

  /** Vrai dès que la vérification d'accès a été faite (au moins une fois). */
  readonly verifie = this.admin.verifie;

  /** Message affiché à toute tentative hors administrateur. */
  readonly messageAdminRequis = MESSAGE_ADMIN_REQUIS;

  /** `true` si la session est administratrice ; sinon notifie et renvoie `false`. */
  protected exigerAdmin(): boolean {
    if (this.autorise()) {
      return true;
    }
    this.notif.erreur(MESSAGE_ADMIN_REQUIS);
    return false;
  }
}
