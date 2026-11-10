import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { CoursServices, type ProfOasis, type SujetOasis } from '../core/cours.services';
import { XLSX_BACKEND } from '../core/xlsx.backend';

/** Fichier de repli servi par l'hébergement (`public/profs.xlsx`). */
export const URL_PROFS = '/profs.xlsx';

/** Feuille du classeur `profs.xlsx` qui contient la liste des enseignants. */
export const FEUILLE_ENSEIGNANTS = 'Enseignants';

/**
 * Un professeur de l'ENSAD, vu par l'application (mode A de la connexion).
 *
 * `login` est l'identifiant stable côté API Oasis (LDAP) : il sert de clé de
 * dédoublonnage et de valeur du sélecteur de la page de connexion.
 */
export interface Prof {
  /** Identifiant LDAP Oasis, ex. `judith.abensour`. */
  readonly login: string;
  /** Numéro d'identification de la personne (NIP). */
  readonly nip?: string;
  /** Prénom d'usage, ex. `Judith`. */
  readonly prenom: string;
  /** Nom d'usage, ex. `ABENSOUR`. */
  readonly nom: string;
  /** Nom affichable complet, ex. `Judith ABENSOUR`. */
  readonly nomComplet: string;
  /** Civilité (`F`, `M`, …). */
  readonly civilite?: string;
  /** Messagerie professionnelle. */
  readonly mailPro?: string;
  /** Secteur d'enseignement rattaché. */
  readonly secteur?: string;
  /** Libellé du service / direction d'études (facultatif). */
  readonly service?: string;
  /** Statut dans l'établissement (`C`, `T`, `V`, …). */
  readonly statutEtab?: string;
  /** Matières / domaines enseignés (ex. `['DESSIN']`). */
  readonly subjects: readonly string[];
}

/**
 * Extrait les libellés de matière d'un champ `subjects` hétérogène.
 *
 * L'API renvoie tantôt une chaîne (`'Art'`), tantôt un objet
 * (`{ code: 'DESSIN', year: '2026', description: '…' }`). On ne garde que
 * le `code` (ou la chaîne brute), sans quoi le tri et l'affichage cassent.
 */
export function libellesSubjects(subjects: readonly SujetOasis[] | null | undefined): string[] {
  if (!Array.isArray(subjects)) {
    return [];
  }
  const libelles: string[] = [];
  for (const sujet of subjects) {
    if (typeof sujet === 'string') {
      const texte = sujet.trim();
      if (texte) {
        libelles.push(texte);
      }
      continue;
    }
    const code = sujet?.code?.trim();
    if (code) {
      libelles.push(code);
    }
  }
  return libelles;
}

/**
 * Normalise la réponse brute de `/api/v1/profs`.
 *
 * L'API renvoie des doublons (un même enseignant apparaît plusieurs fois) et
 * des sortants (`present` = `'INA'`). On ne garde que les enseignants
 * présents, on dédoublonne par `login`, puis on trie par nom puis prénom.
 *
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function normaliserProfs(elements: readonly ProfOasis[] | null | undefined): Prof[] {
  if (!elements) {
    return [];
  }
  const parLogin = new Map<string, Prof>();
  for (const element of elements) {
    // Une entrée malformée ne doit pas faire échouer toute la liste.
    let prof: Prof | null;
    try {
      prof = construireProf(element);
    } catch {
      continue;
    }
    if (!prof || parLogin.has(prof.login)) {
      continue;
    }
    parLogin.set(prof.login, prof);
  }
  return [...parLogin.values()].sort((a, b) =>
    a.nomComplet.localeCompare(b.nomComplet, 'fr', { sensitivity: 'base' }),
  );
}

/** Construit un `Prof` à partir d'une entrée de l'API, ou `null` si inexploitable. */
function construireProf(element: ProfOasis): Prof | null {
  const login = (element?.login ?? '').trim();
  if (!login) {
    return null;
  }
  if (element.present && element.present !== 'ACT') {
    return null;
  }
  const prenom = (element.prenom_usuel ?? '').trim();
  const nom = (element.nom_usuel ?? '').trim();
  const nomComplet = [prenom, nom].filter(Boolean).join(' ');
  if (!nomComplet) {
    return null;
  }
  return {
    login,
    nip: element.nip?.trim() || undefined,
    prenom,
    nom,
    nomComplet,
    civilite: element.civilite?.trim() || undefined,
    mailPro: element.mail_pro?.trim() || undefined,
    secteur: element.secteur?.trim() || undefined,
    service: element.service_libelle?.trim() || undefined,
    statutEtab: element.statut_etab?.trim() || undefined,
    subjects: libellesSubjects(element.subjects),
  };
}

/**
 * Normalise une chaîne pour la recherche : minuscules, sans accents et sans
 * ponctuation, pour que « abe » retrouve « ABENSOUR ».
 */
export function normaliserRecherche(texte: string | null | undefined): string {
  return (texte ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Filtre une liste sur un texte libre : chaque mot de la requête (normalisé)
 * doit apparaître dans le texte de l'élément produit par `texteDe`.
 *
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function filtrerParRecherche<T>(
  elements: readonly T[],
  requete: string | null | undefined,
  texteDe: (element: T) => string,
): T[] {
  const mots = normaliserRecherche(requete).split(' ').filter(Boolean);
  if (mots.length === 0) {
    return [...elements];
  }
  return elements.filter((element) => {
    const cible = normaliserRecherche(texteDe(element));
    return mots.every((mot) => cible.includes(mot));
  });
}

/**
 * Filtre la liste des enseignants sur le **nom** et le **prénom** (et, par
 * commodité, le `login`). La requête est découpée en mots : tous les mots
 * doivent être présents, dans le nom ou le prénom.
 *
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function filtrerProfs(profs: readonly Prof[], requete: string | null | undefined): Prof[] {
  return filtrerParRecherche(
    profs,
    requete,
    (prof) => `${prof.prenom} ${prof.nom} ${prof.login} ${prof.nomComplet}`,
  );
}

/**
 * Normalise un en-tête de colonne : minuscules, sans accents ni ponctuation.
 */
function normaliserEntete(texte: unknown): string {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Index de la première colonne dont l'en-tête contient `motif` (hors colonnes exclues). */
function indexDeColonne(
  entetes: readonly string[],
  motif: string,
  exclus: readonly number[] = [],
): number {
  return entetes.findIndex((entete, index) => !exclus.includes(index) && entete.includes(motif));
}

/** Valeur d'une cellule ramenée à une chaîne nettoyée. */
function texteCellule(cellule: unknown): string {
  return typeof cellule === 'string' ? cellule.trim() : cellule == null ? '' : String(cellule).trim();
}

/**
 * Normalise la feuille `Enseignants` du classeur `profs.xlsx`.
 *
 * Le classeur est le **repli** de l'API Oasis : mêmes notions, colonnes
 * libellées « Identité / Identifiant Oasis », « Identité / Nom usuel »,
 * « Identité / Prénom usuel » et « Secteur ». Les colonnes sont reconnues par
 * leur en-tête ; en cas d'en-tête inconnu, l'ordre des colonnes du fichier
 * (`login`, `nom`, `prénom`, `secteur`) est utilisé.
 *
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function normaliserProfsExcel(rangees: readonly unknown[][]): Prof[] {
  if (!rangees || rangees.length === 0) {
    return [];
  }
  const entetes = (rangees[0] ?? []).map(normaliserEntete);

  // Le prénom est cherché avant le nom : « prenom usuel » contient « nom usuel ».
  let indexPrenom = indexDeColonne(entetes, 'prenom usuel');
  if (indexPrenom < 0) {
    indexPrenom = indexDeColonne(entetes, 'prenom');
  }
  let indexNom = indexDeColonne(entetes, 'nom usuel', indexPrenom >= 0 ? [indexPrenom] : []);
  if (indexNom < 0) {
    indexNom = indexDeColonne(entetes, 'nom', indexPrenom >= 0 ? [indexPrenom] : []);
  }
  let indexLogin = indexDeColonne(entetes, 'identifiant oasis');
  if (indexLogin < 0) {
    indexLogin = indexDeColonne(entetes, 'login');
  }
  let indexSecteur = entetes.findIndex((entete) => entete === 'secteur');
  if (indexSecteur < 0) {
    indexSecteur = indexDeColonne(entetes, 'secteur');
  }

  // Repli sur l'ordre des colonnes du fichier.
  const colonnes = {
    login: indexLogin >= 0 ? indexLogin : 0,
    nom: indexNom >= 0 ? indexNom : 1,
    prenom: indexPrenom >= 0 ? indexPrenom : 2,
    secteur: indexSecteur >= 0 ? indexSecteur : 3,
  };

  const elements: ProfOasis[] = [];
  for (const ligne of rangees.slice(1)) {
    const login = texteCellule(ligne?.[colonnes.login]);
    const nom = texteCellule(ligne?.[colonnes.nom]);
    const prenom = texteCellule(ligne?.[colonnes.prenom]);
    if (!login && !nom && !prenom) {
      continue;
    }
    elements.push({
      login,
      nom_usuel: nom,
      prenom_usuel: prenom,
      secteur: texteCellule(ligne?.[colonnes.secteur]) || undefined,
      present: 'ACT',
    });
  }
  return normaliserProfs(elements);
}

/**
 * `ProfService` — charge la liste des professeurs depuis l'API Oasis
 * (`GET /api/v1/profs`) et l'expose sous forme de signals.
 *
 * Le chargement est déclenché à la demande (`charger()`) et le résultat est
 * mis en cache pour la durée de la session de l'onglet : la liste des
 * enseignants est stable et volumineuse (≈ 400 entrées).
 */
@Injectable({ providedIn: 'root' })
export class ProfService {
  private readonly cours = inject(CoursServices);
  private readonly http = inject(HttpClient);
  private readonly xlsx = inject(XLSX_BACKEND);

  /** Enseignants normalisés, triés par nom. */
  readonly profs = signal<Prof[]>([]);

  /** Vrai pendant le chargement de la liste. */
  readonly chargement = signal<boolean>(false);

  /** Message d'erreur de chargement, `null` si aucun. */
  readonly erreur = signal<string | null>(null);

  /** Origine de la liste courante : API Oasis ou fichier `profs.xlsx`. */
  readonly source = signal<'api' | 'fichier' | null>(null);

  /** Nombre d'enseignants disponibles. */
  readonly nombre = computed(() => this.profs().length);

  private dejaCharge = false;

  /**
   * Charge la liste (une seule fois par session de l'onglet).
   *
   * Source primaire : l'API Oasis. Si l'appel échoue, on se replie sur le
   * classeur `profs.xlsx` servi par l'hébergement (feuille « Enseignants »).
   * Le repli n'échoue silencieusement : si les deux sources sont injoignables,
   * un message d'erreur est affiché.
   */
  async charger(): Promise<void> {
    if (this.dejaCharge || this.chargement()) {
      return;
    }
    this.chargement.set(true);
    this.erreur.set(null);
    try {
      const reponse = await firstValueFrom(this.cours.getProfs());
      this.profs.set(normaliserProfs(reponse?.elements));
      this.source.set('api');
      this.dejaCharge = true;
    } catch {
      const charge = await this.chargerDepuisFichier();
      if (!charge) {
        this.erreur.set('Liste des professeurs indisponible. Réessayez.');
      }
    } finally {
      this.chargement.set(false);
    }
  }

  /**
   * Repli : charge la liste des enseignants depuis `public/profs.xlsx`.
   *
   * @returns `true` si la liste a été chargée depuis le fichier.
   */
  private async chargerDepuisFichier(): Promise<boolean> {
    let rangees: unknown[][];
    try {
      const buffer = await firstValueFrom(this.http.get(URL_PROFS, { responseType: 'arraybuffer' }));
      const fichier = new File([buffer], 'profs.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      try {
        rangees = await this.xlsx.lire(fichier, FEUILLE_ENSEIGNANTS);
      } catch {
        // Classeur sans feuille « Enseignants » : on tente la première feuille.
        rangees = await this.xlsx.lire(fichier);
      }
    } catch {
      return false;
    }
    const profs = normaliserProfsExcel(rangees);
    if (profs.length === 0) {
      return false;
    }
    this.profs.set(profs);
    this.source.set('fichier');
    this.dejaCharge = true;
    return true;
  }

  /** Force un nouveau chargement (bouton « Réessayer »). */
  reessayer(): void {
    this.dejaCharge = false;
    void this.charger();
  }
}
