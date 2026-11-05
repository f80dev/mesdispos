/**
 * Accès Firestore — **contrat** injectable (`FIRESTORE_BACKEND`) + son
 * implémentation production (`FirestoreReelBackend`).
 *
 * Pourquoi une abstraction :
 *  - Le module `@angular/build:unit-test` (Vitest) **désactive `vi.mock`
 *    pour les imports relatifs** : le code applicatif dépend donc de cette
 *    abstraction via l'injection Angular, pas d'un import direct depuis
 *    `core/firebase`. Les tests unitaires fournissent un faux backend.
 *  - En production, `FirestoreReelBackend` utilise `onSnapshot`, `setDoc`,
 *    `deleteDoc`, `writeBatch` du SDK Firebase (chargé en *import dynamique*
 *    pour rester sous le budget initial).
 *  - Le contrat couvre **strictement** les opérations utilisées par
 *    `CreneauService`, `DispoService`, `ExcelImportService` et `adminGuard`.
 *    Toute autre opération ferait croître l'interface — préférable à un `any`
 *    fourre-tout.
 */
import { Injectable, InjectionToken } from '@angular/core';
import type { DocumentReference, Firestore } from 'firebase/firestore';

import { chargerFirestore, firebaseDb } from './firebase';
import { firebaseConfigure } from '../../environments/firebase.config';

/** Fonction de désabonnement — **synchrone** (§7). */
export type Abonnement = () => void;

/** Document Firestore minimal : son `id` et ses champs bruts. */
export interface SnapshotDoc {
  readonly id: string;
  readonly data: () => Record<string, unknown>;
}

/** Instantané d'une collection : la liste de ses documents. */
export interface Snapshot {
  readonly docs: ReadonlyArray<SnapshotDoc>;
}

/**
 * Callback d'erreur de lecture. Le paramètre optionnel `raison` porte le
 * message technique court issu de l'erreur Firestore (`permission-denied`,
 * `unavailable`, …) : il permet à l'UI de distinguer un problème réseau
 * d'un refus des règles de sécurité. Les implémentations de test peuvent
 * l'ignorer (`() => void` reste assignable).
 */
export type CallbackErreur = (raison?: string) => void;

/** Un professeur identifié par sa partition Firestore (`users/{uid}`). */
export interface ProfilAdmin {
  /** `uid` de la partition (`anon_<sha256[:12]>` ou `uid` Firebase). */
  readonly uid: string;
  /** Champs bruts du profil (`login`, `nom`, `prenom`). */
  readonly data: Record<string, unknown>;
}

/** Une disponibilité déclarée, avec la partition à laquelle elle appartient. */
export interface DispoAdmin {
  /** `uid` de la partition propriétaire (`users/{uid}/dispos/{id}`). */
  readonly uid: string;
  /** Identifiant du créneau (`creneaux/{id}`). */
  readonly id: string;
  /** Champs bruts de la disponibilité (`date`, `heureDebut`, `heureFin`, …). */
  readonly data: Record<string, unknown>;
}

export interface FirestoreBackend {
  /** `true` quand la configuration Firebase a été remplacée par l'humain. */
  readonly configure: boolean;

  /** `onSnapshot(collection(db, 'creneaux'))` — alimente `CreneauService`. */
  ecouterCreneaux(suivant: (s: Snapshot) => void, erreur: CallbackErreur): Abonnement;

  /** `onSnapshot(collection(db, 'users', uid, 'dispos'))`. */
  ecouterDispos(uid: string, suivant: (s: Snapshot) => void, erreur: CallbackErreur): Abonnement;

  /** `setDoc(users/{uid}/dispos/{id}, …)`. */
  setDispo(uid: string, id: string, data: unknown): Promise<void>;

  /**
   * `getDocs(collection(db, 'users', uid, 'dispos'))` puis `id` — les
   * créneaux déjà retenus par un professeur donné.
   */
  lireIdsDispos(uid: string): Promise<string[]>;

  /**
   * `writeBatch.set(users/{uid}/dispos/{id}, …)` par lots de 500.
   *
   * Utilisé par l'attribution administrateur : écrire les disponibilités de
   * plusieurs professeurs en une poignée d'allers-retours.
   */
  upsertDispos(items: ReadonlyArray<{ uid: string; id: string; data: unknown }>): Promise<number>;

  /** `setDoc(users/{uid}, …)` — profil du professeur (login, nom, prénom). */
  setProfil(uid: string, data: unknown): Promise<void>;

  /** `getDoc(users/{uid})` — profil du professeur, `null` si absent. */
  lireProfil(uid: string): Promise<Record<string, unknown> | null>;

  /** `deleteDoc(users/{uid}/dispos/{id})`. */
  deleteDispo(uid: string, id: string): Promise<void>;

  /** `getDocs(collection(db, 'creneaux'))` puis `id` — dédoublonnage. */
  listerIdsCreneaux(): Promise<string[]>;

  /** `writeBatch.set(creneaux/{id}, …)` par lots de 500 (F6). */
  upsertCreneaux(items: ReadonlyArray<{ id: string; data: unknown }>): Promise<number>;

  /** `writeBatch.delete(creneaux/{id})` sur **toutes** les fiches, par lots de 500. */
  supprimerTousCreneaux(): Promise<number>;

  /**
   * `writeBatch.delete(...)` sur **toutes** les disponibilités déclarées,
   * via une requête `collectionGroup('dispos')` (toutes partitions `users/*`).
   */
  supprimerToutesDispos(): Promise<number>;

  /** `getDoc(admins/{uid}).exists` — pour `adminGuard`. */
  estAdmin(uid: string): Promise<boolean>;

  /**
   * `getDocs(collection(db, 'users'))` — l'inventaire des professeurs
   * (login, nom, prénom) et de leur partition `uid`.
   */
  listerProfils(): Promise<readonly ProfilAdmin[]>;

  /**
   * `getDocs(collectionGroup(db, 'dispos'))` — **toutes** les disponibilités
   * déclarées, tous professeurs confondus (réservé à l'administrateur :
   * `firestore.rules` n'autorise cette lecture en *collection group* qu'à
   * `admins/{uid}`).
   */
  lireToutesDispos(): Promise<readonly DispoAdmin[]>;
}

export const FIRESTORE_BACKEND = new InjectionToken<FirestoreBackend>('FirestoreBackend');

/** Abonnement vide : configuration absente ou abonnement déjà résilié. */
export const AUCUN_ABONNEMENT: Abonnement = () => undefined;

/** Taille maximale d'un batch Firestore (F6 : 500 opérations, découpage auto). */
export const TAILLE_BATCH = 500;

/**
 * Traduit une erreur du SDK Firestore en **cause courte et actionnable**.
 *
 * Objectif : ne plus afficher un message générique (« Impossible de lire les
 * créneaux ») quand la cause réelle est un refus des règles de sécurité
 * (`permission-denied`) — cas le plus fréquent : les règles déployées dans la
 * console Firebase ne correspondent pas à `firestore.rules`.
 */
export function raisonErreurFirestore(err: unknown): string {
  const code =
    typeof (err as { code?: unknown })?.code === 'string' ? (err as { code: string }).code : '';
  switch (code) {
    case 'permission-denied':
      return 'Accès refusé par les règles de sécurité Firestore (permission-denied) : le fichier firestore.rules n’est pas déployé sur le projet.';
    case 'unavailable':
      return 'Firestore est momentanément indisponible (unavailable) : vérifiez votre connexion.';
    case 'not-found':
      return 'Base Firestore introuvable dans ce projet Firebase (not-found).';
    case 'failed-precondition':
      return 'Opération refusée par Firestore (failed-precondition) : le projet Firebase est-il bien configuré ?';
    case 'unauthenticated':
      return 'Session Firebase absente ou expirée (unauthenticated) : reconnectez-vous.';
    default:
      return code ? `Erreur Firestore (${code}).` : 'Erreur Firestore inconnue.';
  }
}

/** Module `firebase/firestore` (typé, chargé à la demande). */
type ModuleFirestore = typeof import('firebase/firestore');

/**
 * `FirestoreReelBackend` — l'implémentation production du `FirestoreBackend`.
 *
 * Sans configuration valide, **toutes les opérations no-opent** : les
 * services affichent alors le `MESSAGE_CONFIG_MANQUANTE` à l'utilisateur.
 */
@Injectable({ providedIn: 'root' })
export class FirestoreReelBackend implements FirestoreBackend {
  get configure(): boolean {
    return firebaseConfigure();
  }

  ecouterCreneaux(suivant: (s: Snapshot) => void, erreur: CallbackErreur): Abonnement {
    return this.suivre(
      (fs, db) =>
        fs.onSnapshot(
          fs.collection(db, 'creneaux'),
          (instantane) => suivant(instantane as unknown as Snapshot),
          (e) => erreur(this.raisonner(e)),
        ),
      erreur,
    );
  }

  ecouterDispos(uid: string, suivant: (s: Snapshot) => void, erreur: CallbackErreur): Abonnement {
    return this.suivre(
      (fs, db) =>
        fs.onSnapshot(
          fs.collection(db, 'users', uid, 'dispos'),
          (instantane) => suivant(instantane as unknown as Snapshot),
          (e) => erreur(this.raisonner(e)),
        ),
      erreur,
    );
  }

  async setDispo(uid: string, id: string, data: unknown): Promise<void> {
    const [db, fs] = await this.pair();
    await fs.setDoc(fs.doc(db, 'users', uid, 'dispos', id), data as Record<string, unknown>);
  }

  async deleteDispo(uid: string, id: string): Promise<void> {
    const [db, fs] = await this.pair();
    await fs.deleteDoc(fs.doc(db, 'users', uid, 'dispos', id));
  }

  async lireIdsDispos(uid: string): Promise<string[]> {
    const [db, fs] = await this.pair();
    const snap = await fs.getDocs(fs.collection(db, 'users', uid, 'dispos'));
    return snap.docs.map((doc) => doc.id);
  }

  async upsertDispos(
    items: ReadonlyArray<{ uid: string; id: string; data: unknown }>,
  ): Promise<number> {
    if (items.length === 0) {
      return 0;
    }
    const [db, fs] = await this.pair();
    let ecrits = 0;
    for (let debut = 0; debut < items.length; debut += TAILLE_BATCH) {
      const lot = items.slice(debut, debut + TAILLE_BATCH);
      const batch = fs.writeBatch(db);
      for (const { uid, id, data } of lot) {
        batch.set(fs.doc(db, 'users', uid, 'dispos', id), data as Record<string, unknown>);
      }
      await batch.commit();
      ecrits += lot.length;
    }
    return ecrits;
  }

  async setProfil(uid: string, data: unknown): Promise<void> {
    const [db, fs] = await this.pair();
    await fs.setDoc(fs.doc(db, 'users', uid), data as Record<string, unknown>);
  }

  async lireProfil(uid: string): Promise<Record<string, unknown> | null> {
    const [db, fs] = await this.pair();
    const snap = await fs.getDoc(fs.doc(db, 'users', uid));
    return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
  }

  async listerIdsCreneaux(): Promise<string[]> {
    const [db, fs] = await this.pair();
    const snap = await fs.getDocs(fs.collection(db, 'creneaux'));
    return snap.docs.map((doc) => doc.id);
  }

  async upsertCreneaux(items: ReadonlyArray<{ id: string; data: unknown }>): Promise<number> {
    const [db, fs] = await this.pair();
    if (items.length === 0) {
      return 0;
    }
    let importes = 0;
    for (let debut = 0; debut < items.length; debut += TAILLE_BATCH) {
      const lot = items.slice(debut, debut + TAILLE_BATCH);
      const batch = fs.writeBatch(db);
      for (const { id, data } of lot) {
        batch.set(fs.doc(db, 'creneaux', id), data as Record<string, unknown>);
      }
      await batch.commit();
      importes += lot.length;
    }
    return importes;
  }

  async supprimerTousCreneaux(): Promise<number> {
    const [db, fs] = await this.pair();
    const snap = await fs.getDocs(fs.collection(db, 'creneaux'));
    return this.supprimerReferences(snap.docs.map((doc) => doc.ref));
  }

  async supprimerToutesDispos(): Promise<number> {
    const [db, fs] = await this.pair();
    const snap = await fs.getDocs(fs.collectionGroup(db, 'dispos'));
    return this.supprimerReferences(snap.docs.map((doc) => doc.ref));
  }

  /** Supprime les documents référencés par lots de 500 (`TAILLE_BATCH`). */
  private async supprimerReferences(refs: ReadonlyArray<DocumentReference>): Promise<number> {
    if (refs.length === 0) {
      return 0;
    }
    const [db, fs] = await this.pair();
    let supprimes = 0;
    for (let debut = 0; debut < refs.length; debut += TAILLE_BATCH) {
      const lot = refs.slice(debut, debut + TAILLE_BATCH);
      const batch = fs.writeBatch(db);
      for (const ref of lot) {
        batch.delete(ref);
      }
      await batch.commit();
      supprimes += lot.length;
    }
    return supprimes;
  }

  async estAdmin(uid: string): Promise<boolean> {
    try {
      const [db, fs] = await this.pair();
      const snap = await fs.getDoc(fs.doc(db, 'admins', uid));
      return snap.exists();
    } catch {
      return false;
    }
  }

  async listerProfils(): Promise<readonly ProfilAdmin[]> {
    const [db, fs] = await this.pair();
    const snap = await fs.getDocs(fs.collection(db, 'users'));
    return snap.docs.map((doc) => ({
      uid: doc.id,
      data: doc.data() as Record<string, unknown>,
    }));
  }

  async lireToutesDispos(): Promise<readonly DispoAdmin[]> {
    const [db, fs] = await this.pair();
    const snap = await fs.getDocs(fs.collectionGroup(db, 'dispos'));
    return snap.docs.map((doc) => ({
      // `users/{uid}/dispos/{creneauId}` → l'uid est le grand-parent.
      uid: doc.ref.parent?.parent?.id ?? '',
      id: doc.id,
      data: doc.data() as Record<string, unknown>,
    }));
  }

  /**
   * Journalise l'erreur brute du SDK (console) et renvoie la cause courte
   * affichable à l'utilisateur. Les erreurs Firestore sont désormais
   * traçables : `permission-denied` = règles non déployées, `unavailable` =
   * réseau, etc.
   */
  private raisonner(e: unknown): string {
    const raison = raisonErreurFirestore(e);
    console.warn('[MesDispos] Erreur Firestore :', raison, e);
    return raison;
  }

  /**
   * Instance Firestore + module SDK, ou échec si la configuration manque.
   * Point d'entrée unique des écritures : un seul endroit à garder cohérent.
   */
  private async pair(): Promise<[Firestore, ModuleFirestore]> {
    if (!this.configure) {
      throw new Error('Firebase non configuré');
    }
    const [db, fs] = await Promise.all([firebaseDb(), chargerFirestore()]);
    return [db, fs];
  }

  /**
   * Abonne une source Firestore dont le SDK est chargé **à la demande** :
   * l'abonnement réel est donc asynchrone, mais la désinscription reste
   * synchrone (le contrat §7 l'exige).
   */
  private suivre(
    abonner: (fs: ModuleFirestore, db: Firestore) => Abonnement,
    erreur: CallbackErreur,
  ): Abonnement {
    if (!this.configure) {
      return AUCUN_ABONNEMENT;
    }
    let annule = false;
    let interne: Abonnement | null = null;
    void Promise.all([firebaseDb(), chargerFirestore()])
      .then(([db, fs]) => {
        if (!annule) {
          interne = abonner(fs, db);
        }
      })
      .catch((e: unknown) => {
        if (!annule) {
          console.warn('[MesDispos] Échec de chargement du SDK Firestore :', e);
          erreur('Impossible de charger le SDK Firestore. Vérifiez votre connexion.');
        }
      });
    return () => {
      annule = true;
      interne?.();
      interne = null;
    };
  }
}
