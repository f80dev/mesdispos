/**
 * `DispoProfService` — lecture **globale** des disponibilités déclarées par
 * les professeurs (espace administrateur).
 *
 * Le besoin : « cocher des professeurs dans une liste, puis voir dans un
 * calendrier toutes leurs disponibilités ». Il faut donc gathering :
 *
 *  - l'inventaire des partitions `users/{uid}` (login, nom, prénom) ;
 *  - toutes les disponibilités, tous professeurs confondus
 *    (`collectionGroup('dispos')`).
 *
 * Ces deux lectures passent par `FIRESTORE_BACKEND` (abstraction injectable,
 * cf. `core/firestore.backend.ts`) : aucune écriture ici, et les règles
 * Firestore réservent la lecture en *collection group* à `admins/{uid}`.
 */
import { Injectable, computed, inject, signal } from '@angular/core';

import { FIRESTORE_BACKEND, type DispoAdmin, type ProfilAdmin } from '../core/firestore.backend';
import { MESSAGE_CONFIG_MANQUANTE } from '../core/firebase';
import { filtrerParRecherche } from './prof.service';
import { trierCreneaux } from '../shared/date.util';
import { versDispo } from './dispo.service';
import type { Dispo } from './models';

/** Message affiché quand la lecture des disponibilités échoue. */
export const MESSAGE_LECTURE_DISPOS_PROFS = 'Impossible de lire les disponibilités. Réessayez.';

/**
 * Un professeur et l'ensemble de ses disponibilités déclarées.
 *
 * Les noms proviennent du document `users/{uid}` ; à défaut (professeur ayant
 * utilisé la saisie libre « Autre nom », ou profil non écrit), on retombe sur
 * les champs dénormalisés `login`/`nom`/`prenom` portés par les documents
 * `dispos`.
 */
export interface ProfDispo {
  /** `uid` de la partition Firestore (`users/{uid}`). */
  readonly uid: string;
  /** Login Oasis (« vide » en saisie libre). */
  readonly login: string;
  /** Nom d'usage. */
  readonly nom: string;
  /** Prénom d'usage. */
  readonly prenom: string;
  /** Nom affiché (« Judith ABENSOUR »). */
  readonly nomComplet: string;
  /** Disponibilités déclarées, triées date puis heure. */
  readonly dispos: readonly Dispo[];
}

/** Champ texte brut, nettoyé (`''` si absent ou non textuel). */
function texte(brut: unknown): string {
  return typeof brut === 'string' ? brut.trim() : '';
}

/**
 * Regroupe les disponibilités par professeur.
 *
 * Fonction **pure** : testable sans Angular ni réseau.
 *
 * @param profils inventaire `users/{uid}` (peut être vide).
 * @param dispos toutes les disponibilités (tous professeurs confondus).
 */
export function regrouperDisposParProf(
  profils: readonly ProfilAdmin[],
  dispos: readonly DispoAdmin[],
): ProfDispo[] {
  const parUid = new Map<string, Dispo[]>();
  for (const entree of dispos) {
    const dispo = versDispo(entree.id, entree.data);
    if (!dispo) {
      continue;
    }
    const liste = parUid.get(entree.uid);
    if (liste) {
      liste.push(dispo);
    } else {
      parUid.set(entree.uid, [dispo]);
    }
  }

  const infos = new Map(profils.map((profil) => [profil.uid, profil.data]));
  const resultat: ProfDispo[] = [];

  for (const [uid, liste] of parUid) {
    const data = infos.get(uid) ?? {};
    const premier = liste[0];
    const login = texte(data['login']) || texte(premier?.login);
    const nom = texte(data['nom']) || texte(premier?.nom);
    const prenom = texte(data['prenom']) || texte(premier?.prenom);
    const nomComplet = [prenom, nom].filter(Boolean).join(' ') || login || 'Professeur';
    resultat.push({
      uid,
      login,
      nom,
      prenom,
      nomComplet,
      dispos: trierCreneaux(liste),
    });
  }

  return resultat.sort((a, b) =>
    a.nomComplet.localeCompare(b.nomComplet, 'fr', { sensitivity: 'base' }),
  );
}

/**
 * Filtre une liste de professeurs sur un texte libre (nom, prénom, login).
 *
 * Fonction **pure** : testable sans Angular.
 */
export function filtrerProfsDispo(
  profs: readonly ProfDispo[],
  recherche: string | null | undefined,
): ProfDispo[] {
  return filtrerParRecherche(
    profs,
    recherche,
    (prof) => `${prof.prenom} ${prof.nom} ${prof.login} ${prof.nomComplet}`,
  );
}

@Injectable({ providedIn: 'root' })
export class DispoProfService {
  private readonly backend = inject(FIRESTORE_BACKEND);

  /** Professeurs ayant déclaré au moins une disponibilité. */
  readonly profs = signal<ProfDispo[]>([]);

  /** Vrai pendant la lecture. */
  readonly chargement = signal<boolean>(false);

  /** Message d'erreur, `null` si tout va bien. */
  readonly erreur = signal<string | null>(null);

  /** Nombre total de disponibilités déclarées (tous professeurs). */
  readonly nombreDispos = computed(() =>
    this.profs().reduce((total, prof) => total + prof.dispos.length, 0),
  );

  /** Lecture des profils et de toutes les disponibilités. */
  async charger(): Promise<void> {
    this.erreur.set(null);
    if (!this.backend.configure) {
      this.erreur.set(MESSAGE_CONFIG_MANQUANTE);
      return;
    }
    this.chargement.set(true);
    try {
      const [profils, dispos] = await Promise.all([
        this.backend.listerProfils(),
        this.backend.lireToutesDispos(),
      ]);
      this.profs.set(regrouperDisposParProf(profils, dispos));
    } catch (erreur) {
      console.warn('[MesDispos] Lecture des disponibilités impossible :', erreur);
      this.profs.set([]);
      this.erreur.set(MESSAGE_LECTURE_DISPOS_PROFS);
    } finally {
      this.chargement.set(false);
    }
  }

  /** Bouton « Réessayer ». */
  recharger(): void {
    void this.charger();
  }
}
