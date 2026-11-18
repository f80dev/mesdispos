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

import { FIRESTORE_BACKEND, parLots } from '../core/firestore.backend';
import { MESSAGE_CONFIG_MANQUANTE } from '../core/firebase';
import { utilisateurAnonyme } from '../core/auth.service';
import { CreneauService } from './creneau.service';
import { ProfService, type Prof } from './prof.service';
import { champsCreneauDenormalises } from '../shared/date.util';
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
 * Bornes du nombre de disponibilités **fictives** générées par professeur
 * (données de démonstration).
 */
export const NB_DISPO_FICTIVES_MIN = 4;
export const NB_DISPO_FICTIVES_MAX = 5;

/**
 * Tire un nombre entier dans `[min, max]` **inclus** à partir de la source
 * d'aléa fournie.
 *
 * Fonction **pure** (l'aléa est injecté) : testable sans Angular ni réseau.
 */
export function nombreAleatoire(
  min: number,
  max: number,
  alea: Alea = Math.random,
): number {
  const borne = Math.max(0, max - min);
  return min + Math.floor(alea() * (borne + 1));
}

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
      return await this.construirePlan(
        logins,
        tousLesProfs,
        () => nombre,
        alea,
        tousLesProfs ? MESSAGE_AUCUN_PROF_TOUS : MESSAGE_AUCUN_PROF,
      );
    } finally {
      this.enCours.set(false);
    }
  }

  /**
   * Construit le plan d'attribution : résolution des cibles, `uid` de chaque
   * partition, créneaux déjà retenus et créneaux à ajouter.
   *
   * @param logins logins résolus explicitement (vide si `tousLesProfs`).
   * @param tousLesProfs `true` pour prendre la liste complète des professeurs.
   * @param nombrePour fonction donnant le nombre de créneaux à attribuer à
   *   chaque professeur (aléatoire pour les données de démonstration).
   * @param alea source du tirage au hasard des créneaux.
   * @param messageAucun message d'erreur quand aucune cible n'est résolue.
   * @param publierPlan `true` pour publier le plan dans le signal `plan`
   *   (attribution manuelle) ; `false` pour un plan éphémère (données de
   *   démonstration), qui ne doit pas écraser l'attribution en cours.
   */
  private async construirePlan(
    logins: readonly string[],
    tousLesProfs: boolean,
    nombrePour: (prof: Prof) => number,
    alea: Alea,
    messageAucun: string,
    publierPlan = true,
  ): Promise<PlanAttribution | null> {
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
    for (const lot of parLots(connus, TAILLE_LECTURE_PARALLELE)) {
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
        creneaux: choisirCreneaux(
          this.creneaux.creneaux(),
          ids,
          nombrePour(prof),
          alea,
        ),
      });
    }

    if (cibles.length === 0) {
      this.erreur.set(messageAucun);
      return null;
    }

    const plan: PlanAttribution = { cibles, inconnus };
    this.plan.set(plan);
    return plan;
  }

  /**
   * Prépare un plan de **disponibilités fictives** pour l'ensemble des
   * professeurs de la liste (`profs.xlsx` ou API Oasis) : chaque professeur
   * reçoit un nombre **aléatoire** de créneaux compris entre
   * `NB_DISPO_FICTIVES_MIN` et `NB_DISPO_FICTIVES_MAX` (4 ou 5).
   *
   * Les créneaux sont tirés au hasard parmi ceux que le professeur n'a pas
   * encore retenus : les disponibilités déjà déclarées ne sont jamais
   * écrasées par des données de démonstration.
   *
   * @returns le plan, ou `null` (le message d'erreur est dans `erreur`).
   */
  async preparerFictifs(
    min = NB_DISPO_FICTIVES_MIN,
    max = NB_DISPO_FICTIVES_MAX,
    alea: Alea = Math.random,
  ): Promise<PlanAttribution | null> {
    this.erreur.set(null);
    this.ecrits.set(0);
    if (!this.backend.configure) {
      this.erreur.set(MESSAGE_CONFIG_MANQUANTE);
      return null;
    }
    this.enCours.set(true);
    try {
      return await this.construirePlan(
        [],
        true,
        () => nombreAleatoire(min, max, alea),
        alea,
        MESSAGE_AUCUN_PROF_TOUS,
        false,
      );
    } finally {
      this.enCours.set(false);
    }
  }

  /**
   * Écrit le plan calculé : les documents `dispos` (identiques à ceux
   * produits par un clic du professeur) et le document de profil.
   *
   * @param plan plan à écrire (`null` : rien à faire).
   * @param options `fictif: true` marque les documents écrits comme des
   *   **données de démonstration** (champ `fictif`).
   * @returns le nombre de créneaux écrits.
   */
  async appliquer(
    plan: PlanAttribution | null,
    options: { fictif?: boolean } = {},
  ): Promise<number> {
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
          data: this.documentDispo(cible, creneau, options.fictif === true),
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

  /**
   * Prépare **et** écrit les disponibilités fictives (4 ou 5 par
   * professeur) pour l'ensemble de la liste des professeurs.
   *
   * @returns le nombre de disponibilités écrites, ou `0` en cas d'échec
   *   (le message est alors dans `erreur`).
   */
  async genererFictifs(
    min = NB_DISPO_FICTIVES_MIN,
    max = NB_DISPO_FICTIVES_MAX,
    alea: Alea = Math.random,
  ): Promise<number> {
    const plan = await this.preparerFictifs(min, max, alea);
    if (!plan) {
      return 0;
    }
    return this.appliquer(plan, { fictif: true });
  }

  /** Document `dispos` — même forme que celui écrit par `DispoService`. */
  private documentDispo(
    cible: CibleAttribution,
    creneau: Creneau,
    fictif = false,
  ): Record<string, unknown> {
    return {
      ...champsCreneauDenormalises(creneau),
      login: cible.login,
      nom: cible.nom,
      prenom: cible.prenom,
      ...(fictif ? { fictif: true } : {}),
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
