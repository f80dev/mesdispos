import { Injectable, computed, inject, signal } from '@angular/core';
import type { Unsubscribe, User as FirebaseUser } from 'firebase/auth';

import { MESSAGE_CONFIG_MANQUANTE, chargerAuth, firebaseAuth, firebaseConfigure } from './firebase';
import { CookieService } from './cookie.service';
import { normaliserNom } from '../shared/date.util';
import { sha256Hex } from '../shared/sha256.util';
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

/**
 * Identité anonyme déterministe du mode A (§5) : `uid = 'anon_' +
 * sha256(nom normalisé).slice(0, 12)`. L'`uid` n'est jamais rendu à
 * l'utilisateur ; le prénom normalisé reste la valeur d'affichage.
 */
export function utilisateurAnonyme(nom: string): Utilisateur {
  const affichable = normaliserNom(nom);
  return {
    uid: `anon_${sha256Hex(affichable).slice(0, 12)}`,
    displayName: affichable,
    anon: true,
    email: null,
    photoURL: null,
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
  private premiereReponseFirebase = false;
  private resolversSession: Array<(u: Utilisateur | null) => void> = [];
  private readonly cookie = inject(CookieService);

  /**
   * Restauration de session au démarrage (F2 « Header & session ») :
   * le cookie anonyme (mode A) d'abord, sinon Firebase (mode B).
   */
  constructor() {
    const nom = this.cookie.lireNom();
    if (nom) {
      this.user.set(utilisateurAnonyme(nom));
      this.chargement.set(false);
    } else {
      void this.demarrer();
    }
  }

  /**
   * `uid` déterministe du mode A : `anon_` + 12 premiers caractères du SHA-256
   * du nom normalisé (§5). Jamais affiché : c'est uniquement le chemin Firestore
   * `users/{uid}/dispos`, distinct des partitions Google (AC-18).
   */
  uidAnonyme(nom: string): string {
    return utilisateurAnonyme(nom).uid;
  }

  /**
   * Mode A — connexion par prénom seul (F2). Délègue la validation et la pose
   * du cookie à `CookieService`, puis publie l'identité anonyme.
   * Aucun appel Firebase, aucune requête réseau.
   */
  async connecterParNom(nom: string): Promise<boolean> {
    this.erreur.set(null);
    this.domaineRefuse.set(false);
    const resultat = this.cookie.setNom(nom);
    if (!resultat.ok) {
      this.erreur.set(resultat.erreur);
      return false;
    }
    this.user.set(utilisateurAnonyme(resultat.valeur));
    return true;
  }

  /** Mode A — « Utiliser un autre nom » : efface le cookie et l'identité. */
  oublierNom(): void {
    this.cookie.effacer();
    this.user.set(null);
  }

  /**
   * Restauration de session mode B (`onAuthStateChanged`).
   * Idempotent : guards, header et page `/dispos` peuvent tous l'appeler.
   * Charge `firebase/auth` à la demande (import dynamique).
   */
  async demarrer(): Promise<void> {
    if (this.desabonnerAuth) {
      return;
    }
    if (!firebaseConfigure()) {
      this.premiereReponseFirebase = true;
      this.chargement.set(false);
      this.notifierResolvers();
      return;
    }
    try {
      const [{ onAuthStateChanged }, auth] = await Promise.all([chargerAuth(), firebaseAuth()]);
      if (this.desabonnerAuth) {
        return; // une autre branche a déjà pris le relais
      }
      this.desabonnerAuth = onAuthStateChanged(
        auth,
        (fb) => {
          this.appliquerEtatFirebase(fb);
          this.premiereReponseFirebase = true;
          this.chargement.set(false);
          this.notifierResolvers();
        },
        () => {
          this.chargement.set(false);
        },
      );
    } catch {
      this.premiereReponseFirebase = true;
      this.chargement.set(false);
      this.notifierResolvers();
    }
  }

  private notifierResolvers(): void {
    const enAttente = this.resolversSession;
    this.resolversSession = [];
    for (const resoudre of enAttente) {
      resoudre(this.user());
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
      this.attente = new Promise<Utilisateur | null>((resolve) => {
        if (this.premiereReponseFirebase) {
          resolve(this.user());
          return;
        }
        this.resolversSession.push(resolve);
        // Filet de sécurité : si Firebase ne répond jamais, on ne bloque pas la route.
        setTimeout(() => resolve(this.user()), DELAI_SESSION_MS);
        void this.demarrer();
      });
    }
    return this.attente;
  }

  /**
   * Mode B — connexion Google : popup sur desktop, redirect sur mobile,
   * repli popup → redirect si le popup est bloqué (F2 mode B, §0).
   */
  async connecterGoogle(): Promise<void> {
    this.erreur.set(null);
    this.domaineRefuse.set(false);
    if (!firebaseConfigure()) {
      this.erreur.set(MESSAGE_CONFIG_MANQUANTE);
      return;
    }
    const [
      auth,
      {
        GoogleAuthProvider,
        browserLocalPersistence,
        setPersistence,
        signInWithPopup,
        signInWithRedirect,
      },
    ] = await Promise.all([firebaseAuth(), chargerAuth()]);
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
      const [auth, { signOut }] = await Promise.all([firebaseAuth(), chargerAuth()]);
      await signOut(auth);
      this.domaineRefuse.set(true);
      this.erreur.set('Domaine de messagerie non autorisé pour cette application.');
      return;
    }
    this.appliquerEtatFirebase(fb);
  }

  /**
   * Déconnexion (§7) : le mode A efface le cookie `mesdispos_nom`, le mode B
   * appelle `signOut` Firebase. Dans les deux cas `user` repasse à `null`.
   */
  async signOut(): Promise<void> {
    if (this.user()?.anon) {
      this.cookie.effacer();
    } else {
      try {
        const [auth, { signOut }] = await Promise.all([firebaseAuth(), chargerAuth()]);
        await signOut(auth);
      } catch {
        // Firebase déjà déconnecté ou indisponible : on ne bloque pas l'UI.
      }
    }
    this.appliquerEtatFirebase(null);
  }

  /** Alias français du contrat §7 (`AuthService.signOut()`). */
  deconnecter(): Promise<void> {
    return this.signOut();
  }
}
