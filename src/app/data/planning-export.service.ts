/**
 * Export Excel du planning des professeurs (espace administrateur).
 *
 * Le fichier produit est une **matrice** : une ligne par professeur, une
 * colonne par créneau proposé. Une cellule vaut `X` lorsque le professeur a
 * retenu le créneau, et reste vide sinon.
 *
 * La construction de la matrice est une fonction **pure**
 * (`construireMatricePlanning`) : testable sans Angular, sans réseau et sans
 * navigateur. L'écriture du `.xlsx` est isolée dans le service.
 *
 * Bibliothèque : `write-excel-file` (frère jumeau de `read-excel-file`, déjà
 * utilisé pour l'import) — génération du classeur **dans le navigateur**, le
 * fichier n'est jamais envoyé sur un serveur.
 */
import { Injectable } from '@angular/core';
import writeXlsxFile, { type Cell } from 'write-excel-file/browser';

import type { Creneau } from './models';
import type { ProfDispo } from './dispo-prof.service';
import type { Prof } from './prof.service';

/** Valeur écrite dans une cellule lorsque le professeur est disponible. */
export const MARQUE_DISPONIBLE = 'X';

/** Nom du fichier Excel exporté. */
export const NOM_FICHIER_PLANNING = 'planning-disponibilites.xlsx';

/** Nom de la feuille du classeur. */
export const NOM_FEUILLE_PLANNING = 'Planning';

/** En-tête de la première colonne. */
export const ENTETE_PROFESSEUR = 'Professeur';
/** En-tête de la colonne « Email ». */
export const ENTETE_EMAIL = 'Email';

/** En-tête de la colonne « capacité à suivre des soutenances en anglais ». */
export const ENTETE_ANGLAIS = 'Anglais';

/** Valeur écrite quand le professeur peut suivre des soutenances en anglais. */
export const MARQUE_ANGLAIS = 'Oui';

/** Valeur écrite quand le professeur ne peut pas suivre des soutenances en anglais. */
export const MARQUE_ANGLAIS_NON = 'Non';

/** Couleurs du classeur (palette Material 3 : conteneur primaire / tertiaire). */
const COULEUR_ENTETE_FOND = '#EADDFF';
const COULEUR_ENTETE_TEXTE = '#21005D';
const COULEUR_MARQUE_FOND = '#8aff4f';
const COULEUR_MARQUE_TEXTE = '#000000';

/** Une colonne du planning : un créneau et son étiquette lisible. */
export interface ColonneCreneau {
  /** Identifiant du créneau (`creneaux/{id}`). */
  readonly creneauId: string;
  /** Étiquette lisible : `12/01 08:45–09:30`. */
  readonly etiquette: string;
}

/** Une ligne du planning : un professeur et les créneaux qu'il a retenus. */
export interface LignePlanning {
  /** Nom affiché du professeur. */
  readonly nom: string;
  /**
   * Adresse électronique professionnelle du professeur (colonne « Email » de
   * `profs.xlsx`). Vide si l'adresse est inconnue.
   */
  readonly email?: string;
  /**
   * Capacité du professeur à **comprendre l'anglais** (peut suivre des
   * soutenances en anglais). `undefined` : la préférence n'a pas été
   * renseignée par le professeur.
   */
  readonly anglais?: boolean;
  /** Identifiants des créneaux retenus par le professeur. */
  readonly creneauxIds: ReadonlySet<string>;
}

/**
 * Valeur de la colonne « Anglais » pour un professeur.
 *
 * `Oui` / `Non` selon la préférence déclarée, chaîne vide si le professeur
 * n'a pas répondu (donnée absente, non assimilée à un refus).
 */
export function valeurAnglais(anglais: boolean | undefined): string {
  if (anglais === true) {
    return MARQUE_ANGLAIS;
  }
  if (anglais === false) {
    return MARQUE_ANGLAIS_NON;
  }
  return '';
}

/** Matrice complète du planning (colonnes + lignes). */
export interface MatricePlanning {
  readonly colonnes: readonly ColonneCreneau[];
  readonly lignes: readonly LignePlanning[];
}

/**
 * Étiquette lisible d'un créneau : `JJ/MM HH:mm–HH:mm`.
 *
 * Les dates sont manipulées comme chaînes (`'YYYY-MM-DD'`, §13) : aucune
 * conversion de fuseau horaire n'intervient.
 */
export function etiquetteCreneau(date: string, heureDebut: string, heureFin: string): string {
  const jour = date.length === 10 ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : date;
  return `${jour} ${heureDebut}–${heureFin}`;
}

/**
 * Construit la matrice du planning.
 *
 * Les colonnes suivent l'ordre des créneaux proposals (date puis heure) ;
 * les créneaux **orphelins** (déclarés par un professeur mais supprimés de la
 * collection `creneaux`) sont ajoutés à la fin afin qu'aucune disponibilité ne
 * soit perdue dans l'export.
 *
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function construireMatricePlanning(
  profs: readonly ProfDispo[],
  creneaux: readonly Creneau[],
): MatricePlanning {
  const colonnes: ColonneCreneau[] = [];
  const connus = new Set<string>();

  for (const creneau of creneaux) {
    if (connus.has(creneau.id)) {
      continue;
    }
    connus.add(creneau.id);
    colonnes.push({
      creneauId: creneau.id,
      etiquette: etiquetteCreneau(creneau.date, creneau.heureDebut, creneau.heureFin),
    });
  }

  const orphelins: ColonneCreneau[] = [];
  for (const prof of profs) {
    for (const dispo of prof.dispos) {
      if (connus.has(dispo.creneauId)) {
        continue;
      }
      connus.add(dispo.creneauId);
      orphelins.push({
        creneauId: dispo.creneauId,
        etiquette: etiquetteCreneau(dispo.date, dispo.heureDebut, dispo.heureFin),
      });
    }
  }
  orphelins.sort((a, b) => a.etiquette.localeCompare(b.etiquette, 'fr'));
  colonnes.push(...orphelins);

  const lignes: LignePlanning[] = profs.map((prof) => ({
    nom: prof.nomComplet,
    ...(prof.email ? { email: prof.email } : {}),
    anglais: prof.soutenanceAnglais,
    creneauxIds: new Set(prof.dispos.map((dispo) => dispo.creneauId)),
  }));

  return { colonnes, lignes };
}

/**
 * Nom normalisé (minuscules, sans accents ni ponctuation) : sert au
 * rapprochement entre une fiche de disponibilité et une fiche d'annuaire.
 */
export function nomNormalise(nomComplet: string): string {
  return nomComplet
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Complète la liste des professeurs ayant déclaré des disponibilités par
 * **tous les enseignants de l'annuaire** : l'export du planning doit
 * présenter l'ensemble des professeurs, y compris ceux qui n'ont renseigné
 * aucun créneau (ligne vide).
 *
 * Le rapprochement se fait sur le `login` Oasis, puis à défaut sur le nom
 * complet : un professeur déjà connu (avec ses disponibilités) n'est pas
 * dupliqué, et ses créneaux sont conservés.
 *
 * Fonction **pure** : testable sans Angular ni réseau.
 */
export function completerAvecAnnuaire(
  profs: readonly ProfDispo[],
  annuaire: readonly Prof[],
): ProfDispo[] {
  // Deux clés de rapprochement : le `login` et le nom complet normalisé.
  // Un professeur saisi en « nom libre » (sans `login`) est ainsi rapproché
  // de sa fiche d'annuaire par son nom.
  const logins = new Set<string>();
  const noms = new Set<string>();
  for (const prof of profs) {
    const login = (prof.login ?? '').trim().toLowerCase();
    if (login) {
      logins.add(login);
    }
    noms.add(nomNormalise(prof.nomComplet));
  }

  // Annuaire indexé par `login` et par nom normalisé : sert à compléter
  // l'email des fiches de disponibilité qui ne le portent pas encore.
  const annuaireParLogin = new Map<string, Prof>();
  const annuaireParNom = new Map<string, Prof>();
  for (const prof of annuaire) {
    annuaireParLogin.set(prof.login.trim().toLowerCase(), prof);
    annuaireParNom.set(nomNormalise(prof.nomComplet), prof);
  }

  const resultat: ProfDispo[] = profs.map((prof) => {
    if (prof.email) {
      return prof;
    }
    const source =
      annuaireParLogin.get((prof.login ?? '').trim().toLowerCase()) ??
      annuaireParNom.get(nomNormalise(prof.nomComplet));
    const email = source?.mailPro?.trim();
    return email ? { ...prof, email } : prof;
  });

  for (const prof of annuaire) {
    const login = prof.login.trim().toLowerCase();
    const nom = nomNormalise(prof.nomComplet);
    if ((login && logins.has(login)) || noms.has(nom)) {
      continue;
    }
    if (login) {
      logins.add(login);
    }
    noms.add(nom);
    const email = prof.mailPro?.trim();
    resultat.push({
      uid: `annuaire:${prof.login}`,
      login: prof.login,
      nom: prof.nom,
      prenom: prof.prenom,
      nomComplet: prof.nomComplet,
      ...(email ? { email } : {}),
      dispos: [],
    });
  }

  return resultat;
}

/**
 * `PlanningExportService` — écrit le classeur Excel du planning et déclenche
 * son téléchargement.
 */
@Injectable({ providedIn: 'root' })
export class PlanningExportService {
  /**
   * Exporte le planning.
   *
   * Le classeur comporte une colonne « Anglais » (`Oui` / `Non` / vide) qui
   * indique si le professeur peut suivre des soutenances en anglais.
   *
   * Les professeurs sont triés par ordre alphabétique (locale `fr`).
   *
   * @param profs les professeurs et leurs disponibilités
   * @param creneaux les créneaux proposés (colonnes du planning)
   * @returns le nombre de professeurs et de créneaux exportés
   */
  async exporter(
    profs: readonly ProfDispo[],
    creneaux: readonly Creneau[],
  ): Promise<{ professeurs: number; creneaux: number }> {
    const { colonnes, lignes: lignesNonTries } = construireMatricePlanning(profs, creneaux);
    const lignes = [...lignesNonTries].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

    const entete: Cell[] = [
      {
        value: ENTETE_PROFESSEUR,
        type: String,
        fontWeight: 'bold',
        backgroundColor: COULEUR_ENTETE_FOND,
        textColor: COULEUR_ENTETE_TEXTE,
        alignVertical: 'center',
      },
      {
        value: ENTETE_EMAIL,
        type: String,
        fontWeight: 'bold',
        backgroundColor: COULEUR_ENTETE_FOND,
        textColor: COULEUR_ENTETE_TEXTE,
        alignVertical: 'center',
      },
      {
        value: ENTETE_ANGLAIS,
        type: String,
        fontWeight: 'bold',
        backgroundColor: COULEUR_ENTETE_FOND,
        textColor: COULEUR_ENTETE_TEXTE,
        align: 'center',
        alignVertical: 'center',
        wrap: true,
      },
      ...colonnes.map((colonne): Cell => ({
        value: colonne.etiquette,
        type: String,
        fontWeight: 'bold',
        backgroundColor: COULEUR_ENTETE_FOND,
        textColor: COULEUR_ENTETE_TEXTE,
        align: 'center',
        alignVertical: 'center',
        wrap: true,
      })),
    ];

    const corps: Cell[][] = lignes.map((ligne) => [
      { value: ligne.nom, type: String },
      { value: ligne.email ?? '', type: String },
      ligne.anglais === undefined
        ? { type: String, align: 'center' }
        : {
            value: valeurAnglais(ligne.anglais),
            type: String,
            align: 'center',
            ...(ligne.anglais === true
              ? {
                  fontWeight: 'bold' as const,
                  backgroundColor: COULEUR_MARQUE_FOND,
                  textColor: COULEUR_MARQUE_TEXTE,
                }
              : {}),
          },
      ...colonnes.map((colonne): Cell =>
        ligne.creneauxIds.has(colonne.creneauId)
          ? {
              value: MARQUE_DISPONIBLE,
              type: String,
              fontWeight: 'bold',
              align: 'center',
              backgroundColor: COULEUR_MARQUE_FOND,
              textColor: COULEUR_MARQUE_TEXTE,
            }
          : { value: '', type: String, align: 'center' },
      ),
    ]);

    const classeur = await writeXlsxFile([entete, ...corps], {
      sheet: NOM_FEUILLE_PLANNING,
      orientation: 'landscape',
      columns: [
        { width: 28 },
        { width: 32 },
        { width: 10 },
        ...colonnes.map(() => ({ width: 16 })),
      ],
    });
    await classeur.toFile(NOM_FICHIER_PLANNING);

    return { professeurs: lignes.length, creneaux: colonnes.length };
  }
}
