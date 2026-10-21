import { beforeEach, describe, expect, it } from 'vitest';

import {
  LONGUEUR_NOM_MAX,
  grouperParJour,
  libelleCreneauAccessible,
  libelleHeure,
  normaliserNom,
  normalizeDate,
  normalizeHeure,
  trierCreneaux,
  validerNom,
} from './date.util';

/** Cellule Excel « 12/01/2026 » : `read-excel-file` renvoie un Date à minuit UTC. */
function dateExcel(annee: number, mois: number, jour: number): Date {
  return new Date(Date.UTC(annee, mois - 1, jour));
}

/** Cellule Excel « 08:45 » : base 1899-12-30, heure UTC. */
function heureExcel(heures: number, minutes: number): Date {
  return new Date(Date.UTC(1899, 11, 30, heures, minutes));
}

describe('normaliserNom / validerNom', () => {
  it('applique trim + collapse des espaces', () => {
    expect(normaliserNom('  Marie   Curie  ')).toBe('Marie Curie');
  });

  it('remplace les espaces insécables', () => {
    expect(normaliserNom('Marie Curie')).toBe('Marie Curie');
  });

  it('tolère null/undefined', () => {
    expect(normaliserNom(null)).toBe('');
    expect(normaliserNom(undefined)).toBe('');
  });

  it('refuse un nom vide avec un message français', () => {
    const resultat = validerNom('   ');
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.erreur).toContain('Saisissez');
    }
  });

  it('refuse un nom de plus de 50 caractères', () => {
    const resultat = validerNom('x'.repeat(LONGUEUR_NOM_MAX + 1));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.erreur).toContain('50');
    }
  });

  it('accepte exactement 50 caractères', () => {
    expect(validerNom('x'.repeat(LONGUEUR_NOM_MAX)).ok).toBe(true);
  });
});

describe('normalizeDate', () => {
  it('lit une cellule Excel Date en UTC (12 janvier, quel que soit le fuseau)', () => {
    const resultat = normalizeDate(dateExcel(2026, 1, 12));
    expect(resultat).toEqual({ ok: true, valeur: '2026-01-12' });
  });

  it('lit une chaîne JJ/MM/AAAA', () => {
    expect(normalizeDate('12/01/2026')).toEqual({ ok: true, valeur: '2026-01-12' });
  });

  it('lit une chaîne AAAA-MM-JJ, suffixe horaire ignoré', () => {
    expect(normalizeDate('2026-01-12')).toEqual({ ok: true, valeur: '2026-01-12' });
    expect(normalizeDate('2026-01-12 08:45')).toEqual({ ok: true, valeur: '2026-01-12' });
    expect(normalizeDate('2026-01-12T08:45:00')).toEqual({ ok: true, valeur: '2026-01-12' });
  });

  it('lit un numéro de série Excel', () => {
    // 46037 = 15/01/2026 dans le calendrier Excel (base 1900-01-01 avec le bug d'année bissextile 1900).
    expect(normalizeDate(46037)).toEqual({ ok: true, valeur: '2026-01-15' });
  });

  it('rejette une date de calendrier inexistante', () => {
    expect(normalizeDate('31/02/2026').ok).toBe(false);
    expect(normalizeDate('2026-13-01').ok).toBe(false);
    expect(normalizeDate(new Date('nawak')).ok).toBe(false);
  });

  it('rejette une valeur illisible avec un message français', () => {
    const resultat = normalizeDate('demain');
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.erreur).toBe('Date invalide.');
    }
  });
});

describe('normalizeHeure', () => {
  it('lit une cellule Excel Date sur la base 1899-12-30', () => {
    expect(normalizeHeure(heureExcel(8, 45))).toEqual({ ok: true, valeur: '08:45' });
  });

  it('lit HH:mm et HH:mm:ss', () => {
    expect(normalizeHeure('08:45')).toEqual({ ok: true, valeur: '08:45' });
    expect(normalizeHeure('08:45:00')).toEqual({ ok: true, valeur: '08:45' });
  });

  it('lit HHhmm et HHmm', () => {
    expect(normalizeHeure('08h45')).toEqual({ ok: true, valeur: '08:45' });
    expect(normalizeHeure('0845')).toEqual({ ok: true, valeur: '08:45' });
  });

  it('lit une fraction de journée Excel', () => {
    expect(normalizeHeure(8.45 / 24)).toEqual({ ok: true, valeur: '08:27' });
  });

  it('rejette les heures hors plage', () => {
    expect(normalizeHeure('24:00').ok).toBe(false);
    expect(normalizeHeure('08:75').ok).toBe(false);
    expect(normalizeHeure(1.5).ok).toBe(false);
  });

  it('rejette une valeur illisible avec un message français', () => {
    const resultat = normalizeHeure('demain');
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.erreur).toBe('Heure invalide.');
    }
  });
});

describe('trierCreneaux', () => {
  const base = [
    { id: 'c', date: '2026-01-13', heureDebut: '08:00', heureFin: '09:00' },
    { id: 'a', date: '2026-01-12', heureDebut: '10:00', heureFin: '11:00' },
    { id: 'b', date: '2026-01-12', heureDebut: '08:45', heureFin: '09:30' },
  ];

  it('trie par date puis heure de début', () => {
    expect(trierCreneaux(base).map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it("ne mute pas la liste d'entrée", () => {
    const copie = [...base];
    trierCreneaux(base);
    expect(base).toEqual(copie);
  });

  it("conserve l'ordre des éléments ex æquo", () => {
    const exAequo = [
      { id: '1', date: '2026-01-12', heureDebut: '08:45', heureFin: '09:30' },
      { id: '2', date: '2026-01-12', heureDebut: '08:45', heureFin: '09:30' },
    ];
    expect(trierCreneaux(exAequo).map((c) => c.id)).toEqual(['1', '2']);
  });

  it("départage sur l'heure de fin", () => {
    const memeDebut = [
      { id: 'long', date: '2026-01-12', heureDebut: '08:45', heureFin: '10:30' },
      { id: 'court', date: '2026-01-12', heureDebut: '08:45', heureFin: '09:30' },
    ];
    expect(trierCreneaux(memeDebut).map((c) => c.id)).toEqual(['court', 'long']);
  });
});

describe('grouperParJour', () => {
  it('regroupe par date en conservant le tri interne', () => {
    const groupes = grouperParJour([
      { id: 'b', date: '2026-01-12', heureDebut: '10:00', heureFin: '11:00' },
      { id: 'a', date: '2026-01-12', heureDebut: '08:45', heureFin: '09:30' },
      { id: 'c', date: '2026-01-13', heureDebut: '08:00', heureFin: '09:00' },
    ]);
    expect(groupes.map((g) => g.date)).toEqual(['2026-01-12', '2026-01-13']);
    expect(groupes[0]?.creneaux.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe("libellés d'accessibilité", () => {
  beforeEach(() => {
    // L'implémentation de test doit figer le fuseau : le libellé attendu est en français.
  });

  it('formate une heure en typographie française', () => {
    expect(libelleHeure('08:45')).toBe('8 h 45');
    expect(libelleHeure('09:05')).toBe('9 h 05');
  });

  it('produit le libellé exigé par F3', () => {
    expect(
      libelleCreneauAccessible(
        { date: '2026-01-12', heureDebut: '08:45', heureFin: '09:30' },
        false,
      ),
    ).toBe('Disponible lundi 12 janvier de 8 h 45 à 9 h 30');
  });

  it('bascule en « Retenu » pour un créneau déjà choisi', () => {
    expect(
      libelleCreneauAccessible(
        { date: '2026-01-12', heureDebut: '08:45', heureFin: '09:30' },
        true,
      ),
    ).toMatch(/^Retenu /);
  });

  it('renvoie la date brute si elle est illisible', () => {
    expect(
      libelleCreneauAccessible({ date: 'nawak', heureDebut: '08:45', heureFin: '09:30' }, false),
    ).toContain('nawak');
  });
});
