import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CoursServices, type ProfOasis, type SujetOasis } from '../core/cours.services';

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
 * Filtre la liste des enseignants sur le **nom** et le **prénom** (et, par
 * commodité, le `login`). La requête est découpée en mots : tous les mots
 * doivent être présents, dans le nom ou le prénom.
 *
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function filtrerProfs(profs: readonly Prof[], requete: string | null | undefined): Prof[] {
  const mots = normaliserRecherche(requete).split(' ').filter(Boolean);
  if (mots.length === 0) {
    return [...profs];
  }
  return profs.filter((prof) => {
    const cible = normaliserRecherche(
      `${prof.prenom} ${prof.nom} ${prof.login} ${prof.nomComplet}`,
    );
    return mots.every((mot) => cible.includes(mot));
  });
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

  /** Enseignants normalisés, triés par nom. */
  readonly profs = signal<Prof[]>([]);

  /** Vrai pendant le chargement de la liste. */
  readonly chargement = signal<boolean>(false);

  /** Message d'erreur de chargement, `null` si aucun. */
  readonly erreur = signal<string | null>(null);

  /** Nombre d'enseignants disponibles. */
  readonly nombre = computed(() => this.profs().length);

  private dejaCharge = false;

  /** Charge la liste (une seule fois par session de l'onglet). */
  async charger(): Promise<void> {
    if (this.dejaCharge || this.chargement()) {
      return;
    }
    this.chargement.set(true);
    this.erreur.set(null);
    try {
      const reponse = await firstValueFrom(this.cours.getProfs());
      this.profs.set(normaliserProfs(reponse?.elements));
      this.dejaCharge = true;
    } catch {
      this.erreur.set('Liste des professeurs indisponible. Réessayez.');
    } finally {
      this.chargement.set(false);
    }
  }

  /** Force un nouveau chargement (bouton « Réessayer »). */
  reessayer(): void {
    this.dejaCharge = false;
    void this.charger();
  }
}
