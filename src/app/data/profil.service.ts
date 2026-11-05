import { Injectable, inject, signal } from '@angular/core';

import { FIRESTORE_BACKEND } from '../core/firestore.backend';
import type { ProfilProf } from './models';

/**
 * `ProfilService` — profil du professeur dans la collection `users`.
 *
 * Chaque professeur possède un document `users/{uid}` décrivant son
 * identité :
 *
 * ```
 * users/{uid} = { login, nom, prenom, updatedAt }
 * ```
 *
 * `uid` est l'identifiant de session (`anon_<sha256[:12]>` pour une session
 * « nom seul », l'uid Firebase pour l'administrateur). Les mêmes champs sont
 * **dénormalisés** dans chaque document `users/{uid}/dispos/{creneauId}`,
 * afin que la lecture des disponibilités dans la console Firebase suffise à
 * identifier le professeur sans jointure.
 *
 * L'écriture du profil est **best effort** : un échec n'empêche jamais la
 * déclaration de disponibilités (le message est journalisé, l'interface
 * reste utilisable).
 */

/** Champs d'identité repris de l'API Oasis (`Prof`). */
export interface IdentiteProf {
  login: string;
  nom: string;
  prenom: string;
}

/**
 * Construit un profil depuis l'enseignant choisi dans la liste.
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function profilDepuisProf(identite: IdentiteProf): ProfilProf {
  return {
    login: identite.login.trim(),
    nom: identite.nom.trim(),
    prenom: identite.prenom.trim(),
    updatedAt: Date.now(),
  };
}

/**
 * Construit un profil depuis la saisie libre (« Autre nom ») : le professeur
 * n'a communiqué qu'un prénom, le `login` et le `nom` restent donc vides.
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function profilDepuisSaisieLibre(prenom: string): ProfilProf {
  return { login: '', nom: '', prenom: prenom.trim(), updatedAt: Date.now() };
}

/**
 * Relit un document `users/{uid}` brut.
 * @returns le profil, ou `null` si le document est absent ou illisible.
 */
export function versProfil(data: Record<string, unknown> | null | undefined): ProfilProf | null {
  if (!data) {
    return null;
  }
  const login = typeof data['login'] === 'string' ? data['login'].trim() : '';
  const nom = typeof data['nom'] === 'string' ? data['nom'].trim() : '';
  const prenom = typeof data['prenom'] === 'string' ? data['prenom'].trim() : '';
  if (!login && !nom && !prenom) {
    return null;
  }
  const maj = data['updatedAt'];
  return {
    login,
    nom,
    prenom,
    updatedAt: typeof maj === 'number' && Number.isFinite(maj) ? maj : 0,
  };
}

@Injectable({ providedIn: 'root' })
export class ProfilService {
  private readonly backend = inject(FIRESTORE_BACKEND);

  /** Profil courant du professeur (`null` tant qu'il n'est pas connu). */
  readonly profil = signal<ProfilProf | null>(null);

  /** Message d'erreur de la dernière opération sur le profil. */
  readonly erreur = signal<string | null>(null);

  /**
   * Écrit `users/{uid}` (upsert) avec l'identité du professeur.
   * Les champs absents ne sont pas effacés : `setDoc` sans `merge` réécrit
   * le document, on conserve donc l'état minimal (login / nom / prénom).
   */
  async enregistrer(uid: string, profil: ProfilProf): Promise<boolean> {
    this.erreur.set(null);
    if (!this.backend.configure) {
      return false;
    }
    try {
      await this.backend.setProfil(uid, {
        login: profil.login,
        nom: profil.nom,
        prenom: profil.prenom,
        updatedAt: profil.updatedAt,
      });
      this.profil.set(profil);
      return true;
    } catch (e) {
      console.warn('[MesDispos] Écriture du profil impossible :', e);
      this.erreur.set('Profil du professeur non enregistré.');
      return false;
    }
  }

  /**
   * Relit `users/{uid}` (restauration de session après rechargement).
   * @returns le profil lu, `null` si absent ou illisible.
   */
  async charger(uid: string): Promise<ProfilProf | null> {
    this.erreur.set(null);
    if (!this.backend.configure) {
      return null;
    }
    try {
      const data = await this.backend.lireProfil(uid);
      const profil = versProfil(data);
      if (profil) {
        this.profil.set(profil);
      }
      return profil;
    } catch (e) {
      console.warn('[MesDispos] Lecture du profil impossible :', e);
      this.erreur.set('Profil du professeur illisible.');
      return null;
    }
  }
}
