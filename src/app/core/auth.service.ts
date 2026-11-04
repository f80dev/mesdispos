import { Injectable, inject, signal } from '@angular/core';
import type { Unsubscribe, User as FirebaseUser } from 'firebase/auth';

import { MESSAGE_CONFIG_MANQUANTE, chargerAuth, firebaseAuth } from './firebase';
import { CookieService } from './cookie.service';
import { normaliserNom } from '../shared/date.util';
import { sha256Hex } from '../shared/sha256.util';
import { firebaseConfigure } from '../../environments/firebase.config';
import { ProfilService, type IdentiteProf } from '../data/profil.service';

/**
 * Forme **unifiée** de l'identité. Deux sessions coexistent :
 *  - session « nom seul »  → `{ uid: 'anon_<sha256[:12]>', displayName, session: 'nom' }`
 *    (cookie `mesdispos_nom`, aucune session Firebase) ;
 *  - session « Firebase »  → `{ uid: <uid Google>, displayName, session: 'firebase' }`
 *    (connexion **Google** réservée à l'espace administrateur).
 *
 * L'`uid` anonyme n'est jamais rendu à l'utilisateur : il sert uniquement de
 * chemin Firestore (sous-collection `users/anon_…/dispos`) et reste donc isolé
 * des partitions Firebase (les écritures de l'admin).
 */
export interface Utilisateur {
  readonly uid: string;
  readonly displayName: string;
  /** Nature de la session : cookie seul (« nom ») ou session Firebase. */
  readonly session: 'nom' | 'firebase';
  /**
   * Identité du professeur, quand elle est connue : `login` (identifiant
   * LDAP Oasis), `nom` et `prénom` d'usage. Ces champs sont persistés dans
   * le document Firestore `users/{uid}`.
   */
  readonly login?: string;
  readonly nom?: string;
  readonly prenom?: string;
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

/**
 * Identité « nom seul » (§5) : `uid = 'anon_' + sha256(nom normalisé).slice(0, 12)`.
 * L'`uid` n'est jamais rendu à l'utilisateur ; le prénom normalisé reste la
 * valeur d'affichage.
 *
 * `identite` (login / nom / prénom) est optionnelle : la saisie libre ne
 * fournit qu'un prénom.
 */
export function utilisateurAnonyme(nom: string, identite?: Partial<IdentiteProf>): Utilisateur {
  const affichable = normaliserNom(nom);
  return {
    uid: `anon_${sha256Hex(affichable).slice(0, 12)}`,
    displayName: affichable,
    session: 'nom',
    ...(identite?.login ? { login: identite.login } : {}),
    ...(identite?.nom ? { nom: identite.nom } : {}),
    ...(identite?.prenom ? { prenom: identite.prenom } : {}),
  };
}

/** Conversion d'un utilisateur Google vers la forme unifiée (espace admin). */
export function utilisateurGoogle(fb: FirebaseUser): Utilisateur {
  const repli = fb.email ? (fb.email.split('@')[0] ?? 'Administrateur') : 'Administrateur';
  return {
    uid: fb.uid,
    displayName: fb.displayName?.trim() || repli,
    session: 'firebase',
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  /**
   * Signal unifié consommé par le header et par les guards (§7) : l'identité
   * « nom seul » (cookie) si elle existe, sinon la session Firebase.
   */
  readonly user = signal<Utilisateur | null>(null);

  /**
   * Session Firebase obtenue par connexion **Google** (candidat
   * administrateur), quelle que soit la session « nom seul » éventuellement
   * ouverte : elle conditionne l'accès à `/admin/import` via `admins/{uid}`.
   */
  readonly sessionAdmin = signal<Utilisateur | null>(null);

  /** Vrai tant que la restauration de session n'a pas répondu. */
  readonly chargement = signal<boolean>(true);

  /** Message d'erreur d'authentification, `null` si aucun. */
  readonly erreur = signal<string | null>(null);

  private desabonnerAuth: Unsubscribe | null = null;
  private attente: Promise<Utilisateur | null> | null = null;
  private premiereReponseFirebase = false;
  private resolveurSession: ((u: Utilisateur | null) => void) | null = null;
  private readonly cookie = inject(CookieService);
  private readonly profils = inject(ProfilService);

  /**
   * Restauration de session au démarrage : le cookie « nom seul » d'abord,
   * puis la session Firebase (Google) de l'espace administrateur.
   */
  constructor() {
    const nom = this.cookie.lireNom();
    if (nom) {
      const utilisateur = utilisateurAnonyme(nom);
      this.user.set(utilisateur);
      this.chargement.set(false);
      // Le cookie ne porte que le nom : le `login`, le `nom` et le `prénom`
      // sont relus depuis `users/{uid}` (document de profil).
      void this.restaurerProfil(utilisateur.uid);
    }
    void this.demarrer();
  }

  /**
   * Restaure l'identité complète du professeur depuis `users/{uid}` et
   * complète l'utilisateur courant. Silencieux en cas d'échec : le parcours
   * reste utilisable avec le seul nom du cookie.
   */
  private async restaurerProfil(uid: string): Promise<void> {
    const profil = await this.profils.charger(uid);
    if (!profil) {
      return;
    }
    const courant = this.user();
    if (!courant || courant.uid !== uid) {
      return;
    }
    this.user.set({
      ...courant,
      ...(profil.login ? { login: profil.login } : {}),
      ...(profil.nom ? { nom: profil.nom } : {}),
      ...(profil.prenom ? { prenom: profil.prenom } : {}),
    });
  }

  /**
   * Session « nom seul » : délègue la validation et la pose du cookie à
   * `CookieService`, puis publie l'identité anonyme.
   * Aucun appel Firebase Auth, aucune requête réseau.
   *
   * `identite` (login / nom / prénom) est optionnelle ; lorsqu'elle est
   * fournie, elle est **persistée** dans le document Firestore `users/{uid}`.
   */
  async connecterParNom(nom: string, identite?: Partial<IdentiteProf>): Promise<boolean> {
    this.erreur.set(null);
    const resultat = this.cookie.setNom(nom);
    if (!resultat.ok) {
      this.erreur.set(resultat.erreur);
      return false;
    }
    const utilisateur = utilisateurAnonyme(resultat.valeur, identite);
    this.user.set(utilisateur);
    if (identite) {
      // Best effort : l'échec d'écriture du profil ne bloque pas la session.
      void this.profils.enregistrer(utilisateur.uid, {
        login: identite.login ?? '',
        nom: identite.nom ?? '',
        prenom: identite.prenom ?? '',
        updatedAt: Date.now(),
      });
    }
    return true;
  }

  /** « Utiliser un autre nom » : efface le cookie et l'identité. */
  oublierNom(): void {
    this.cookie.effacer();
    this.user.set(null);
  }

  /**
   * Connexion **Google** — réservée à l'espace administrateur.
   *
   * L'uid obtenu doit être inscrit une fois dans la collection `admins`
   * (console Firebase) pour ouvrir `/admin/import` (`adminGuard`).
   * Popup sur desktop, redirect sur mobile ; le redirect est rattrapé au
   * démarrage par `onAuthStateChanged` (retour sur `/login`).
   */
  async connecterGoogle(): Promise<boolean> {
    this.erreur.set(null);
    if (!firebaseConfigure()) {
      this.erreur.set(MESSAGE_CONFIG_MANQUANTE);
      return false;
    }
    try {
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
      await setPersistence(auth, browserLocalPersistence);
      if (estMobile()) {
        await signInWithRedirect(auth, provider);
        return true;
      }
      const credential = await signInWithPopup(auth, provider);
      this.appliquerAdmin(credential.user);
      return true;
    } catch {
      // Popup bloqué / non supporté → redirect.
      try {
        const [auth, { GoogleAuthProvider, signInWithRedirect }] = await Promise.all([
          firebaseAuth(),
          chargerAuth(),
        ]);
        await signInWithRedirect(auth, new GoogleAuthProvider());
        return true;
      } catch {
        this.erreur.set('Connexion Google impossible. Réessayez dans un autre navigateur.');
        return false;
      }
    }
  }

  /**
   * Restauration de session Firebase (`onAuthStateChanged`).
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

  private appliquerAdmin(fb: FirebaseUser): void {
    const admin = utilisateurGoogle(fb);
    this.sessionAdmin.set(admin);
    // Le cookie « nom seul » prime pour l'affichage : la session Google
    // reste ouverte mais ne remplace pas l'identité du professeur.
    if (!this.cookie.lireNom()) {
      this.user.set(admin);
    }
  }

  private appliquerEtatFirebase(fb: FirebaseUser | null): void {
    if (fb) {
      this.appliquerAdmin(fb);
    } else {
      this.sessionAdmin.set(null);
      if (!this.cookie.lireNom()) {
        this.user.set(null);
      }
    }
    this.premiereReponseFirebase = true;
    this.chargement.set(false);
    this.notifierResolvers();
  }

  private notifierResolvers(): void {
    const resoudre = this.resolveurSession;
    this.resolveurSession = null;
    resoudre?.(this.user());
  }

  /**
   * `uid` sous lequel les disponibilités sont écrites.
   *
   * - session « nom seul » → `anon_<sha256[:12]>` (règle : `request.auth == null`) ;
   * - session Firebase (administrateur) → l'uid Firebase, qui correspond à
   *   `request.auth.uid` (règle : `request.auth.uid == uid`).
   */
  uidEcriture(): string | null {
    const courant = this.user();
    if (courant?.session === 'nom') {
      return courant.uid;
    }
    return this.sessionAdmin()?.uid ?? courant?.uid ?? null;
  }

  /**
   * Identité du professeur correspondant à la partition d'écriture
   * (`uidEcriture`) : sert à dénormaliser `login`, `nom` et `prénom` dans
   * chaque document `users/{uid}/dispos/{creneauId}`.
   */
  identiteEcriture(): { login?: string; nom?: string; prenom?: string } {
    const uid = this.uidEcriture();
    if (!uid) {
      return {};
    }
    const courant = this.user();
    if (courant?.uid === uid) {
      return {
        ...(courant.login ? { login: courant.login } : {}),
        ...(courant.nom ? { nom: courant.nom } : {}),
        ...(courant.prenom ? { prenom: courant.prenom } : {}),
      };
    }
    const admin = this.sessionAdmin();
    if (admin?.uid === uid) {
      return {
        ...(admin.login ? { login: admin.login } : {}),
        ...(admin.nom ? { nom: admin.nom } : {}),
        ...(admin.prenom ? { prenom: admin.prenom } : {}),
      };
    }
    return {};
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
        this.resolveurSession = resolve;
        // Filet de sécurité : si Firebase ne répond jamais, on ne bloque pas la route.
        setTimeout(() => {
          this.resolveurSession = null;
          resolve(this.user());
        }, DELAI_SESSION_MS);
        void this.demarrer();
      });
    }
    return this.attente;
  }

  /**
   * Déconnexion : efface le cookie « nom seul » et ferme la session Firebase
   * (Google) si elle existe. Dans les deux cas `user` repasse à `null`.
   */
  async signOut(): Promise<void> {
    this.cookie.effacer();
    if (this.sessionAdmin()) {
      try {
        const [auth, { signOut }] = await Promise.all([firebaseAuth(), chargerAuth()]);
        await signOut(auth);
      } catch {
        // Firebase déjà déconnecté ou indisponible : on ne bloque pas l'UI.
      }
    }
    this.sessionAdmin.set(null);
    this.user.set(null);
  }
}
