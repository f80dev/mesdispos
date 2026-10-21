import { Injectable, computed, inject, signal } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';

import { FIRESTORE_BACKEND } from '../core/firestore.backend';
import { AuthService } from '../core/auth.service';
import { NotifService } from '../core/notif.service';
import { CreneauService } from './creneau.service';
import { normalizeDate, normalizeHeure, trierCreneaux } from '../shared/date.util';
import type { Creneau, Dispo } from './models';

/** Message d'erreur d'écriture + action « Réessayer » (F4). */
export const MESSAGE_ECHEC_ECRITURE = 'Enregistrement impossible. Réessayer';

/** Message d'erreur de lecture de la sous-collection `dispos`. */
export const MESSAGE_LECTURE_DISPOS = 'Impossible de lire vos disponibilités. Réessayez.';

export function versDispo(id: string, data: Record<string, unknown>): Dispo | null {
  const date = normalizeDate(data['date']);
  const debut = normalizeHeure(data['heureDebut']);
  const fin = normalizeHeure(data['heureFin']);
  if (!date.ok || !debut.ok || !fin.ok) {
    return null;
  }
  const maj = data['updatedAt'];
  const brut = data['libelle'];
  const libelle = typeof brut === 'string' && brut.trim().length > 0 ? brut.trim() : undefined;
  return {
    creneauId: id,
    date: date.valeur,
    heureDebut: debut.valeur,
    heureFin: fin.valeur,
    ...(libelle ? { libelle } : {}),
    updatedAt: typeof maj === 'number' && Number.isFinite(maj) ? maj : 0,
  };
}

/**
 * `DispoService` — la sélection immédiate (F4).
 *
 * Séquence à chaque clic :
 *  1. mise à jour **optimiste** du signal local (la ligne change de section
 *     instantanément) ;
 *  2. état « en cours » sur la ligne pendant l'écriture ;
 *  3. `setDoc(users/{uid}/dispos/{creneauId}, Dispo)` ou `deleteDoc(...)` ;
 *  4. succès → l'état « en cours » disparaît ; échec → **rollback** de l'état
 *     local + `mat-snack-bar` « Enregistrement impossible. Réessayer » dont
 *     l'action rejoue l'écriture.
 *
 * Écritures concurrentes tolérées : chaque créneau porte un compteur de
 * séquence, donc **la dernière action gagne** (une réponse tardive d'une action
 * périmée ne peut ni écraser l'état local ni remettre le spinner).
 *
 * Les écritures/lectures passent par `FIRESTORE_BACKEND` (abstraction
 * injectable), pas par un import direct du module Firebase.
 */
@Injectable({ providedIn: 'root' })
export class DispoService {
  private readonly auth = inject(AuthService);
  private readonly creneauxService = inject(CreneauService);
  private readonly notif = inject(NotifService);
  private readonly backend = inject(FIRESTORE_BACKEND);

  /** Disponibilités de l'utilisateur, brutes (temps réel). */
  readonly dispos = signal<Dispo[]>([]);

  /** Créneaux dont l'écriture est en cours. */
  readonly enCours = signal<ReadonlySet<string>>(new Set<string>());

  readonly chargement = signal<boolean>(true);
  readonly erreur = signal<string | null>(null);

  /** Identifiants des créneaux retenus (jointure mémoire, F5). */
  readonly idsSelectionnes = computed<ReadonlySet<string>>(
    () => new Set(this.dispos().map((dispo) => dispo.creneauId)),
  );

  /** Créneaux disponibles = tous les créneaux moins ceux déjà retenus. */
  readonly disponibles = computed<Creneau[]>(() => {
    const retenus = this.idsSelectionnes();
    return this.creneauxService.creneaux().filter((creneau) => !retenus.has(creneau.id));
  });

  /**
   * Créneaux retenus, **jointure mémoire** par `creneauId`. Les disponibilités
   * orphelines (créneau supprimé par un admin, document `dispo` resté) sont
   * conservées et affichées grâce aux champs dénormalisés (cf. §14).
   */
  readonly retenus = computed<Creneau[]>(() => {
    const parId = new Map(this.creneauxService.creneaux().map((creneau) => [creneau.id, creneau]));
    const liste: Creneau[] = [];
    for (const dispo of this.dispos()) {
      const connu = parId.get(dispo.creneauId);
      liste.push(
        connu ?? {
          id: dispo.creneauId,
          date: dispo.date,
          heureDebut: dispo.heureDebut,
          heureFin: dispo.heureFin,
          ...(dispo.libelle ? { libelle: dispo.libelle } : {}),
        },
      );
    }
    return trierCreneaux(liste);
  });

  /** Compteur « Mes disponibilités (N) » (F3). */
  readonly nombreRetenus = computed(() => this.retenus().length);

  private arret: Unsubscribe | null = null;
  private readonly sequences = new Map<string, number>();

  /**
   * Abonne `dispos` à `onSnapshot(users/{uid}/dispos)` (F4 multi-appareil).
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
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.chargement.set(false);
      return () => undefined;
    }
    if (!this.backend.configure) {
      this.chargement.set(false);
      return () => undefined;
    }
    return this.backend.ecouterDispos(
      uid,
      (instantane) => {
        const liste: Dispo[] = [];
        for (const doc of instantane.docs) {
          const dispo = versDispo(doc.id, doc.data());
          if (dispo) {
            liste.push(dispo);
          }
        }
        this.dispos.set(trierCreneaux(liste));
        this.chargement.set(false);
        this.erreur.set(null);
      },
      () => {
        this.chargement.set(false);
        this.erreur.set(MESSAGE_LECTURE_DISPOS);
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

  /** F4 — un clic sélectionne / désélectionne. Aucun bouton « Enregistrer ». */
  async basculer(creneau: Creneau): Promise<void> {
    const wanted = !this.idsSelectionnes().has(creneau.id);
    await this.appliquer(creneau, wanted);
  }

  /** `true` si l'écriture de ce créneau est en cours (spinner 16 px). */
  estEnCours(creneauId: string): boolean {
    return this.enCours().has(creneauId);
  }

  /** Écriture immédiate : `setDoc` (sélection) ou `deleteDoc` (désélection). */
  private async appliquer(creneau: Creneau, wanted: boolean): Promise<void> {
    const sequence = (this.sequences.get(creneau.id) ?? 0) + 1;
    this.sequences.set(creneau.id, sequence);
    this.marquerEnCours(creneau.id, true);
    this.majOptimiste(creneau, wanted);

    try {
      const uid = this.auth.user()?.uid;
      if (!uid) {
        throw new Error('aucune session');
      }
      if (wanted) {
        const dispo: Dispo = {
          creneauId: creneau.id,
          date: creneau.date,
          heureDebut: creneau.heureDebut,
          heureFin: creneau.heureFin,
          ...(creneau.libelle ? { libelle: creneau.libelle } : {}),
          updatedAt: Date.now(),
        };
        await this.backend.setDispo(uid, creneau.id, dispo);
      } else {
        await this.backend.deleteDispo(uid, creneau.id);
      }
    } catch {
      // Rollback : on annule l'effet optimiste si aucune action plus récente
      // n'a pris le relais sur ce créneau.
      if (this.sequences.get(creneau.id) === sequence) {
        this.majOptimiste(creneau, !wanted);
      }
      this.notif.reessayer(MESSAGE_ECHEC_ECRITURE, () => {
        void this.appliquer(creneau, wanted);
      });
    } finally {
      if (this.sequences.get(creneau.id) === sequence) {
        this.marquerEnCours(creneau.id, false);
      }
    }
  }

  /** Bascule l'état local immédiatement (sans écrire). */
  private majOptimiste(creneau: Creneau, selected: boolean): void {
    const dejaPresent = this.idsSelectionnes().has(creneau.id);
    if (selected && !dejaPresent) {
      const dispo: Dispo = {
        creneauId: creneau.id,
        date: creneau.date,
        heureDebut: creneau.heureDebut,
        heureFin: creneau.heureFin,
        ...(creneau.libelle ? { libelle: creneau.libelle } : {}),
        updatedAt: Date.now(),
      };
      this.dispos.set(trierCreneaux([...this.dispos(), dispo]));
      return;
    }
    if (!selected && dejaPresent) {
      this.dispos.set(this.dispos().filter((dispo) => dispo.creneauId !== creneau.id));
    }
  }

  private marquerEnCours(creneauId: string, actif: boolean): void {
    const suivant = new Set(this.enCours());
    if (actif) {
      suivant.add(creneauId);
    } else {
      suivant.delete(creneauId);
    }
    this.enCours.set(suivant);
  }
}
