import { Injectable, inject, signal } from '@angular/core';

import { FIRESTORE_BACKEND } from '../core/firestore.backend';
import { utilisateurAnonyme } from '../core/auth.service';
import { ProfService, profsDepuisProfils, type Prof } from './prof.service';

/** Message affiché quand la liste des logins est indisponible. */
export const MESSAGE_LOGINS_INDISPONIBLES =
  'Liste des professeurs indisponible. Réessayez.';

/**
 * `LoginsService` — liste des **logins possibles** proposée à la connexion.
 *
 * Source de vérité : la collection Firestore `users` (les partitions de
 * professeurs connues). Au lancement :
 *
 *  1. on **liste** `users` et on en déduit les logins (les fiches sans `login`,
 *     issues de la saisie libre, sont ignorées) ;
 *  2. si la collection est **vide**, on la **peuple** depuis `profs.xlsx`
 *     (repli : API Oasis), via `ProfService`, puis on en déduit la liste.
 *
 * Le peuplement est **idempotent** (`setDoc` en `merge`) : un rechargement
 * n'écrase pas les préférences déjà enregistrées (`soutenanceAnglais`).
 */
@Injectable({ providedIn: 'root' })
export class LoginsService {
  private readonly backend = inject(FIRESTORE_BACKEND);
  private readonly annuaire = inject(ProfService);

  /** Logins proposés à la connexion (triés par nom complet). */
  readonly logins = signal<Prof[]>([]);

  /** Vrai pendant le chargement de la liste. */
  readonly chargement = signal<boolean>(false);

  /** Message d'erreur de chargement, `null` si aucun. */
  readonly erreur = signal<string | null>(null);

  /** Origine de la liste courante : `users` ou annuaire (`profs.xlsx`/API). */
  readonly source = signal<'users' | 'annuaire' | null>(null);

  /** `uid` Firestore de chaque professeur, par login. */
  private readonly uidParLogin = new Map<string, string>();

  private dejaCharge = false;

  /**
   * Charge la liste des logins (une seule fois par session d'onglet).
   *
   * La collection `users` prime. Si elle est vide, elle est peuplée depuis
   * `profs.xlsx` (repli API Oasis) via `ProfService`.
   */
  async charger(): Promise<void> {
    if (this.dejaCharge || this.chargement()) {
      return;
    }
    this.chargement.set(true);
    this.erreur.set(null);
    try {
      const depuisUsers = await this.listerDepuisUsers();
      if (depuisUsers.length > 0) {
        this.logins.set(depuisUsers);
        this.source.set('users');
        this.dejaCharge = true;
        await this.synchroniser(depuisUsers);
        return;
      }

      await this.annuaire.charger();
      const annuaire = this.annuaire.profs();
      if (annuaire.length > 0) {
        await this.peupler(annuaire);
        this.logins.set(annuaire);
        this.source.set('annuaire');
        this.dejaCharge = true;
        return;
      }

      this.erreur.set(this.annuaire.erreur() ?? MESSAGE_LOGINS_INDISPONIBLES);
    } finally {
      this.chargement.set(false);
    }
  }

  /** Force un nouveau chargement (bouton « Réessayer »). */
  reessayer(): void {
    this.dejaCharge = false;
    void this.charger();
  }

  /**
   * Logins déduits de la collection `users`.
   *
   * @returns la liste (vide si la collection est vide ou illisible).
   */
  private async listerDepuisUsers(): Promise<Prof[]> {
    if (!this.backend.configure) {
      return [];
    }
    try {
      const profils = await this.backend.listerProfils();
      this.uidParLogin.clear();
      for (const profil of profils) {
        const login =
          typeof profil.data?.['login'] === 'string' ? profil.data['login'].trim() : '';
        if (login) {
          this.uidParLogin.set(login, profil.uid);
        }
      }
      return profsDepuisProfils(profils);
    } catch {
      return [];
    }
  }

  /**
   * Complète les fiches `users/{uid}` des professeurs dont l'**email** ou le
   * **statut** manquent, à partir de l'annuaire (`profs.xlsx`).
   *
   * L'écriture est un `upsert` en mode `merge` : les préférences déjà
   * enregistrées (`soutenanceAnglais`) ne sont jamais écrasées.
   */
  private async synchroniser(profs: readonly Prof[]): Promise<void> {
    if (!this.backend.configure) {
      return;
    }
    const aCompleter = profs.filter((prof) => !prof.mailPro || !prof.statut);
    if (aCompleter.length === 0) {
      return;
    }
    await this.annuaire.charger();
    const parLogin = new Map(this.annuaire.profs().map((prof) => [prof.login, prof]));
    const items: Array<{ uid: string; data: Record<string, unknown> }> = [];
    const complements = new Map<string, { email?: string; statut?: string }>();
    for (const prof of aCompleter) {
      const source = parLogin.get(prof.login);
      if (!source) {
        continue;
      }
      const uid = this.uidParLogin.get(prof.login);
      if (!uid) {
        continue;
      }
      const data: Record<string, unknown> = {};
      if (!prof.mailPro && source.mailPro) {
        data['email'] = source.mailPro;
      }
      if (!prof.statut && source.statut) {
        data['statut'] = source.statut;
      }
      if (Object.keys(data).length > 0) {
        items.push({ uid, data });
        complements.set(prof.login, {
          ...(typeof data['email'] === 'string' ? { email: data['email'] } : {}),
          ...(typeof data['statut'] === 'string' ? { statut: data['statut'] } : {}),
        });
      }
    }
    if (items.length === 0) {
      return;
    }
    try {
      await this.backend.upsertProfils(items);
      this.logins.set(
        profs.map((prof) => {
          const complement = complements.get(prof.login);
          if (!complement) {
            return prof;
          }
          return {
            ...prof,
            ...(complement.email ? { mailPro: complement.email } : {}),
            ...(complement.statut ? { statut: complement.statut } : {}),
          };
        }),
      );
    } catch (e) {
      console.warn('[MesDispos] Synchronisation email / statut des professeurs impossible :', e);
    }
  }

  /**
   * Peuple la collection `users` avec les professeurs de l'annuaire.
   *
   * L'`uid` de chaque partition est dérivé du nom affiché
   * (`anon_<sha256(nomComplet)[:12]>`), comme à la connexion « nom seul » :
   * un professeur qui se connecte ensuite retrouve ainsi sa fiche.
   */
  private async peupler(profs: readonly Prof[]): Promise<void> {
    if (!this.backend.configure) {
      return;
    }
    const items = profs.map((prof) => ({
      uid: utilisateurAnonyme(prof.nomComplet).uid,
      data: {
        login: prof.login,
        nom: prof.nom,
        prenom: prof.prenom,
        ...(prof.secteur ? { secteur: prof.secteur } : {}),
        ...(prof.mailPro ? { email: prof.mailPro } : {}),
        ...(prof.statut ? { statut: prof.statut } : {}),
        updatedAt: Date.now(),
      },
    }));
    try {
      await this.backend.upsertProfils(items);
    } catch (e) {
      console.warn('[MesDispos] Peuplement de la collection users impossible :', e);
    }
  }
}
