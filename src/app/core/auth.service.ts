import { Injectable, computed, signal } from '@angular/core';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type Unsubscribe,
  type User as FirebaseUser,
} from 'firebase/auth';

import { firebaseAuth, firebaseConfigure } from './firebase';
import { domaineAutorise } from '../../environments/firebase.config';

/**
 * Forme **unifiée** de l'identité, alimentée par les deux modes de F2 :
 *  - mode A « Nom seul »   → `{ uid: 'anon_<sha256[:12]>', displayName, anon: true }`
 *  - mode B « Google »     → `{ uid: <uid Firebase>, displayName, anon: false, … }`
 *
 * L'`uid` anonyme n'est jamais rendu à l'utilisateur : il sert uniquement de
 * chemin Firestore (sous-collection `users/anon_…/dispos`) et est donc isolé
 * des utilisateurs Google (AC-18, partition stricte).
 */
export interface Utilisateur {
  readonly uid: string;
  readonly displayName: string;
  readonly anon: boolean;
  readonly email: string | null;
  readonly photoURL: string | null;
}

/** Délai maximal d'attente de la restauration de session avant de laisser passer. */
const DELAI_SESSION_MS = 5000;

/** Vrai sur mobile/tablette → le popup Google est remplacé par un redirect. */
export function estMobile(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent ?? '';
  return (
    /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) ||
    (typeof window !== 'undefined' && window.innerWidth < 820)
  );
}

/** Conversion d'un utilisateur Firebase vers la forme unifiée (mode B). */
export function depuisFirebase(fb: FirebaseUser): Utilisateur {
  return {
    uid: fb.uid,
    displayName:
      fb.displayName ?? (fb.email ? (fb.email.split('@')[0] ?? 'Utilisateur') : 'Utilisateur'),
    anon: false,
    email: fb.email,
    photoURL: fb.photoURL,
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  /** Signal unifié consommé par le header et par les guards (§7). */
  readonly user = signal<Utilisateur | null>(null);

  /** Vrai tant que la restauration de session (mode B) n'a pas répondu. */
  readonly chargement = signal<boolean>(true);

  /** Message d'erreur d'authentification Google, `null` si aucun. */
  readonly erreur = signal<string | null>(null);

  /** Vrai si le compte Google connecté est hors `ALLOWED_EMAIL_DOMAINS`. */
  readonly domaineRefuse = signal<boolean>(false);

  /** Identité connue ? (syntaxe courte pour les templates) */
  readonly connecte = computed(() => this.user() !== null);

  private desabonnerAuth: Unsubscribe | null = null;
  private attente: Promise<Utilisateur | null> | null = null;

  /**
   * Restauration de session mode B (`onAuthStateChanged`).
   * Idempotent : les guards l'appellent, la route `/dispos` aussi.
   */
  demarrer(): void {
    if (this.desabonnerAuth || !firebaseConfigure()) {
      this.chargement.set(false);
      return;
    }
    try {
      this.desabonnerAuth = onAuthStateChanged(
        firebaseAuth(),
        (fb) => {
          this.appliquerEtatFirebase(fb);
          this.chargement.set(false);
        },
        () => {
          this.chargement.set(false);
        },
      );
    } catch {
      this.chargement.set(false);
    }
  }

  private appliquerEtatFirebase(fb: FirebaseUser | null): void {
    this.user.set(fb ? depuisFirebase(fb) : null);
  }

  /**
   * Promesse de session utilisée par les guards : répond `null` si aucun
   * utilisateur n'est restaurable. Ne bloque jamais la navigation plus de
   * {@link DELAI_SESSION_MS}.
   */
  attendreSession(): Promise<Utilisateur | null> {
    const courant = this.user();
    if (courant) {
      return Promise.resolve(courant);
    }
    if (!this.attente) {
      this.attente = this.resoudreSession();
    }
    return this.attente;
  }

  private resoudreSession(): Promise<Utilisateur | null> {
    if (!firebaseConfigure()) {
      this.chargement.set(false);
      return Promise.resolve(null);
    }
    this.demarrer();
    return new Promise<Utilisateur | null>((resolve) => {
      let repondu = false;
      const terminer = (): void => {
        if (!repondu) {
          repondu = true;
          this.chargement.set(false);
          resolve(this.user());
        }
      };
      setTimeout(terminer, DELAI_SESSION_MS);
      // `onAuthStateChanged` déclenche le premier état (éventuellement null).
      const souscription = onAuthStateChanged(firebaseAuth(), terminer);
      setTimeout(() => souscription(), 0);
    });
  }

  /**
   * Mode B — connexion Google : popup sur desktop, redirect sur mobile,
   * repli popup → redirect si le popup est bloqué (F2 mode B, §0).
   */
  async connecterGoogle(): Promise<void> {
    this.erreur.set(null);
    this.domaineRefuse.set(false);
    if (!firebaseConfigure()) {
      this.erreur.set(
        'Configuration Firebase non renseignée : remplacez les valeurs REPLACE_ME_* dans src/environments/firebase.config.ts.',
      );
      return;
    }
    const auth = firebaseAuth();
    const provider = new GoogleAuthProvider();
    try {
      await setPersistence(auth, browserLocalPersistence);
      if (estMobile()) {
        await signInWithRedirect(auth, provider);
        return;
      }
      const credential = await signInWithPopup(auth, provider);
      await this.validerDomaine(credential.user);
    } catch {
      // Popup bloqué / non supporté → redirect (§0 « repli identique à la v0 »).
      try {
        await signInWithRedirect(auth, provider);
      } catch {
        this.erreur.set('Connexion Google impossible. Réessayez dans un autre navigateur.');
      }
    }
  }

  private async validerDomaine(fb: FirebaseUser): Promise<void> {
    if (!domaineAutorise(fb.email)) {
      await firebaseSignOut(firebaseAuth());
      this.domaineRefuse.set(true);
      this.erreur.set('Domaine de messagerie non autorisé pour cette application.');
      return;
    }
    this.appliquerEtatFirebase(fb);
  }

  /** Mode B — déconnexion Firebase (le mode A efface le cookie, cf. §7). */
  async signOut(): Promise<void> {
    try {
      await firebaseSignOut(firebaseAuth());
    } catch {
      // Firebase déjà déconnecté : on ne bloque pas l'UI.
    }
    this.appliquerEtatFirebase(null);
  }

  /** Alias français du contrat §7 (`AuthService.signOut()`). */
  deconnecter(): Promise<void> {
    return this.signOut();
  }
}
