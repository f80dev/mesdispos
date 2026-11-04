// src/app/data/models.ts

/** Un créneau proposé. Les heures sont des chaînes — JAMAIS de Date/Timestamp (voir Do NOT). */
export interface Creneau {
  id: string; // déterministe : `${date}_${hhmm}_${hhmm}` ex. `2026-01-12_0845_0930`
  date: string; // 'YYYY-MM-DD'
  heureDebut: string; // 'HH:mm' (24h)
  heureFin: string; // 'HH:mm' (24h), strictement > heureDebut
  libelle?: string; // optionnel, ex. "Audition A1"
}

/**
 * Identité du professeur — stockée dans le document `users/{uid}`.
 *
 * `login` est l'identifiant stable côté API Oasis (LDAP) ; il est vide
 * lorsque le professeur a utilisé la saisie libre (« Autre nom »), où seul
 * un prénom est connu. `nom` et `prenom` sont les fragments d'usage.
 */
export interface ProfilProf {
  /** Identifiant LDAP Oasis, ex. `judith.abensour` — vide en saisie libre. */
  login: string;
  /** Nom d'usage, ex. `ABENSOUR` — vide en saisie libre. */
  nom: string;
  /** Prénom d'usage, ex. `Judith`. */
  prenom: string;
  /** Date.now() — horodatage de la dernière écriture du profil. */
  updatedAt: number;
}

/** Le choix d'un professeur. Sous-collection users/{uid}/dispos/{creneauId}. */
export interface Dispo {
  creneauId: string;
  date: string; // dénormalisé pour l'affichage sans jointure
  heureDebut: string;
  heureFin: string;
  libelle?: string;
  /** Identité dénormalisée du professeur (lecture directe dans la console). */
  login?: string;
  nom?: string;
  prenom?: string;
  updatedAt: number; // Date.now() — horodatage d'affichage uniquement
}

/** Une ligne lue dans le fichier Excel avant validation. */
export interface LigneImport {
  ligne: number; // n° de ligne dans le fichier (pour les messages d'erreur)
  date: string; // normalisée 'YYYY-MM-DD'
  heureDebut: string; // normalisée 'HH:mm'
  heureFin: string;
  libelle?: string;
  erreur?: string; // message français si la ligne est invalide
}

export interface ResultatImport {
  valides: LigneImport[];
  invalides: LigneImport[];
}

/**
 * **Identité anonyme (mode A, cf. F2)** — la valeur vit uniquement dans le
 * cookie `mesdispos_nom` (côté navigateur). Pas de miroir Firestore du prénom.
 * Un identifiant technique déterministe pour l'écriture est dérivé côté client :
 * `uid = 'anon_' + sha256(nom normalisé).slice(0, 12)` ; utilisé pour la
 * sous-collection `users/{uid}/dispos` quand l'utilisateur est en mode A. Le
 * prénom reste la valeur d'affichage (`displayName`) ; l'`uid` anonyme n'est
 * jamais rendu à l'utilisateur.
 *
 * La forme unifiée de l'identité elle-même est `Utilisateur`
 * (`core/auth.service.ts`), consommée par le header et par les guards.
 */

/** Identifiant déterministe d'un créneau : `${date}_${hhmm}_${hhmm}`. */
export function idCreneau(creneau: Pick<Creneau, 'date' | 'heureDebut' | 'heureFin'>): string {
  return `${creneau.date}_${creneau.heureDebut.replace(':', '')}_${creneau.heureFin.replace(':', '')}`;
}
