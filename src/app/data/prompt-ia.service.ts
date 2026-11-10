/**
 * `PromptIaService` — fabrication du **prompt IA** destiné à constituer les
 * jurys de soutenance.
 *
 * Le prompt est le gabarit `public/template.md` dont les champs entre
 * accolades sont remplacés par trois blocs CSV :
 *
 * | Champ du gabarit        | Source                                  |
 * |-------------------------|-----------------------------------------|
 * | `{{csv_liste_memoire}}` | `public/memoires.xlsx` (1ʳᵉ feuille)    |
 * | `{{csv_liste_dispo}}`   | les disponibilités déclarées (Firestore) |
 * | `{{csv_liste_salle}}`   | `public/salles.xlsx` (1ʳᵉ feuille)       |
 *
 * Le classeur des mémoires peut être **remplacé à la volée** par
 * l'administrateur : un `.xlsx` déposé dans l'écran « Prompt IA », au même
 * format que `memoires.xlsx`, est lu en mémoire et remplace le fichier par
 * défaut pour les générations suivantes.
 *
 * Tout se passe **dans le navigateur** : les fichiers sont lus par `fetch`
 * (donc servis par l'hébergement) et analysés par `read-excel-file` ; aucune
 * donnée n'est envoyée à un serveur.
 */
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { FIRESTORE_BACKEND, type DispoAdmin, type ProfilAdmin } from '../core/firestore.backend';
import { XLSX_BACKEND } from '../core/xlsx.backend';
import {
  celluleTexte,
  normaliserEnteteCsv,
  remplacerGabarit,
  SEPARATEUR_LISTE,
  versCsv,
} from '../shared/csv.util';

/** URL du gabarit (servi par `public/`). */
export const URL_GABARIT = '/template.md';

/** URL du classeur des mémoires. */
export const URL_MEMOIRES = '/memoires.xlsx';

/** URL du classeur des salles. */
export const URL_SALLES = '/salles.xlsx';

/** Nom du champ du gabarit remplacé par le CSV des mémoires. */
export const CHAMP_MEMOIRES = 'csv_liste_memoire';

/** Nom du champ du gabarit remplacé par le CSV des disponibilités. */
export const CHAMP_DISPO = 'csv_liste_dispo';

/** Nom du champ du gabarit remplacé par le CSV des salles. */
export const CHAMP_SALLE = 'csv_liste_salle';

/** Message affiché quand le presse-papiers est inaccessible. */
export const MESSAGE_COPIE_ECHEC =
  'Copie impossible : le presse-papiers a été refusé par le navigateur.';

/** Message affiché quand un fichier nécessaire est introuvable. */
export const MESSAGE_FICHIER_MANQUANT = 'Fichier introuvable : vérifiez son déploiement.';

/** Message affiché quand le fichier déposé n'est pas un classeur `.xlsx`. */
export const MESSAGE_FORMAT_NON_PRIS_EN_CHARGE =
  'Format non pris en charge : utilisez un fichier Excel .xlsx';

/** Message affiché quand le classeur déposé n'a pas la structure de `memoires.xlsx`. */
export const MESSAGE_FORMAT_MEMOIRES_INCONNU =
  'Format non reconnu : le fichier doit avoir les mêmes colonnes que memoires.xlsx ' +
  '(identifiant, étudiant, type, titre, statut, statut de la direction, directeur, date de dépôt).';

/** Message affiché quand la base des disponibilités est injoignable. */
export const MESSAGE_BASE_INJOIGNABLE = 'Impossible de lire les disponibilités des professeurs.';

/** Une colonne de classeur, décrite par ses deux noms possibles. */
interface ColonneSource {
  /** En-tête CSV produit. */
  readonly cle: string;
  /** Nom technique de la colonne (ligne 1 des exports). */
  readonly technique: string;
  /** Libellé humain de la colonne (ligne 2 des exports). */
  readonly humain: string;
  /** Position de repli (l'ordre des colonnes des exports). */
  readonly position: number;
}

const COLONNES_MEMOIRES: readonly ColonneSource[] = [
  { cle: 'etudiant', technique: 'CODE_STUDENT', humain: 'etudiant', position: 0 },
  { cle: 'titre', technique: 'TITLE', humain: 'titre', position: 1 },
  { cle: 'statut', technique: 'STATUS', humain: 'statut du memoire', position: 2 },
  {
    cle: 'statut_direction',
    technique: 'DIRECTION_STATUS',
    humain: 'statut de la direction de memoire',
    position: 3,
  },
  {
    cle: 'directeur',
    technique: 'DIRECTOR',
    humain: 'directeurs directeur de memoire',
    position: 4,
  },
  {
    cle: 'date_depot_sujet',
    technique: 'SUBJECT_SUBMISSION_DATE',
    humain: 'date de depot du sujet',
    position: 5,
  },
];

const COLONNES_SALLES: readonly ColonneSource[] = [
  { cle: 'numero', technique: 'CODE', humain: 'numero', position: 0 },
  { cle: 'nom', technique: 'NAME', humain: 'nom', position: 1 },
];

/**
 * Détermine, pour chaque colonne attendue, l'index de la colonne dans le
 * classeur et l'index de la première ligne de données.
 *
 * Deux formats d'export sont gérés :
 *  - **technique** : ligne 1 = noms techniques (`CODE`, `TITLE`…), ligne 2 =
 *    libellés humains, données à partir de la ligne 3 ;
 *  - **humain** : ligne 1 = libellés, données à partir de la ligne 2.
 *
 * En dernier recours, l'ordre positionnel des colonnes est utilisé.
 *
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function indexerColonnesSource(
  rangees: readonly unknown[][],
  colonnes: readonly ColonneSource[],
): { indexes: number[]; premiereDonnee: number } {
  const premiere = rangees[0] ?? [];
  const technique = premiere.map(normaliserEnteteCsv);
  const techniqueConnue = colonnes.every((colonne) =>
    technique.includes(normaliserEnteteCsv(colonne.technique)),
  );
  if (techniqueConnue) {
    return {
      indexes: colonnes.map((colonne) => technique.indexOf(normaliserEnteteCsv(colonne.technique))),
      premiereDonnee: 2,
    };
  }

  const humain = premiere.map(normaliserEnteteCsv);
  const humainConnu = colonnes.every((colonne) =>
    humain.includes(normaliserEnteteCsv(colonne.humain)),
  );
  if (humainConnu) {
    return {
      indexes: colonnes.map((colonne) => humain.indexOf(normaliserEnteteCsv(colonne.humain))),
      premiereDonnee: 1,
    };
  }

  return { indexes: colonnes.map((colonne) => colonne.position), premiereDonnee: 2 };
}

/**
 * Transforme les lignes brutes d'un classeur en lignes CSV.
 *
 * Les lignes entièrement vides sont ignorées.
 *
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function lignesVersCsv(
  rangees: readonly unknown[][],
  colonnes: readonly ColonneSource[],
): { entetes: string[]; lignes: string[][] } {
  const { indexes, premiereDonnee } = indexerColonnesSource(rangees, colonnes);
  const lignes: string[][] = [];
  for (let index = premiereDonnee; index < rangees.length; index++) {
    const rangee = rangees[index] ?? [];
    const valeurs = indexes.map((colonne) => celluleTexte(rangee[colonne]));
    if (valeurs.every((valeur) => valeur.length === 0)) {
      continue;
    }
    lignes.push(valeurs);
  }
  return { entetes: colonnes.map((colonne) => colonne.cle), lignes };
}

/** CSV des mémoires (`memoires.xlsx`). */
export function construireCsvMemoires(rangees: readonly unknown[][]): string {
  const { entetes, lignes } = lignesVersCsv(rangees, COLONNES_MEMOIRES);
  return versCsv(entetes, lignes);
}

/** CSV des salles (`salles.xlsx`). */
export function construireCsvSalles(rangees: readonly unknown[][]): string {
  const { entetes, lignes } = lignesVersCsv(rangees, COLONNES_SALLES);
  return versCsv(entetes, lignes);
}

/**
 * Vrai si les lignes brutes portent les en-têtes du fichier des mémoires
 * (noms techniques `[[ CODE ]]`… ou libellés humains).
 *
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function formatMemoiresReconnu(rangees: readonly unknown[][]): boolean {
  const premiere = rangees[0] ?? [];
  const entetes = premiere.map(normaliserEnteteCsv);
  const technique = COLONNES_MEMOIRES.every((colonne) =>
    entetes.includes(normaliserEnteteCsv(colonne.technique)),
  );
  if (technique) {
    return true;
  }
  return COLONNES_MEMOIRES.every((colonne) =>
    entetes.includes(normaliserEnteteCsv(colonne.humain)),
  );
}

/** Nombre de mémoires (lignes de données) contenues dans des lignes brutes. */
export function compterMemoires(rangees: readonly unknown[][]): number {
  const { lignes } = lignesVersCsv(rangees, COLONNES_MEMOIRES);
  return lignes.length;
}

/** Identité d'un professeur, dénormalisée dans la disponibilité ou le profil. */
interface Identite {
  login: string;
  nom: string;
  prenom: string;
}

function lireIdentite(data: Record<string, unknown>): Identite {
  const login = typeof data['login'] === 'string' ? data['login'].trim() : '';
  const nom = typeof data['nom'] === 'string' ? data['nom'].trim() : '';
  const prenom = typeof data['prenom'] === 'string' ? data['prenom'].trim() : '';
  return { login, nom, prenom };
}

function libelleIdentite(identite: Identite): string {
  if (identite.prenom || identite.nom) {
    return [identite.prenom, identite.nom].filter(Boolean).join(' ');
  }
  return identite.login;
}

/**
 * CSV des professeurs **avec leurs disponibilités**.
 *
 * Une ligne par professeur : `login`, `nom`, `prenom`, `nb_creneaux`,
 * `disponibilites` (la liste des créneaux, séparés par `; `). Un professeur
 * sans disponibilité est conservé avec un nombre à 0.
 *
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function csvDisponibilites(
  profils: readonly ProfilAdmin[],
  dispos: readonly DispoAdmin[],
): string {
  const parUid = new Map<string, { identite: Identite; creneaux: string[] }>();
  for (const profil of profils) {
    parUid.set(profil.uid, { identite: lireIdentite(profil.data), creneaux: [] });
  }
  for (const dispo of dispos) {
    const entree = parUid.get(dispo.uid) ?? { identite: lireIdentite(dispo.data), creneaux: [] };
    // L'identité dénormalisée dans la disponibilité est plus fraîche que celle
    // du profil (une attribution peut l'avoir écrite après coup).
    if (!entree.identite.login && typeof dispo.data['login'] === 'string') {
      entree.identite = lireIdentite(dispo.data);
    }
    const date = celluleTexte(dispo.data['date']);
    const debut = celluleTexte(dispo.data['heureDebut']);
    const fin = celluleTexte(dispo.data['heureFin']);
    if (date && debut && fin) {
      entree.creneaux.push(`${date} ${debut}-${fin}`);
    }
    parUid.set(dispo.uid, entree);
  }

  const lignes: string[][] = [];
  for (const entree of parUid.values()) {
    const creneaux = [...entree.creneaux].sort((a, b) => a.localeCompare(b, 'fr'));
    lignes.push([
      entree.identite.login,
      entree.identite.nom,
      entree.identite.prenom,
      String(creneaux.length),
      creneaux.join(SEPARATEUR_LISTE),
    ]);
  }
  lignes.sort((a, b) =>
    libelleIdentite({ login: a[0], nom: a[1], prenom: a[2] }).localeCompare(
      libelleIdentite({ login: b[0], nom: b[1], prenom: b[2] }),
      'fr',
    ),
  );

  return versCsv(['login', 'nom', 'prenom', 'nb_creneaux', 'disponibilites'], lignes);
}

/**
 * Copie un texte dans le presse-papiers.
 *
 * Utilise l'API asynchrone (`navigator.clipboard`) quand elle est disponible,
 * et se replie sur `document.execCommand('copy')` (contexte non sécurisé,
 * ancien navigateur).
 *
 * @returns `true` si la copie a réussi.
 */
export async function copierDansPressePapier(texte: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(texte);
      return true;
    }
  } catch {
    // Repli ci-dessous.
  }

  try {
    const zone = document.createElement('textarea');
    zone.value = texte;
    zone.setAttribute('readonly', '');
    zone.style.position = 'fixed';
    zone.style.opacity = '0';
    document.body.appendChild(zone);
    zone.select();
    const copie = document.execCommand('copy');
    document.body.removeChild(zone);
    return copie;
  } catch {
    return false;
  }
}

/** Compteurs affichés à l'administrateur. */
export interface StatistiquesPrompt {
  memoires: number;
  salles: number;
  professeurs: number;
  creneaux: number;
}

/**
 * `PromptIaService` — assemble le prompt et le met dans le presse-papiers.
 */
@Injectable({ providedIn: 'root' })
export class PromptIaService {
  private readonly http = inject(HttpClient);
  private readonly xlsx = inject(XLSX_BACKEND);
  private readonly backend = inject(FIRESTORE_BACKEND);

  /** Vrai pendant la préparation du prompt. */
  readonly enCours = signal<boolean>(false);

  /** Message d'erreur, `null` si tout va bien. */
  readonly erreur = signal<string | null>(null);

  /** Dernier prompt assemblé (aperçu affiché à l'administrateur). */
  readonly prompt = signal<string | null>(null);

  /** Compteurs du dernier prompt assemblé. */
  readonly statistiques = signal<StatistiquesPrompt>({
    memoires: 0,
    salles: 0,
    professeurs: 0,
    creneaux: 0,
  });

  /** Nom du classeur des mémoires importé (`null` si le fichier par défaut est utilisé). */
  readonly fichierMemoires = signal<string | null>(null);

  /** Nombre de mémoires détectées dans le classeur importé. */
  readonly nbMemoiresImportees = signal<number>(0);

  /** Lignes brutes du classeur importé (mémoire vive, jamais écrit sur disque). */
  private rangeesMemoires: unknown[][] | null = null;

  /**
   * Importe un classeur des mémoires **au format `memoires.xlsx`**.
   *
   * Le classeur remplace alors le fichier `public/memoires.xlsx` pour les
   * prochaines générations de prompt. Il reste en mémoire : rien n'est
   * envoyé à un serveur ni conservé sur le disque.
   *
   * @param fichier le classeur `.xlsx` déposé par l'administrateur
   * @returns le nombre de mémoires détectées
   */
  async importerMemoires(fichier: File): Promise<number> {
    if (!/\.xlsx$/i.test(fichier.name)) {
      throw new Error(MESSAGE_FORMAT_NON_PRIS_EN_CHARGE);
    }
    let rangees: unknown[][];
    try {
      rangees = await this.xlsx.lire(fichier);
    } catch {
      throw new Error('Fichier illisible ou corrompu.');
    }
    if (!formatMemoiresReconnu(rangees)) {
      throw new Error(MESSAGE_FORMAT_MEMOIRES_INCONNU);
    }
    const nombre = compterMemoires(rangees);
    this.rangeesMemoires = rangees;
    this.fichierMemoires.set(fichier.name);
    this.nbMemoiresImportees.set(nombre);
    return nombre;
  }

  /** Retire le classeur importé : le fichier `public/memoires.xlsx` est réutilisé. */
  retirerMemoires(): void {
    this.rangeesMemoires = null;
    this.fichierMemoires.set(null);
    this.nbMemoiresImportees.set(0);
  }

  /** Assemble le prompt complet (gabarit + trois blocs CSV). */
  async generer(): Promise<string> {
    this.enCours.set(true);
    this.erreur.set(null);
    try {
      const [gabarit, salles] = await Promise.all([
        this.chargerTexte(URL_GABARIT),
        this.chargerClasseur(URL_SALLES),
      ]);
      const memoires = this.rangeesMemoires ?? (await this.chargerClasseur(URL_MEMOIRES));

      const [profils, dispos] = await this.chargerDisponibilites();

      const csvMemoires = construireCsvMemoires(memoires);
      const csvDispo = csvDisponibilites(profils, dispos);
      const csvSalles = construireCsvSalles(salles);

      const texte = remplacerGabarit(gabarit, {
        [CHAMP_MEMOIRES]: csvMemoires.trimEnd(),
        [CHAMP_DISPO]: csvDispo.trimEnd(),
        [CHAMP_SALLE]: csvSalles.trimEnd(),
      });

      this.statistiques.set({
        memoires: compterLignes(csvMemoires),
        salles: compterLignes(csvSalles),
        professeurs: compterLignes(csvDispo),
        creneaux: dispos.length,
      });
      this.prompt.set(texte);
      return texte;
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : MESSAGE_BASE_INJOIGNABLE;
      this.erreur.set(message);
      throw erreur instanceof Error ? erreur : new Error(MESSAGE_BASE_INJOIGNABLE);
    } finally {
      this.enCours.set(false);
    }
  }

  /**
   * Assemble le prompt (si nécessaire) et le copie dans le presse-papiers.
   *
   * @returns `true` si la copie a réussi.
   */
  async copier(): Promise<boolean> {
    const texte = this.prompt() ?? (await this.generer());
    return copierDansPressePapier(texte);
  }

  /** Lit un fichier texte servi par l'hébergement (`public/`). */
  private async chargerTexte(url: string): Promise<string> {
    try {
      return await firstValueFrom(this.http.get(url, { responseType: 'text' }));
    } catch {
      throw new Error(`${MESSAGE_FICHIER_MANQUANT} (${url})`);
    }
  }

  /** Lit un classeur Excel servi par l'hébergement (`public/`). */
  private async chargerClasseur(url: string): Promise<unknown[][]> {
    let buffer: ArrayBuffer;
    try {
      buffer = await firstValueFrom(this.http.get(url, { responseType: 'arraybuffer' }));
    } catch {
      throw new Error(`${MESSAGE_FICHIER_MANQUANT} (${url})`);
    }
    const nom = url.slice(url.lastIndexOf('/') + 1);
    const fichier = new File([buffer], nom, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    try {
      return await this.xlsx.lire(fichier);
    } catch {
      throw new Error(`Fichier illisible ou corrompu : ${url}`);
    }
  }

  /** Profils et disponibilités déclarées (lecture Firestore). */
  private async chargerDisponibilites(): Promise<[readonly ProfilAdmin[], readonly DispoAdmin[]]> {
    if (!this.backend.configure) {
      throw new Error(MESSAGE_BASE_INJOIGNABLE);
    }
    try {
      const [profils, dispos] = await Promise.all([
        this.backend.listerProfils(),
        this.backend.lireToutesDispos(),
      ]);
      return [profils, dispos];
    } catch {
      throw new Error(MESSAGE_BASE_INJOIGNABLE);
    }
  }
}

/** Nombre de lignes de données d'un CSV (en-tête exclu). */
export function compterLignes(csv: string): number {
  const lignes = csv
    .trim()
    .split('\n')
    .filter((ligne) => ligne.trim().length > 0);
  return Math.max(0, lignes.length - 1);
}
