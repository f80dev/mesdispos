/**
 * Abstraction Firestore — injectable via `FIRESTORE_BACKEND`.
 *
 * Le service *réel* (`FirestoreReelBackend`) parle au SDK Firebase modulaire ;
 * un *faux* service (`FirestoreFauxBackend`) est fourni par les tests
 * unitaires (mode jsdom sans réseau).
 *
 * Pourquoi cette abstraction :
 *  - Le module `@angular/build:unit-test` (Vitest) **désactive `vi.mock`
 *    pour les imports relatifs** : il faut donc que le code applicatif
 *    dépende de cette abstraction via l'injection Angular, pas d'un import
 *    direct depuis `core/firebase`.
 *  - En production, l'implémentation réelle utilise `onSnapshot`,
 *    `setDoc`, `deleteDoc`, `writeBatch` du SDK Firebase (chargé en
 *    *import dynamique* pour rester sous le budget initial).
 *  - Le contrat couvre **strictement** les opérations utilisées par
 *    `CreneauService`, `DispoService`, `ExcelImportService` et
 *    `adminGuard`. Toute autre opération ferait croître l'interface —
 *    préférable à un `any` fourre-tout.
 */
import { InjectionToken } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';

export interface SnapshotDoc {
  readonly id: string;
  readonly data: () => Record<string, unknown>;
}

export interface SnapshotCreneaux {
  readonly docs: ReadonlyArray<SnapshotDoc>;
}

export interface SnapshotDispos {
  readonly docs: ReadonlyArray<SnapshotDoc>;
}

export interface FirestoreBackend {
  /** `true` quand la configuration Firebase a été remplacée par l'humain. */
  readonly configure: boolean;

  /** `onSnapshot(collection(db, 'creneaux'))` — alimente `CreneauService`. */
  ecouterCreneaux(
    suivant: (s: SnapshotCreneaux) => void,
    erreur: () => void,
  ): Promise<Unsubscribe>;

  /** `onSnapshot(collection(db, 'users', uid, 'dispos'))`. */
  ecouterDispos(
    uid: string,
    suivant: (s: SnapshotDispos) => void,
    erreur: () => void,
  ): Promise<Unsubscribe>;

  /** `setDoc(users/{uid}/dispos/{id}, …)`. */
  setDispo(uid: string, id: string, data: unknown): Promise<void>;

  /** `deleteDoc(users/{uid}/dispos/{id})`. */
  deleteDispo(uid: string, id: string): Promise<void>;

  /** `getDocs(collection(db, 'creneaux'))` puis `id` — dédoublonnage. */
  listerIdsCreneaux(): Promise<string[]>;

  /** `writeBatch.set(creneaux/{id}, …)` par lots de 500 (F6). */
  upsertCreneaux(items: ReadonlyArray<{ id: string; data: unknown }>): Promise<number>;

  /** `getDoc(admins/{uid}).exists` — pour `adminGuard`. */
  estAdmin(uid: string): Promise<boolean>;
}

export const FIRESTORE_BACKEND = new InjectionToken<FirestoreBackend>('FirestoreBackend');
