import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfsImportService } from './profs-import.service';
import { FIRESTORE_BACKEND, type FirestoreBackend } from '../core/firestore.backend';
import { XLSX_BACKEND, type XLSXBackend } from '../core/xlsx.backend';

/** Double XLSX : renvoie le tableau de lignes piloté par `etat.rangees`. */
function creerFauxXLSX(etat: { rangees: unknown[][] }): XLSXBackend {
  return { lire: vi.fn(async () => etat.rangees) };
}

/**
 * Double Firestore : expose `listerProfils` (configurable) et enregistre les
 * écritures via `upsertProfils`.
 */
function creerFauxBackend(etat: { loginsEnBase: string[] }): FirestoreBackend {
  return {
    configure: true,
    listerProfils: vi.fn(async () =>
      etat.loginsEnBase.map((login) => ({ uid: `anon_${login}`, data: { login } })),
    ),
    upsertProfils: vi.fn(async (items) => items.length),
  } as unknown as FirestoreBackend;
}

function fichierFictif(nom = 'profs.xlsx'): File {
  return new File(['contenu'], nom, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const ENTETES = [
  'Identité / Identifiant Oasis',
  'Identité / Nom usuel',
  'Identité / Prénom usuel',
  'Secteur',
];

describe('ProfsImportService.lire', () => {
  let service: ProfsImportService;
  const etatRangees: { rangees: unknown[][] } = { rangees: [] };
  const etatBase: { loginsEnBase: string[] } = { loginsEnBase: [] };

  beforeEach(() => {
    etatRangees.rangees = [];
    etatBase.loginsEnBase = [];
    TestBed.configureTestingModule({
      providers: [
        ProfsImportService,
        { provide: XLSX_BACKEND, useValue: creerFauxXLSX(etatRangees) },
        { provide: FIRESTORE_BACKEND, useValue: creerFauxBackend(etatBase) },
      ],
    });
    service = TestBed.inject(ProfsImportService);
  });

  it("refuse un fichier qui n'est pas .xlsx", async () => {
    await expect(service.lire(fichierFictif('profs.csv'))).rejects.toThrow(
      'Format non pris en charge : utilisez un fichier Excel .xlsx',
    );
  });

  it('lit un fichier valide et renvoie les professeurs', async () => {
    etatRangees.rangees = [ENTETES, ['judith.abensour', 'ABENSOUR', 'Judith', 'Design']];

    const resultat = await service.lire(fichierFictif());

    expect(resultat.valides).toEqual([
      {
        ligne: 2,
        login: 'judith.abensour',
        nom: 'ABENSOUR',
        prenom: 'Judith',
        secteur: 'Design',
      },
    ]);
    expect(resultat.invalides).toEqual([]);
  });

  it('détecte les doublons à l’intérieur du fichier', async () => {
    etatRangees.rangees = [
      ENTETES,
      ['a.b', 'BEL', 'Ana', 'Design'],
      ['a.b', 'BEL', 'Ana', 'Design'],
    ];

    const resultat = await service.lire(fichierFictif());

    expect(resultat.valides).toHaveLength(1);
    expect(resultat.invalides[0]?.erreur).toBe('Doublon dans le fichier.');
  });

  it('détecte les professeurs déjà présents en base', async () => {
    etatBase.loginsEnBase = ['a.b'];
    etatRangees.rangees = [ENTETES, ['a.b', 'BEL', 'Ana', 'Design']];

    const resultat = await service.lire(fichierFictif());

    expect(resultat.valides).toEqual([]);
    expect(resultat.invalides[0]?.erreur).toBe('Professeur déjà présent en base.');
  });

  it('reporte les lignes invalides (login manquant) sans bloquer les autres', async () => {
    etatRangees.rangees = [
      ENTETES,
      ['a.b', 'BEL', 'Ana', 'Design'],
      ['', 'DUR', 'Paul', 'Design'],
    ];

    const resultat = await service.lire(fichierFictif());

    expect(resultat.valides).toHaveLength(1);
    expect(resultat.invalides[0]?.erreur).toBe('Identifiant Oasis manquant.');
  });
});

describe('ProfsImportService.importer', () => {
  let service: ProfsImportService;
  let backend: FirestoreBackend;

  beforeEach(() => {
    backend = creerFauxBackend({ loginsEnBase: [] });
    TestBed.configureTestingModule({
      providers: [
        ProfsImportService,
        { provide: XLSX_BACKEND, useValue: creerFauxXLSX({ rangees: [] }) },
        { provide: FIRESTORE_BACKEND, useValue: backend },
      ],
    });
    service = TestBed.inject(ProfsImportService);
  });

  it('écrit une partition users/{uid} par professeur (uid dérivé du nom)', async () => {
    const { importes } = await service.importer([
      { ligne: 2, login: 'a.b', nom: 'BEL', prenom: 'Ana' },
    ]);

    expect(importes).toBe(1);
    expect(backend.upsertProfils).toHaveBeenCalledTimes(1);
    const items = (backend.upsertProfils as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Array<{
      uid: string;
      data: Record<string, unknown>;
    }>;
    expect(items).toHaveLength(1);
    expect(items[0]?.uid).toMatch(/^anon_[0-9a-f]{12}$/);
    expect(items[0]?.data).toMatchObject({ login: 'a.b', nom: 'BEL', prenom: 'Ana' });
  });

  it('ignore les lignes marquées invalides', async () => {
    const { importes } = await service.importer([
      { ligne: 2, login: 'a.b', nom: 'BEL', prenom: 'Ana' },
      { ligne: 3, login: '', nom: 'DUR', prenom: 'Paul', erreur: 'Identifiant Oasis manquant.' },
    ]);

    expect(importes).toBe(1);
    const items = (backend.upsertProfils as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Array<{
      uid: string;
    }>;
    expect(items).toHaveLength(1);
  });
});
