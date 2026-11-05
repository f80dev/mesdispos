import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AttributionService,
  MAX_CREENEAUX_PAR_PROF,
  MESSAGE_AUCUN_PROF,
  choisirCreneaux,
  parserLogins,
} from './attribution.service';
import { CreneauService } from './creneau.service';
import { ProfService, type Prof } from './prof.service';
import { FIRESTORE_BACKEND, type FirestoreBackend } from '../core/firestore.backend';
import type { Creneau } from './models';

const CRENEAU_1: Creneau = {
  id: '2026-01-12_0845_0930',
  date: '2026-01-12',
  heureDebut: '08:45',
  heureFin: '09:30',
  libelle: 'Audition A1',
};

const CRENEAU_2: Creneau = {
  id: '2026-01-12_1400_1500',
  date: '2026-01-12',
  heureDebut: '14:00',
  heureFin: '15:00',
};

const CRENEAU_3: Creneau = {
  id: '2026-01-13_0900_1000',
  date: '2026-01-13',
  heureDebut: '09:00',
  heureFin: '10:00',
};

const PROFS: Prof[] = [
  {
    login: 'judith.abensour',
    prenom: 'Judith',
    nom: 'ABENSOUR',
    nomComplet: 'Judith ABENSOUR',
    subjects: ['DESSIN'],
  },
  {
    login: 'paul.dupont',
    prenom: 'Paul',
    nom: 'DUPONT',
    nomComplet: 'Paul DUPONT',
    subjects: [],
  },
];

/** Faux `ProfService` : la liste Oasis est déjà chargée. */
class FauxProfService {
  readonly profs = signal<Prof[]>(PROFS);
  readonly chargement = signal<boolean>(false);
  readonly erreur = signal<string | null>(null);
  readonly charger = vi.fn(async () => undefined);
}

/** Faux `CreneauService` : les créneaux proposés sont déjà chargés. */
class FauxCreneauService {
  readonly creneaux = signal<Creneau[]>([CRENEAU_1, CRENEAU_2, CRENEAU_3]);
}

/** Faux `FirestoreBackend` : les écritures sont capturées. */
function creerFauxBackend(): FirestoreBackend & {
  upsertDisposMock: ReturnType<typeof vi.fn>;
  setProfilMock: ReturnType<typeof vi.fn>;
  lireIdsDisposMock: ReturnType<typeof vi.fn>;
} {
  const upsertDisposMock = vi.fn(async (items: ReadonlyArray<unknown>) => items.length);
  const setProfilMock = vi.fn(async () => undefined);
  const lireIdsDisposMock = vi.fn(async () => [] as string[]);
  return {
    configure: true,
    ecouterCreneaux: vi.fn(() => () => undefined),
    ecouterDispos: vi.fn(() => () => undefined),
    setDispo: vi.fn(async () => undefined),
    deleteDispo: vi.fn(async () => undefined),
    lireIdsDispos: lireIdsDisposMock as unknown as FirestoreBackend['lireIdsDispos'],
    upsertDispos: upsertDisposMock as unknown as FirestoreBackend['upsertDispos'],
    setProfil: setProfilMock as unknown as FirestoreBackend['setProfil'],
    lireProfil: vi.fn(async () => null),
    listerIdsCreneaux: vi.fn(async () => []),
    upsertCreneaux: vi.fn(async () => 0),
    supprimerTousCreneaux: vi.fn(async () => 0),
    supprimerToutesDispos: vi.fn(async () => 0),
    estAdmin: vi.fn(async () => false),
    upsertDisposMock,
    setProfilMock,
    lireIdsDisposMock,
  } as unknown as FirestoreBackend & {
    upsertDisposMock: ReturnType<typeof vi.fn>;
    setProfilMock: ReturnType<typeof vi.fn>;
    lireIdsDisposMock: ReturnType<typeof vi.fn>;
  };
}

/** Aléa déterministe : renvoie toujours le maximum (aucune permutation). */
const aleaConstante = () => 0.999;

describe('parserLogins', () => {
  it('découpe sur les espaces, newlines, virgules et points-virgules', () => {
    expect(parserLogins('a.b, c.d;e.f\ng.h')).toEqual(['a.b', 'c.d', 'e.f', 'g.h']);
  });

  it('normalise la casse et supprime les doublons', () => {
    expect(parserLogins('  A.B \n a.b ')).toEqual(['a.b']);
  });

  it('renvoie une liste vide pour une saisie vide', () => {
    expect(parserLogins('')).toEqual([]);
    expect(parserLogins(null)).toEqual([]);
    expect(parserLogins(undefined)).toEqual([]);
  });
});

describe('choisirCreneaux', () => {
  it('tire les créneaux demandés au hasard parmi les disponibles', () => {
    const tires = choisirCreneaux([CRENEAU_1, CRENEAU_2, CRENEAU_3], [], 2, () => 0);

    expect(tires).toHaveLength(2);
    expect(tires.map((c) => c.id).sort()).toEqual([CRENEAU_2.id, CRENEAU_3.id]);
  });

  it('tire sans remise : un créneau au plus une fois', () => {
    const tires = choisirCreneaux([CRENEAU_1, CRENEAU_2, CRENEAU_3], [], 3, () => 0);

    expect(new Set(tires.map((c) => c.id)).size).toBe(3);
  });

  it('exclut les créneaux déjà retenus par le professeur', () => {
    const tires = choisirCreneaux(
      [CRENEAU_1, CRENEAU_2, CRENEAU_3],
      [CRENEAU_1.id],
      2,
      aleaConstante,
    );

    expect(tires.map((c) => c.id)).toEqual([CRENEAU_2.id, CRENEAU_3.id]);
  });

  it('renvoie moins de créneaux que demandé s’il n’en reste pas assez', () => {
    expect(choisirCreneaux([CRENEAU_1], [], 5, aleaConstante)).toEqual([CRENEAU_1]);
  });
});

describe('AttributionService', () => {
  let service: AttributionService;
  let backend: ReturnType<typeof creerFauxBackend>;

  beforeEach(() => {
    backend = creerFauxBackend();
    TestBed.configureTestingModule({
      providers: [
        AttributionService,
        { provide: ProfService, useValue: new FauxProfService() },
        { provide: CreneauService, useValue: new FauxCreneauService() },
        { provide: FIRESTORE_BACKEND, useValue: backend },
      ],
    });
    service = TestBed.inject(AttributionService);
  });

  it('résout les logins connus et ignore la casse', async () => {
    const plan = await service.preparer('JUDITH.ABENSOUR', 2);

    expect(plan).not.toBeNull();
    expect(plan?.cibles).toHaveLength(1);
    expect(plan?.cibles[0]?.login).toBe('judith.abensour');
    expect(plan?.cibles[0]?.nomComplet).toBe('Judith ABENSOUR');
    expect(plan?.cibles[0]?.creneaux).toHaveLength(2);
  });

  it('signale les logins inconnus sans faire échouer le plan', async () => {
    const plan = await service.preparer('judith.abensour, inconnu.x', 1);

    expect(plan?.cibles).toHaveLength(1);
    expect(plan?.inconnus).toEqual(['inconnu.x']);
  });

  it('refuse un plan sans aucun professeur résolu', async () => {
    const plan = await service.preparer('inconnu.x', 1);

    expect(plan).toBeNull();
    expect(service.erreur()).toBe(MESSAGE_AUCUN_PROF);
  });

  it('refuse un nombre de créneaux hors bornes', async () => {
    expect(await service.preparer('judith.abensour', 0)).toBeNull();
    expect(await service.preparer('judith.abensour', MAX_CREENEAUX_PAR_PROF + 1)).toBeNull();
    expect(service.erreur()).toContain('entre 1');
  });

  it('exclut les créneaux déjà retenus par le professeur', async () => {
    backend.lireIdsDisposMock.mockResolvedValueOnce([CRENEAU_1.id]);

    const plan = await service.preparer('judith.abensour', 2, false, aleaConstante);

    expect(plan?.cibles[0]?.dejaRetenus).toBe(1);
    expect(plan?.cibles[0]?.creneaux.map((c) => c.id).sort()).toEqual([CRENEAU_2.id, CRENEAU_3.id]);
  });

  it('tire les créneaux au hasard pour chaque professeur', async () => {
    const plan = await service.preparer('judith.abensour', 1, false, () => 0);

    expect(plan?.cibles[0]?.creneaux).toHaveLength(1);
    expect(plan?.cibles[0]?.creneaux[0]?.id).not.toBe(CRENEAU_1.id);
  });

  it('écrit les mêmes documents qu’un clic du professeur', async () => {
    const plan = await service.preparer('judith.abensour', 1, false, aleaConstante);
    expect(plan).not.toBeNull();

    const ecrits = await service.appliquer(plan);

    expect(ecrits).toBe(1);
    expect(backend.upsertDisposMock).toHaveBeenCalledTimes(1);
    const items = backend.upsertDisposMock.mock.calls[0]?.[0] as Array<{
      uid: string;
      id: string;
      data: Record<string, unknown>;
    }>;
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(CRENEAU_1.id);
    expect(items[0]?.uid).toMatch(/^anon_[0-9a-f]{12}$/);
    expect(items[0]?.data).toMatchObject({
      creneauId: CRENEAU_1.id,
      date: '2026-01-12',
      heureDebut: '08:45',
      heureFin: '09:30',
      libelle: 'Audition A1',
      login: 'judith.abensour',
      nom: 'ABENSOUR',
      prenom: 'Judith',
    });
    expect(typeof items[0]?.data['updatedAt']).toBe('number');
  });

  it('écrit le profil du professeur pour chaque partition attribuée', async () => {
    const plan = await service.preparer('judith.abensour, paul.dupont', 1);
    expect(plan).not.toBeNull();

    await service.appliquer(plan);

    expect(backend.setProfilMock).toHaveBeenCalledTimes(2);
    expect(backend.setProfilMock.mock.calls[0]?.[1]).toMatchObject({
      login: 'judith.abensour',
      nom: 'ABENSOUR',
      prenom: 'Judith',
    });
  });

  it('n’écrit rien sans plan', async () => {
    expect(await service.appliquer(null)).toBe(0);
    expect(backend.upsertDisposMock).not.toHaveBeenCalled();
  });

  it('attribue à tous les professeurs de la liste Oasis', async () => {
    const plan = await service.preparer('', 1, true);

    expect(plan).not.toBeNull();
    expect(plan?.cibles.map((c) => c.login)).toEqual(['judith.abensour', 'paul.dupont']);
    expect(plan?.inconnus).toEqual([]);
    expect(plan?.cibles.every((c) => c.creneaux.length === 1)).toBe(true);
  });

  it('ignore les logins saisis quand la cible est l’ensemble des professeurs', async () => {
    const plan = await service.preparer('inconnu.x', 1, true);

    expect(plan?.cibles).toHaveLength(2);
    expect(plan?.inconnus).toEqual([]);
  });

  it('écrit les disponibilités de tous les professeurs', async () => {
    const plan = await service.preparer('', 1, true);
    expect(plan).not.toBeNull();

    const ecrits = await service.appliquer(plan);

    expect(ecrits).toBe(2);
    const items = backend.upsertDisposMock.mock.calls[0]?.[0] as Array<{ uid: string }>;
    expect(new Set(items.map((item) => item.uid)).size).toBe(2);
  });
});
