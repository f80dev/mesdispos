import { describe, expect, it } from 'vitest';

import {
  construireMatricePlanning,
  etiquetteCreneau,
  MARQUE_DISPONIBLE,
} from './planning-export.service';
import type { ProfDispo } from './dispo-prof.service';
import type { Creneau, Dispo } from './models';

function creneau(id: string, date: string, heureDebut: string, heureFin: string): Creneau {
  return { id, date, heureDebut, heureFin };
}

function dispo(creneauId: string, date: string, heureDebut: string, heureFin: string): Dispo {
  return { creneauId, date, heureDebut, heureFin, updatedAt: 0 };
}

function prof(nomComplet: string, dispos: Dispo[]): ProfDispo {
  return {
    uid: `uid-${nomComplet}`,
    login: '',
    nom: '',
    prenom: nomComplet,
    nomComplet,
    dispos,
  };
}

describe('etiquetteCreneau', () => {
  it('formate la date et la plage horaire sans conversion de fuseau', () => {
    expect(etiquetteCreneau('2026-01-12', '08:45', '09:30')).toBe('12/01 08:45–09:30');
  });

  it('laisse une date illisible telle quelle', () => {
    expect(etiquetteCreneau('inconnue', '08:45', '09:30')).toBe('inconnue 08:45–09:30');
  });
});

describe('construireMatricePlanning', () => {
  it('construit une colonne par créneau et une ligne par professeur', () => {
    const matrice = construireMatricePlanning(
      [
        prof('Ana ALLA', [dispo('c1', '2026-01-12', '08:45', '09:30')]),
        prof('Zoé BART', [dispo('c2', '2026-01-12', '09:00', '10:00')]),
      ],
      [
        creneau('c1', '2026-01-12', '08:45', '09:30'),
        creneau('c2', '2026-01-12', '09:00', '10:00'),
      ],
    );

    expect(matrice.colonnes.map((colonne) => colonne.creneauId)).toEqual(['c1', 'c2']);
    expect(matrice.colonnes.map((colonne) => colonne.etiquette)).toEqual([
      '12/01 08:45–09:30',
      '12/01 09:00–10:00',
    ]);
    expect(matrice.lignes.map((ligne) => ligne.nom)).toEqual(['Ana ALLA', 'Zoé BART']);
    expect(matrice.lignes[0]?.creneauxIds.has('c1')).toBe(true);
    expect(matrice.lignes[0]?.creneauxIds.has('c2')).toBe(false);
  });

  it('ajoute les créneaux orphelins (supprimés de la collection) en fin de matrice', () => {
    const matrice = construireMatricePlanning(
      [prof('Ana ALLA', [dispo('orphelin', '2026-01-20', '14:00', '15:00')])],
      [creneau('c1', '2026-01-12', '08:45', '09:30')],
    );

    expect(matrice.colonnes.map((colonne) => colonne.creneauId)).toEqual(['c1', 'orphelin']);
    expect(matrice.lignes[0]?.creneauxIds.has('orphelin')).toBe(true);
  });

  it('ignore les doublons de créneau', () => {
    const matrice = construireMatricePlanning(
      [],
      [
        creneau('c1', '2026-01-12', '08:45', '09:30'),
        creneau('c1', '2026-01-12', '08:45', '09:30'),
      ],
    );

    expect(matrice.colonnes).toHaveLength(1);
  });

  it('expose la marque de disponibilité', () => {
    expect(MARQUE_DISPONIBLE).toBe('X');
  });
});
