import { describe, expect, it } from 'vitest';

import {
  ajouterMinutes,
  analyserFeuillePlanning,
  analyserPlageHeure,
  comparerSoutenances,
  indexerColonnesPlanning,
  MESSAGE_COLONNES_PLANNING,
} from './planning-import.service';

/** Feuille « Planning » conforme au gabarit `public/template.md`. */
const FEUILLE = [
  [
    'Date',
    'Heure',
    'Titre du mémoire',
    'Étudiant·e',
    'Directeur·rice',
    'Jury 2',
    'Jury 3',
    'Salle',
  ],
  [
    '12/01/2026',
    '09:00-10:00',
    'Le corps et la marge',
    'Alice Martin',
    'Pr. Durand',
    'Pr. Petit',
    'Pr. Roy',
    'S12',
  ],
  [
    '2026-01-13',
    '14:00-15:00',
    'Les voix de la ville',
    'Bruno Petit',
    'Pr. Durand',
    'Pr. Blanc',
    'Pr. Noir',
    'S07',
  ],
];

describe('indexerColonnesPlanning', () => {
  it('repère les colonnes du planning', () => {
    const colonnes = indexerColonnesPlanning(FEUILLE[0]);
    expect(colonnes.date).toBe(0);
    expect(colonnes.heure).toBe(1);
    expect(colonnes.titre).toBe(2);
    expect(colonnes.etudiant).toBe(3);
    expect(colonnes.directeur).toBe(4);
    expect(colonnes.jury2).toBe(5);
    expect(colonnes.jury3).toBe(6);
    expect(colonnes.salle).toBe(7);
  });

  it('tolère la casse, les accents et la ponctuation', () => {
    const colonnes = indexerColonnesPlanning([
      'DATE',
      'heure_debut',
      'Titre mémoire',
      'Etudiant',
      'Directeur de mémoire',
      'jury_2',
      'Jury 3',
      'salle',
    ]);
    expect(colonnes.date).toBe(0);
    expect(colonnes.heure).toBe(1);
    expect(colonnes.titre).toBe(2);
    expect(colonnes.etudiant).toBe(3);
    expect(colonnes.directeur).toBe(4);
    expect(colonnes.jury2).toBe(5);
    expect(colonnes.jury3).toBe(6);
    expect(colonnes.salle).toBe(7);
  });

  it('ne confond pas « Heure de fin » et « Heure de début »', () => {
    const colonnes = indexerColonnesPlanning(['Date', 'Heure de fin', 'Heure de début']);
    expect(colonnes.heure).toBe(2);
    expect(colonnes.heureFin).toBe(1);
  });
});

describe('ajouterMinutes', () => {
  it('ajoute les minutes', () => {
    expect(ajouterMinutes('09:00', 60)).toBe('10:00');
  });

  it('ne dépasse pas la fin de journée', () => {
    expect(ajouterMinutes('23:30', 60)).toBe('23:59');
  });
});

describe('analyserFeuillePlanning', () => {
  it('lit les soutenances et les trie chronologiquement', () => {
    const resultat = analyserFeuillePlanning(FEUILLE);
    expect(resultat.invalides).toHaveLength(0);
    expect(resultat.valides).toHaveLength(2);
    expect(resultat.valides[0]?.date).toBe('2026-01-12');
    expect(resultat.valides[0]?.heureDebut).toBe('09:00');
    expect(resultat.valides[0]?.titre).toBe('Le corps et la marge');
    expect(resultat.valides[0]?.salle).toBe('S12');
  });

  it("lit la plage d'heures « HH:mm-HH:mm »", () => {
    const resultat = analyserFeuillePlanning(FEUILLE);
    expect(resultat.valides[0]?.heureDebut).toBe('09:00');
    expect(resultat.valides[0]?.heureFin).toBe('10:00');
  });

  it("déduit une durée d'une heure quand seule l'heure de début est fournie", () => {
    const resultat = analyserFeuillePlanning([
      FEUILLE[0],
      ['12/01/2026', '09:00', 'Titre', 'Étudiant', 'Directeur', 'J2', 'J3', 'S1'],
    ]);
    expect(resultat.valides[0]?.heureDebut).toBe('09:00');
    expect(resultat.valides[0]?.heureFin).toBe('10:00');
  });

  it('rejette une date invalide', () => {
    const resultat = analyserFeuillePlanning([
      FEUILLE[0],
      ['32/01/2026', '09:00', 'Titre', 'Étudiant', 'Directeur', 'J2', 'J3', 'S1'],
    ]);
    expect(resultat.valides).toHaveLength(0);
    expect(resultat.invalides).toHaveLength(1);
    expect(resultat.invalides[0]?.erreur).toContain('Date invalide');
  });

  it('rejette une heure invalide', () => {
    const resultat = analyserFeuillePlanning([
      FEUILLE[0],
      ['12/01/2026', 'pas une heure', 'Titre', 'Étudiant', 'Directeur', 'J2', 'J3', 'S1'],
    ]);
    expect(resultat.valides).toHaveLength(0);
    expect(resultat.invalides[0]?.erreur).toContain('Heure invalide');
  });

  it('ignore les lignes vides', () => {
    const resultat = analyserFeuillePlanning([FEUILLE[0], ['', '', '', '', '', '', '', '']]);
    expect(resultat.valides).toHaveLength(0);
    expect(resultat.invalides).toHaveLength(0);
  });

  it('échoue si les colonnes attendues sont absentes', () => {
    expect(() =>
      analyserFeuillePlanning([
        ['foo', 'bar'],
        ['a', 'b'],
      ]),
    ).toThrow(MESSAGE_COLONNES_PLANNING);
  });
});

describe('analyserPlageHeure', () => {
  it('lit une plage « HH:mm-HH:mm »', () => {
    const resultat = analyserPlageHeure('09:00-10:00');
    expect(resultat.ok).toBe(true);
    expect(resultat.ok && resultat.valeur).toEqual({ debut: '09:00', fin: '10:00' });
  });

  it('tolère les espaces autour du séparateur', () => {
    const resultat = analyserPlageHeure('09:00 - 10:30');
    expect(resultat.ok && resultat.valeur).toEqual({ debut: '09:00', fin: '10:30' });
  });

  it('tolère les tirets demi-cadratin et cadratin', () => {
    const resultat = analyserPlageHeure('09:00–10:00');
    expect(resultat.ok && resultat.valeur).toEqual({ debut: '09:00', fin: '10:00' });
  });

  it('accepte une heure simple sans heure de fin', () => {
    const resultat = analyserPlageHeure('09:00');
    expect(resultat.ok && resultat.valeur).toEqual({ debut: '09:00' });
  });

  it('rejette une plage mal formée', () => {
    const resultat = analyserPlageHeure('09:00-10:00-11:00');
    expect(resultat.ok).toBe(false);
  });

  it('rejette une heure illisible', () => {
    const resultat = analyserPlageHeure('pas une heure');
    expect(resultat.ok).toBe(false);
  });
});

describe('comparerSoutenances', () => {
  it('ordonne par date puis heure', () => {
    const base = {
      date: '2026-01-12',
      heureDebut: '09:00',
      heureFin: '10:00',
      titre: '',
      etudiant: '',
      directeur: '',
      jury2: '',
      jury3: '',
      salle: '',
    };
    expect(comparerSoutenances(base, { ...base, date: '2026-01-13' })).toBeLessThan(0);
    expect(comparerSoutenances(base, { ...base, heureDebut: '10:00' })).toBeLessThan(0);
    expect(comparerSoutenances(base, { ...base })).toBe(0);
  });
});
