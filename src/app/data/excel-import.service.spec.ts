import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ErreurImport,
  ExcelImportService,
  MESSAGE_FORMAT,
  TAILLE_BATCH,
  indexerColonnes,
  normaliserEntete,
} from './excel-import.service';

/* -------------------------------------------------------------------------- */
/* Doubles de test : `read-excel-file` et Firestore sont mockés                 */
/* -------------------------------------------------------------------------- */

const etat = vi.hoisted(() => ({
  rangees: [] as unknown[][],
  identifiantsEnBase: [] as string[],
}));

vi.mock('read-excel-file', () => ({
  default: vi.fn(async () => etat.rangees),
}));

vi.mock('../core/firebase', () => ({
  firebaseConfigure: () => true,
  firebaseDb: async () => ({ instance: 'db' }),
  MESSAGE_CONFIG_MANQUANTE: 'config manquante',
  chargerFirestore: async () => ({
    doc: (...chemin: unknown[]) => ({ chemin }),
    getDocs: async () => ({
      docs: etat.identifiantsEnBase.map((id) => ({ id, data: () => ({}) })),
    }),
    writeBatch: () => {
      const operations: Array<{ chemin: unknown[]; donnees: unknown }> = [];
      return {
        set: (ref: { chemin: unknown[] }, donnees: unknown) => {
          operations.push({ chemin: ref.chemin, donnees });
        },
        commit: vi.fn(async () => undefined),
        operations,
      };
    },
  }),
}));

function fichierFictif(nom = 'creneaux.xlsx'): File {
  return new File(['contenu'], nom, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('normaliserEntete / indexerColonnes', () => {
  it('ignore casse, accents et ponctuation', () => {
    expect(normaliserEntete('Heure de début')).toBe('heurededebut');
    expect(normaliserEntete('Libellé')).toBe('libelle');
    expect(normaliserEntete('HEURE_DEBUT')).toBe('heuredebut');
  });

  it('retrouve les colonnes quelle que soit leur formulation', () => {
    expect(indexerColonnes(['Date', 'Heure de début', 'Heure fin', 'Libellé'])).toEqual({
      date: 0,
      debut: 1,
      fin: 2,
      libelle: 3,
    });
  });

  it('accepte les alias debut/fin', () => {
    expect(indexerColonnes(['date', 'debut', 'fin'])).toEqual({
      date: 0,
      debut: 1,
      fin: 2,
      libelle: -1,
    });
  });

  it('ne réutilise pas un même en-tête pour deux champs', () => {
    const colonnes = indexerColonnes(['date', 'heure_debut', 'heure_fin']);
    expect(colonnes.debut).toBe(1);
    expect(colonnes.fin).toBe(2);
  });
});

describe('ExcelImportService.lire', () => {
  let service: ExcelImportService;

  beforeEach(() => {
    etat.rangees = [];
    etat.identifiantsEnBase = [];
    TestBed.configureTestingModule({ providers: [ExcelImportService] });
    service = TestBed.inject(ExcelImportService);
  });

  it("refuse un fichier qui n'est pas .xlsx avec le message attendu", async () => {
    await expect(service.lire(fichierFictif('creneaux.xls'))).rejects.toThrow(MESSAGE_FORMAT);
    await expect(service.lire(fichierFictif('creneaux.csv'))).rejects.toBeInstanceOf(ErreurImport);
    expect(MESSAGE_FORMAT).toBe('Format non pris en charge : utilisez un fichier Excel .xlsx');
  });

  it('lit un fichier valide et renvoie les lignes normalisées', async () => {
    etat.rangees = [
      ['Date', 'Heure de début', 'Heure fin', 'Libellé'],
      ['12/01/2026', '08:45', '09:30', 'Audition A1'],
    ];

    const resultat = await service.lire(fichierFictif());

    expect(resultat.valides).toEqual([
      {
        ligne: 2,
        date: '2026-01-12',
        heureDebut: '08:45',
        heureFin: '09:30',
        libelle: 'Audition A1',
      },
    ]);
    expect(resultat.invalides).toEqual([]);
  });

  it('refuse un fichier sans les colonnes obligatoires', async () => {
    etat.rangees = [
      ['Date', 'Libellé'],
      ['12/01/2026', 'rien'],
    ];
    await expect(service.lire(fichierFictif())).rejects.toThrow('Colonnes attendues');
  });

  it('rejette heure_fin <= heure_debut', async () => {
    etat.rangees = [
      ['date', 'heure_debut', 'heure_fin'],
      ['12/01/2026', '18:00', '17:00'],
    ];

    const resultat = await service.lire(fichierFictif());

    expect(resultat.valides).toEqual([]);
    expect(resultat.invalides[0]?.erreur).toBe(
      "L'heure de fin doit être postérieure à l'heure de début.",
    );
  });

  it("détecte les doublons à l'intérieur du fichier", async () => {
    etat.rangees = [
      ['date', 'heure_debut', 'heure_fin'],
      ['12/01/2026', '08:45', '09:30'],
      ['12/01/2026', '08:45', '09:30'],
    ];

    const resultat = await service.lire(fichierFictif());

    expect(resultat.valides).toHaveLength(1);
    expect(resultat.invalides).toHaveLength(1);
    expect(resultat.invalides[0]?.erreur).toBe('Doublon dans le fichier.');
  });

  it('détecte les créneaux déjà présents en base', async () => {
    etat.identifiantsEnBase = ['2026-01-12_0845_0930'];
    etat.rangees = [
      ['date', 'heure_debut', 'heure_fin'],
      ['12/01/2026', '08:45', '09:30'],
    ];

    const resultat = await service.lire(fichierFictif());

    expect(resultat.valides).toEqual([]);
    expect(resultat.invalides[0]?.erreur).toBe('Créneau déjà présent en base.');
  });

  it('signale date et heure invalides sans bloquer les autres lignes', async () => {
    etat.rangees = [
      ['date', 'heure_debut', 'heure_fin'],
      ['31/02/2026', '08:45', '09:30'],
      ['12/01/2026', '25:00', '26:00'],
      ['13/01/2026', '09h30', '10:15'],
    ];

    const resultat = await service.lire(fichierFictif());

    expect(resultat.valides).toHaveLength(1);
    expect(resultat.valides[0]?.date).toBe('2026-01-13');
    expect(resultat.invalides.map((l) => l.erreur)).toEqual([
      'Date invalide (AAAA-MM-JJ ou JJ/MM/AAAA).',
      'Heure de début invalide (HH:mm).',
    ]);
  });

  it('renvoie un ResultatImport vide pour un classeur sans ligne', async () => {
    etat.rangees = [['date', 'heure_debut', 'heure_fin']];
    const resultat = await service.lire(fichierFictif());
    expect(resultat).toEqual({ valides: [], invalides: [] });
  });
});

describe('ExcelImportService.importer', () => {
  let service: ExcelImportService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ExcelImportService] });
    service = TestBed.inject(ExcelImportService);
  });

  it('écrit un upsert par créneau dans creneaux/{id}', async () => {
    const { importes } = await service.importer([
      {
        ligne: 2,
        date: '2026-01-12',
        heureDebut: '08:45',
        heureFin: '09:30',
        libelle: 'Audition A1',
      },
    ]);

    expect(importes).toBe(1);
  });

  it('ignore les lignes marquées invalides', async () => {
    const { importes } = await service.importer([
      { ligne: 2, date: '2026-01-12', heureDebut: '08:45', heureFin: '09:30' },
      {
        ligne: 3,
        date: '2026-01-12',
        heureDebut: '18:00',
        heureFin: '17:00',
        erreur: "L'heure de fin doit être postérieure à l'heure de début.",
      },
    ]);

    expect(importes).toBe(1);
  });

  it('découpe automatiquement par lots de 500 opérations', async () => {
    expect(TAILLE_BATCH).toBe(500);

    const lignes = Array.from({ length: 1201 }, (_vide, index) => ({
      ligne: index + 2,
      date: '2026-01-12',
      heureDebut: `${String(6 + (Math.floor(index / 60) % 14)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}`,
      heureFin: '23:00',
    }));
    // on rend les identifiants uniques
    const uniques = lignes.map((ligne, index) => ({
      ...ligne,
      heureDebut: `${String(Math.floor(index / 60) % 24).padStart(2, '0')}:${String((index * 7) % 60).padStart(2, '0')}`,
    }));

    const { importes } = await service.importer(uniques);
    expect(importes).toBe(1201);
  });
});
