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
 *
 * Deux voies d'accès à l'espace administrateur coexistent :
 *  - session **Google** (`admins/{uid}` écrit depuis la console Firebase) ;
 *  - session **par mot de passe** : une session Firebase anonyme est ouverte,
 *    puis `autoriserParMotDePasse()` crée `admins/{uid}` — l'écriture n'est
 *    acceptée par `firestore.rules` que si l'empreinte du mot de passe
 *    correspond à celle stockée dans `config/admin`.
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
      // Une autorisation déjà acquise (mot de passe administrateur) n'est pas
      // révoquée par une vérification tardive arrivée entre-temps.
      if (autorise || this.autorise()) {
        this.autorise.set(true);
        this.verifie.set(true);
        return true;
      }
      this.autorise.set(false);
      this.verifie.set(true);
    }
    return autorise;
  }

  /**
   * Ouvre l'accès administrateur à partir d'un **mot de passe**.
   *
   * Le mot de passe n'est jamais écrit en clair : le service ne reçoit que
   * son empreinte SHA-256 (`empreinte`), comparée **côté serveur** par
   * `firestore.rules` à celle stockée dans `config/admin`. En cas d'empreinte
   * incorrecte, l'écriture est refusée (`permission-denied`) et l'appel
   * échoue.
   *
   * @param `uid` uid de la session Firebase anonyme ouverte pour l'admin.
   * @param `empreinte` empreinte SHA-256 (hex) du mot de passe saisi.
   */
  async autoriserParMotDePasse(uid: string, empreinte: string): Promise<void> {
    await this.backend.creerAdmin(uid, {
      email: 'admin-mot-de-passe',
      empreinte,
      updatedAt: Date.now(),
    });
    this.autorise.set(true);
    this.verifie.set(true);
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

  /**
   * Efface **l'ensemble des professeurs** de la base : tous les profils
   * (`users/{uid}`) et toutes leurs disponibilités (`users/{uid}/dispos`).
   *
   * Les disponibilités sont supprimées **d'abord** : ce sont des
   * sous-collections, la suppression du document parent ne les efface pas.
   *
   * La partition de l'administrateur courant (`sessionAdmin`) est préservée :
   * l'effacement ne doit pas éjecter l'administrateur en cours d'action.
   *
   * @returns le nombre de profils et de disponibilités effacés.
   */
  async supprimerTousLesProfils(): Promise<{ profils: number; dispos: number }> {
    if (!this.autorise()) {
      throw new Error(MESSAGE_ADMIN_REQUIS);
    }
    if (!this.backend.supprimerTousProfils) {
      throw new Error('Suppression des profils indisponible.');
    }
    const dispos = await this.backend.supprimerToutesDispos();
    const profils = await this.backend.supprimerTousProfils(this.uid() ?? undefined);
    return { profils, dispos };
  }
}
