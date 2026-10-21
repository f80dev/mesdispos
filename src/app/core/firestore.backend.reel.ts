/**
 * `FirestoreReelBackend` — l'implémentation production du `FirestoreBackend`.
 *
 * Toutes les opérations interrogent le SDK Firebase **modulaire** chargé
 * en *import dynamique* par `core/firebase`. Conséquences :
 *   - un utilisateur qui n'ouvre pas `/dispos` ne télécharge pas
 *     `firebase/firestore` (réduit le bundle initial) ;
 *   - sans configuration valide, **toutes les opérations no-opent** en
 *     mettant l'interface dans un état « non configuré » (`configure = false`).
 *     Les services affichent alors le `MESSAGE_CONFIG_MANQUANTE` à l'utilisateur.
 */
import { Injectable } from '@angular/core';

import { chargerFirestore, firebaseConfigure, firebaseDb } from './firebase';
import type {
  FirestoreBackend,
  SnapshotCreneaux,
  SnapshotDispos,
} from './firestore.backend';

@Injectable({ providedIn: 'root' })
export class FirestoreReelBackend implements FirestoreBackend {
  get configure(): boolean {
    return firebaseConfigure();
  }

  async ecouterCreneaux(
    suivant: (s: SnapshotCreneaux) => void,
    erreur: () => void,
  ): Promise<() => void> {
    if (!this.configure) {
      return () => undefined;
    }
    try {
      const [db, fs] = await Promise.all([firebaseDb(), chargerFirestore()]);
      return fs.onSnapshot(
        fs.collection(db, 'creneaux'),
        (instantane) => {
          suivant(instantane as unknown as SnapshotCreneaux);
        },
        () => erreur(),
      );
    } catch {
      erreur();
      return () => undefined;
    }
  }

  async ecouterDispos(
    uid: string,
    suivant: (s: SnapshotDispos) => void,
    erreur: () => void,
  ): Promise<() => void> {
    if (!this.configure) {
      return () => undefined;
    }
    try {
      const [db, fs] = await Promise.all([firebaseDb(), chargerFirestore()]);
      return fs.onSnapshot(
        fs.collection(db, 'users', uid, 'dispos'),
        (instantane) => {
          suivant(instantane as unknown as SnapshotDispos);
        },
        () => erreur(),
      );
    } catch {
      erreur();
      return () => undefined;
    }
  }

  async setDispo(uid: string, id: string, data: unknown): Promise<void> {
    if (!this.configure) {
      throw new Error('Firebase non configuré');
    }
    const [db, fs] = await Promise.all([firebaseDb(), chargerFirestore()]);
    await fs.setDoc(fs.doc(db, 'users', uid, 'dispos', id), data as Record<string, unknown>);
  }

  async deleteDispo(uid: string, id: string): Promise<void> {
    if (!this.configure) {
      throw new Error('Firebase non configuré');
    }
    const [db, fs] = await Promise.all([firebaseDb(), chargerFirestore()]);
    await fs.deleteDoc(fs.doc(db, 'users', uid, 'dispos', id));
  }

  async listerIdsCreneaux(): Promise<string[]> {
    if (!this.configure) {
      return [];
    }
    const [db, fs] = await Promise.all([firebaseDb(), chargerFirestore()]);
    const snap = await fs.getDocs(fs.collection(db, 'creneaux'));
    return snap.docs.map((d: { id: string }) => d.id);
  }

  async upsertCreneaux(
    items: ReadonlyArray<{ id: string; data: unknown }>,
  ): Promise<number> {
    if (!this.configure) {
      throw new Error('Firebase non configuré');
    }
    if (items.length === 0) {
      return 0;
    }
    const [db, fs] = await Promise.all([firebaseDb(), chargerFirestore()]);
    const TAILLE = 500;
    let importes = 0;
    for (let debut = 0; debut < items.length; debut += TAILLE) {
      const lot = items.slice(debut, debut + TAILLE);
      const batch = fs.writeBatch(db);
      for (const { id, data } of lot) {
        batch.set(fs.doc(db, 'creneaux', id), data as Record<string, unknown>);
      }
      await batch.commit();
      importes += lot.length;
    }
    return importes;
  }

  async estAdmin(uid: string): Promise<boolean> {
    if (!this.configure) {
      return false;
    }
    try {
      const [db, fs] = await Promise.all([firebaseDb(), chargerFirestore()]);
      const snap = await fs.getDoc(fs.doc(db, 'admins', uid));
      return snap.exists();
    } catch {
      return false;
    }
  }
}
