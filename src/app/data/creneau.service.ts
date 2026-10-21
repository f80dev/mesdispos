import { Injectable, inject, signal } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';

import { FIRESTORE_BACKEND } from '../core/firestore.backend';
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

  private arret: Unsubscribe | null = null;

  /**
   * Abonne `creneaux` à `onSnapshot(collection(db, 'creneaux'))`.
   * @returns fonction de désabonnement (synchrone, §7).
   */
  ecouter(): Unsubscribe {
    this.arreter();
    this.chargement.set(true);
    this.erreur.set(null);

    let annule = false;
    let interne: Unsubscribe | null = null;
    void this.brancher().then((souscription) => {
      interne = souscription;
      if (annule) {
        souscription();
      }
    });

    const stopper = (): void => {
      annule = true;
      interne?.();
      interne = null;
      this.arret = null;
    };
    this.arret = stopper;
    return stopper;
  }

  private async brancher(): Promise<Unsubscribe> {
    if (!this.backend.configure) {
      this.chargement.set(false);
      this.erreur.set(MESSAGE_CONFIG_MANQUANTE);
      return () => undefined;
    }
    return this.backend.ecouterCreneaux(
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
      () => {
        this.chargement.set(false);
        this.erreur.set(MESSAGE_LECTURE_CREENEAUX);
      },
    );
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
}
