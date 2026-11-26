/**
 * Configuration applicative stockée **en base** (Firestore).
 *
 * Le document lu est `config/app` : il porte la date limite de réponse
 * (`deadline`). La valeur compilee `environments/settings.ts` n'est plus qu'un
 * **repli** : tant que `config/app` n'existe pas (base vide, projet non
 * configuré, lecture refusée), l'application affiche la valeur de `settings`.
 *
 * Format de la date limite : chaîne `'YYYY-MM-DD'` (jamais de `Date`/`Timestamp`
 * stockée — cf. AGENTS.md §13). L'affichage se fait via `dateLocale()`.
 */
import { Injectable, inject, signal } from '@angular/core';

import { settings } from '../../environments/settings';
import {
  FIRESTORE_BACKEND,
  raisonErreurFirestore,
  type Abonnement,
} from '../core/firestore.backend';
import { normalizeDate } from '../shared/date.util';

/** Identifiant du document de configuration applicative. */
export const CONFIG_APP_ID = 'app';

/** Date limite de repli quand la base ne répond pas (`settings.deadline`). */
function deadlineParDefaut(): string {
  const resultat = normalizeDate(settings.deadline);
  return resultat.ok ? resultat.valeur : '2027-01-31';
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly backend = inject(FIRESTORE_BACKEND);

  /** Date limite courante, au format `'YYYY-MM-DD'`. */
  readonly deadline = signal<string>(deadlineParDefaut());

  /** Cause de la dernière erreur de lecture (`null` si tout va bien). */
  readonly erreur = signal<string | null>(null);

  /** `true` pendant l'écriture de la date limite. */
  readonly enregistrementEnCours = signal<boolean>(false);

  private abonnement: Abonnement | null = null;

  /** Nombre de consommateurs-branchés (header, page admin). */
  private abonnes = 0;

  /** Abonnement en cours de lecture de `config/app`. */
  get ecoute(): boolean {
    return this.abonnement !== null;
  }

  /**
   * S'abonne à `config/app` : la date limite est mise à jour en temps réel
   * pour tous les clients (l'administrateur qui la modifie voit l'effet
   * immédiatement sur les postes des professeurs).
   *
   * L'abonnement est **partagé** : plusieurs composants (header, module
   * d'import) le consomment, un seul `onSnapshot` est ouvert ; il est fermé
   * quand le dernier consommateur se détache.
   */
  ecouter(): void {
    this.abonnes += 1;
    if (this.abonnement) {
      return;
    }
    this.erreur.set(null);
    // Appel **directement sur le backend** : détacher la méthode de son objet
    // perdrait le `this` (le SDK appelle `this.suivre()` / `this.pair()`).
    if (!this.backend.ecouterConfig) {
      return;
    }
    this.abonnement = this.backend.ecouterConfig(
      CONFIG_APP_ID,
      (doc) => {
        const brut = doc?.data()['deadline'];
        const resultat = normalizeDate(brut);
        if (resultat.ok) {
          this.deadline.set(resultat.valeur);
        }
      },
      (raison) => this.erreur.set(raison ?? null),
    );
  }

  /** Ferme l'abonnement courant (quand le dernier consommateur se détache). */
  arreter(): void {
    this.abonnes = Math.max(0, this.abonnes - 1);
    if (this.abonnes > 0) {
      return;
    }
    this.abonnement?.();
    this.abonnement = null;
  }

  /**
   * Enregistre la date limite dans `config/app`.
   *
   * @param `iso` date au format `'YYYY-MM-DD'` (la saisie du champ date natif).
   * @returns `true` si l'écriture a abouti, `false` si la date est invalide ou
   *          si l'écriture a échoué.
   */
  async enregistrerDeadline(iso: string): Promise<boolean> {
    const resultat = normalizeDate(iso);
    if (!resultat.ok) {
      return false;
    }
    if (!this.backend.ecrireConfig) {
      return false;
    }
    this.enregistrementEnCours.set(true);
    try {
      // Appel direct sur le backend : le `this` du SDK doit être conservé.
      await this.backend.ecrireConfig(CONFIG_APP_ID, { deadline: resultat.valeur });
      this.deadline.set(resultat.valeur);
      this.erreur.set(null);
      return true;
    } catch (e) {
      // Le message brut du SDK (« Missing or insufficient permissions. ») est
      // translated en cause actionnable : dans le cas le plus fréquent, les
      // règles déployées ne comportent pas encore `match /config/app`.
      const code = typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : '';
      this.erreur.set(
        code
          ? raisonErreurFirestore(e)
          : e instanceof Error
            ? e.message
            : 'Écriture impossible.',
      );
      return false;
    } finally {
      this.enregistrementEnCours.set(false);
    }
  }
}
