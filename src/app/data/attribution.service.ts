/**
 * `AttributionService` — attribution automatique de créneaux à des professeurs
 * (espace administrateur).
 *
 * Le besoin : « saisir une liste de login et un nombre de créneau, puis
 * fabriquer automatiquement une liste de créneau pour chacun de ses
 * professeurs **comme si eux-même l'avait saisie** ».
 *
 * Le choix des créneaux est **aléatoire** : pour chaque professeur, on
 * tire au hasard parmi les créneaux qu'il n'a pas encore retenus (tirage
 * sans remise), afin de répartir les créneaux de façon à ne pas toujours
 * attribuer les mêmes créneaux aux mêmes professeurs.
 *
 * Concrètement, l'attribution écrit exactement les mêmes documents que ceux
 * qu'un professeur crée en cliquant sur un créneau :
 *
 * ```
 * users/{uid}/dispos/{creneauId} = { creneauId, date, heureDebut, heureFin,
 *                                      libelle?, login, nom, prenom, updatedAt }
 * users/{uid}                    = { login, nom, prenom, updatedAt }
 * ```
 *
 * ⚠️ **Comment l'`uid` de la partition est retrouvé** : le partitionnement
 * `anon_<sha256(nom)[:12]>` est dérivé du **nom affiché** du professeur
 * (`core/auth.service.ts` → `utilisateurAnonyme()`). Or le nom affiché d'un
 * professeur choisi dans la liste Oasis est son `nomComplet` (« Judith
 * ABENSOUR ») : l'attribution recalcule donc le même `uid` à partir de la
 * fiche Oasis du `login` saisi. Un professeur qui a utilisé la **saisie
 * libre** (« Autre nom ») a un `uid` dérivé du prénom saisi : il ne peut pas
 * être ciblé par `login` (documenté dans `docs/decisions.md`).
 */
import { Injectable, inject, signal } from '@angular/core';

import { FIRESTORE_BACKEND } from '../core/firestore.backend';
import { MESSAGE_CONFIG_MANQUANTE } from '../core/firebase';
import { utilisateurAnonyme } from '../core/auth.service';
import { CreneauService } from './creneau.service';
import { ProfService, type Prof } from './prof.service';
import type { Creneau } from './models';

/**
 * Nombre de partitions lues **en parallèle** lors de la préparation d'un
 * plan d'attribution (l'attribution à tous les professeurs implique ~400
 * partitions : une lecture séquentielle serait trop lente).
 */
export const TAILLE_LECTURE_PARALLELE = 20;

/**
 * Garde-fou : nombre maximal de créneaux attribuables par professeur.
 * Au-delà, la saisie est refusée (une erreur de frappe ne doit pas créer
 * des centaines de documents).
 */
export const MAX_CREENEAUX_PAR_PROF = 50;

/** Message affiché quand la liste des professeurs Oasis est indisponible. */
export const MESSAGE_PROFS_INDISPONIBLES =
  'Liste des professeurs indisponible : impossible de résoudre les logins.';

/** Message affiché quand aucun login n'a été résolu. */
export const MESSAGE_AUCUN_PROF = 'Aucun login ne correspond à un professeur connu.';

/** Un professeur résolu, avec les créneaux qui lui seront attribués. */
export interface CibleAttribution {
  /** Login Oasis saisi (ex. `judith.abensour`). */
  readonly login: string;
  /** Nom affiché du professeur (« Judith ABENSOUR »). */
  readonly nomComplet: string;
  /** `uid` de la partition Firestore (`anon_<sha256[:12]>`). */
  readonly uid: string;
  /** Nom d'usage (majuscules) et prénom d'usage. */
  readonly nom: string;
  readonly prenom: string;
  /** Nombre de créneaux déjà retenus par le professeur (hors attribution). */
  readonly dejaRetenus: number;
  /** Créneaux qui seront ajoutés à la partition. */
  readonly creneaux: readonly Creneau[];
}

/** Le plan d'attribution complet, calculé avant toute écriture. */
export interface PlanAttribution {
  /** Professeurs résolus, avec leurs créneaux. */
  readonly cibles: readonly CibleAttribution[];
  /** Logins saisis qui ne correspondent à aucun professeur connu. */
  readonly inconnus: readonly string[];
}

/**
 * Découpe une saisie de logins en une liste normalisée.
 *
 * Séparateurs acceptés : espaces, tabulations, newlines, virgules,
 * points-virgules. La casse est ignorée et les doublons sont supprimés
 * (l'ordre de saisie est conservé).
 *
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function parserLogins(saisie: string | null | undefined): string[] {
  const morceaux = (saisie ?? '')
    .split(/[\s,;]+/)
    .map((morceau) => morceau.trim().toLowerCase())
    .filter((morceau) => morceau.length > 0);
  return [...new Set(morceaux)];
}

/**
 * Message affiché quand l'attribution à **tous** les professeurs n'a rien
 * produit (liste Oasis vide).
 */
export const MESSAGE_AUCUN_PROF_TOUS = 'Aucun professeur à attribuer : la liste est vide.';

/**
 * Source d'aléa : une fonction renvoyant un réel dans `[0, 1[`.
 * Injectable pour rendre les tests déterministes.
 */
export type Alea = () => number;

/**
 * Mélange une liste **en place** (Fisher–Yates) et la renvoie.
 *
 * Fonction **pure** du point de vue de l'appelant (la copie interne est
 * faite), mais l'aléa est fourni par l'appelant : testable sans réseau.
 */
export function melanger<T>(elements: readonly T[], alea: Alea = Math.random): T[] {
  const copie = [...elements];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    const echange = copie[i] as T;
    copie[i] = copie[j] as T;
    copie[j] = echange;
  }
  return copie;
}

/**
 * Tirage **au hasard** de `nombre` créneaux parmi ceux qui ne sont pas
 * encore retenus par le professeur.
 *
 * Le tirage est **sans remise** (un créneau au plus une fois par
 * professeur) et l'ordre du résultat est celui du tirage : la répartition
 * des créneaux entre les professeurs est donc aléatoire, et non
 * chronologique.
 *
 * Fonction **pure** (l'aléa est injecté) : testable sans Angular ni réseau.
 */
export function choisirCreneaux(
  creneaux: readonly Creneau[],
  dejaRetenus: readonly string[],
  nombre: number,
  alea: Alea = Math.random,
): Creneau[] {
  const retenus = new Set(dejaRetenus);
  const disponibles = creneaux.filter((creneau) => !retenus.has(creneau.id));
  return melanger(disponibles, alea).slice(0, Math.max(0, nombre));
}

@Injectable({ providedIn: 'root' })
export class AttributionService {
  private readonly backend = inject(FIRESTORE_BACKEND);
  private readonly profs = inject(ProfService);
  private readonly creneaux = inject(CreneauService);

  /** Dernier plan calculé (affiché avant écriture). */
  readonly plan = signal<PlanAttribution | null>(null);

  /** Vrai pendant le calcul du plan ou l'écriture. */
  readonly enCours = signal<boolean>(false);

  /** Message d'erreur, `null` si tout va bien. */
  readonly erreur = signal<string | null>(null);

  /** Nombre de créneaux écrits lors de la dernière attribution. */
  readonly ecrits = signal<number>(0);

  /**
   * Calcule le plan d'attribution **sans rien écrire** : résolution des
   * logins, `uid` de chaque partition, créneaux déjà retenus et créneaux à
   * ajouter.
   *
   * @param saisie logins Oasis séparés par des espaces/virgules (ignorés
   *   quand `tousLesProfs` est vrai).
   * @param nombre nombre de créneaux à attribuer **à chaque** professeur.
   * @param tousLesProfs `true` pour attribuer à **l'ensemble** des
   *   professeurs de la liste Oasis, sans saisie de login.
   * @param alea source du tirage au hasard des créneaux (injectée par les
   *   tests).
   */
  async preparer(
    saisie: string,
    nombre: number,
    tousLesProfs = false,
    alea: Alea = Math.random,
  ): Promise<PlanAttribution | null> {
    this.erreur.set(null);
    this.ecrits.set(0);
    if (!this.backend.configure) {
      this.erreur.set(MESSAGE_CONFIG_MANQUANTE);
      return null;
    }
    if (nombre < 1 || nombre > MAX_CREENEAUX_PAR_PROF) {
      this.erreur.set(
        `Le nombre de créneaux par professeur doit être compris entre 1 et ${MAX_CREENEAUX_PAR_PROF}.`,
      );
      return null;
    }
    const logins = tousLesProfs ? [] : parserLogins(saisie);
    if (!tousLesProfs && logins.length === 0) {
      this.erreur.set('Saisissez au moins un login.');
      return null;
    }

    this.enCours.set(true);
    try {
      await this.profs.charger();
      if (this.profs.profs().length === 0) {
        this.erreur.set(this.profs.erreur() ?? MESSAGE_PROFS_INDISPONIBLES);
        return null;
      }

      const cibles: CibleAttribution[] = [];
      const inconnus: string[] = [];

      // Attribution à l'ensemble des professeurs : la liste Oasis fait foi.
      const resolves = tousLesProfs
        ? this.profs.profs().map((prof) => ({ prof, login: prof.login.toLowerCase() }))
        : logins.map((login) => ({
            login,
            prof: this.profs.profs().find((p) => p.login.toLowerCase() === login),
          }));

      const connus = resolves.filter((r): r is { login: string; prof: Prof } => !!r.prof);
      for (const { login, prof } of resolves) {
        if (!prof) {
          inconnus.push(login);
        }
      }

      // Lectures des créneaux déjà retenus : par lots de 20 en parallèle
      // (l'attribution à tous les professeurs implique ~400 partitions).
      const retenus = new Map<string, string[]>();
      for (let debut = 0; debut < connus.length; debut += TAILLE_LECTURE_PARALLELE) {
        const lot = connus.slice(debut, debut + TAILLE_LECTURE_PARALLELE);
        const resultats = await Promise.all(
          lot.map(async ({ prof }) => {
            // Même calcul d'`uid` que la connexion « liste Oasis » : le nom
            // affiché du professeur est son `nomComplet`.
            const uid = utilisateurAnonyme(prof.nomComplet).uid;
            return { uid, ids: await this.retenusDuProf(uid) };
          }),
        );
        resultats.forEach((resultat, index) => {
          const prof = lot[index]?.prof;
          if (prof) {
            retenus.set(prof.login.toLowerCase(), resultat.ids);
          }
        });
      }

      for (const { login, prof } of connus) {
        // Même calcul d'`uid` que la connexion « liste Oasis » : le nom
        // affiché du professeur est son `nomComplet`.
        const uid = utilisateurAnonyme(prof.nomComplet).uid;
        const ids = retenus.get(login) ?? [];
        cibles.push({
          login: prof.login,
          nomComplet: prof.nomComplet,
          uid,
          nom: prof.nom,
          prenom: prof.prenom,
          dejaRetenus: ids.length,
          creneaux: choisirCreneaux(this.creneaux.creneaux(), ids, nombre, alea),
        });
      }

      if (cibles.length === 0) {
        this.erreur.set(tousLesProfs ? MESSAGE_AUCUN_PROF_TOUS : MESSAGE_AUCUN_PROF);
        return null;
      }

      const plan: PlanAttribution = { cibles, inconnus };
      this.plan.set(plan);
      return plan;
    } finally {
      this.enCours.set(false);
    }
  }

  /**
   * Écrit le plan calculé : les documents `dispos` (identiques à ceux
   * produits par un clic du professeur) et le document de profil.
   *
   * @returns le nombre de créneaux écrits.
   */
  async appliquer(plan: PlanAttribution | null): Promise<number> {
    if (!plan || plan.cibles.length === 0) {
      return 0;
    }
    if (!this.backend.configure) {
      throw new Error(MESSAGE_CONFIG_MANQUANTE);
    }
    this.enCours.set(true);
    try {
      const items = plan.cibles.flatMap((cible) =>
        cible.creneaux.map((creneau) => ({
          uid: cible.uid,
          id: creneau.id,
          data: this.documentDispo(cible, creneau),
        })),
      );
      const ecrits = await this.backend.upsertDispos(items);
      // Le profil : sans lui, la partition serait orpheline dans la console.
      for (const cible of plan.cibles) {
        await this.backend.setProfil(cible.uid, {
          login: cible.login,
          nom: cible.nom,
          prenom: cible.prenom,
          updatedAt: Date.now(),
        });
      }
      this.ecrits.set(ecrits);
      return ecrits;
    } finally {
      this.enCours.set(false);
    }
  }

  /** Document `dispos` — même forme que celui écrit par `DispoService`. */
  private documentDispo(cible: CibleAttribution, creneau: Creneau): Record<string, unknown> {
    return {
      creneauId: creneau.id,
      date: creneau.date,
      heureDebut: creneau.heureDebut,
      heureFin: creneau.heureFin,
      ...(creneau.libelle ? { libelle: creneau.libelle } : {}),
      login: cible.login,
      nom: cible.nom,
      prenom: cible.prenom,
      updatedAt: Date.now(),
    };
  }

  /**
   * Créneaux déjà retenus par un professeur. Une lecture impossible (base
   * indisponible, droits insuffisants) ne bloque pas l'attribution :
   * l'écriture est idempotente (`setDoc`), un créneau déjà retenu est
   * simplement réécrit à l'identique.
   */
  private async retenusDuProf(uid: string): Promise<string[]> {
    try {
      return await this.backend.lireIdsDispos(uid);
    } catch {
      return [];
    }
  }
}
