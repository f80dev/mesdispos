/**
 * `AdminService` — source de vérité unique sur « la session courante est-elle
 * administratrice ? ».
 *
 * L'import des créneaux (F6) est **réservé à l'administrateur** ; cette
 * restriction est appliquée à trois niveaux :
 *
 *  1. **Route** — `adminGuard` refuse `/admin/import` et redirige ;
 *  2. **Interface** — `ImportComponent` n'affiche la zone de dépôt qu'à un
 *     administrateur, et `HeaderComponent` ne montre le lien « Importer des
 *     créneaux » qu'à lui ;
 *  3. **Données** — `firestore.rules` n'autorise l'écriture dans `creneaux`
 *     qu'à une session authentifiée dont le document `admins/{uid}` existe.
 *
 * Le service ne duplique pas la lecture Firestore : il s'appuie sur
 * `FIRESTORE_BACKEND.estAdmin()` (injectable, donc testable) et sur la session
 * `sessionAdmin` de l'`AuthService` — la session « nom seul » (cookie) n'est
 * **jamais** habilitée.
 */
import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { FIRESTORE_BACKEND } from './firestore.backend';

/** Message affiché à toute tentative d'import hors administrateur. */
export const MESSAGE_ADMIN_REQUIS = 'Accès réservé à un administrateur';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly auth = inject(AuthService);
  private readonly backend = inject(FIRESTORE_BACKEND);

  /**
   * `uid` de la session administrateur (session Firebase). La session « nom
   * seul » (cookie `mesdispos_nom`) n'apparaît jamais ici : un professeur
   * n'est donc jamais administrateur, même sur un poste partagé.
   */
  readonly uid = computed(() => this.auth.sessionAdmin()?.uid ?? null);

  /** Vrai quand la session courante est inscrite dans la collection `admins`. */
  readonly autorise = signal<boolean>(false);

  /** Vrai dès que la vérification d'accès a été faite (au moins une fois). */
  readonly verifie = signal<boolean>(false);

  constructor() {
    // La vérification est rejouée à chaque changement de session admin.
    effect(() => {
      void this.verifier(this.uid());
    });
  }

  /**
   * Vérifie (et met en cache) le droit d'administration de l'`uid` donné.
   *
   * Renvoie `false` si l'`uid` est absent, si la lecture échoue ou si le
   * document `admins/{uid}` n'existe pas.
   */
  async verifier(uid: string | null): Promise<boolean> {
    if (!uid) {
      this.autorise.set(false);
      this.verifie.set(true);
      return false;
    }
    let autorise = false;
    try {
      autorise = await this.backend.estAdmin(uid);
    } catch {
      autorise = false;
    }
    // Réponse périmée (la session a changé entre-temps) : on l'ignore.
    if (this.uid() === uid) {
      this.autorise.set(autorise);
      this.verifie.set(true);
    }
    return autorise;
  }

  /**
   * Supprime **toutes** les disponibilités déclarées par les professeurs
   * (toutes les partitions `users/{uid}/dispos`).
   *
   * Action strictement réservée à un administrateur : `firestore.rules`
   * n'autorise le `delete` en *collection group* qu'à `admins/{uid}`.
   * @returns le nombre de disponibilités supprimées.
   */
  async supprimerToutesLesDispos(): Promise<number> {
    if (!this.autorise()) {
      throw new Error(MESSAGE_ADMIN_REQUIS);
    }
    return this.backend.supprimerToutesDispos();
  }
}
