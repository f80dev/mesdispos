import { Injectable, inject, signal } from '@angular/core';

import { AUCUN_ABONNEMENT, FIRESTORE_BACKEND, type Abonnement } from '../core/firestore.backend';
import { MESSAGE_CONFIG_MANQUANTE } from '../core/firebase';
import { normalizeDate, normalizeHeure, trierCreneaux } from '../shared/date.util';
import type { Creneau } from './models';

/** Message d'erreur de lecture affiché à l'utilisateur (F3). */
export const MESSAGE_LECTURE_CREENEAUX =
  'Impossible de lire les créneaux. Vérifiez votre connexion.';

/**
 * Convertit un document Firestore en `Creneau` **validé** : les champs sont
 * renormalisés (`'YYYY-MM-DD'`, `'HH:mm'`) et un document incohérent est ignoré
 * plutôt que d'afficher une ligne cassée.
 */
export function versCreneau(id: string, data: Record<string, unknown>): Creneau | null {
  const date = normalizeDate(data['date']);
  const debut = normalizeHeure(data['heureDebut']);
  const fin = normalizeHeure(data['heureFin']);
  if (!date.ok || !debut.ok || !fin.ok || fin.valeur <= debut.valeur) {
    return null;
  }
  const brut = data['libelle'];
  const libelle = typeof brut === 'string' && brut.trim().length > 0 ? brut.trim() : undefined;
  return {
    id,
    date: date.valeur,
    heureDebut: debut.valeur,
    heureFin: fin.valeur,
    ...(libelle ? { libelle } : {}),
  };
}

/**
 * `CreneauService` — lecture **temps réel** de la collection `creneaux` (F5).
 *
 * La lecture passe par `FIRESTORE_BACKEND` (abstraction injectable), ce qui
 * permet aux tests unitaires de fournir un faux backend sans `vi.mock`.
 */
@Injectable({ providedIn: 'root' })
export class CreneauService {
  private readonly backend = inject(FIRESTORE_BACKEND);

  /** Créneaux triés par date puis heure de début puis heure de fin (F5). */
  readonly creneaux = signal<Creneau[]>([]);

  /** `true` tant que le premier `onSnapshot` n'a pas répondu. */
  readonly chargement = signal<boolean>(true);

  /** Message d'erreur de lecture, `null` si tout va bien. */
  readonly erreur = signal<string | null>(null);

  private arret: Abonnement | null = null;

  /**
   * Abonne `creneaux` à `onSnapshot(collection(db, 'creneaux'))`.
   * @returns fonction de désabonnement (synchrone, §7).
   */
  ecouter(): Abonnement {
    this.arreter();
    this.chargement.set(true);
    this.erreur.set(null);

    if (!this.backend.configure) {
      this.chargement.set(false);
      this.erreur.set(MESSAGE_CONFIG_MANQUANTE);
      this.arret = AUCUN_ABONNEMENT;
      return this.arret;
    }

    this.arret = this.backend.ecouterCreneaux(
      (instantane) => {
        const liste: Creneau[] = [];
        for (const doc of instantane.docs) {
          const creneau = versCreneau(doc.id, doc.data());
          if (creneau) {
            liste.push(creneau);
          }
        }
        this.creneaux.set(trierCreneaux(liste));
        this.chargement.set(false);
        this.erreur.set(null);
      },
      (raison) => {
        this.chargement.set(false);
        this.erreur.set(raison ?? MESSAGE_LECTURE_CREENEAUX);
      },
    );
    return this.arret;
  }

  /** Détache l'écoute courante. */
  arreter(): void {
    this.arret?.();
    this.arret = null;
  }

  /** Bouton « Réessayer » de la page (F3). */
  reecouter(): void {
    this.ecouter();
  }

  /**
   * Supprime **tous** les créneaux (action réservée à l'administrateur).
   * Passe par un `writeBatch` (`firestore.rules` exige `admins/{uid}`).
   * @returns le nombre de créneaux supprimés.
   */
  async supprimerTous(): Promise<number> {
    if (!this.backend.configure) {
      throw new Error(MESSAGE_CONFIG_MANQUANTE);
    }
    const supprimes = await this.backend.supprimerTousCreneaux();
    this.creneaux.set([]);
    return supprimes;
  }
}
