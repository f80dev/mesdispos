import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginsService } from './logins.service';
import { ProfService, type Prof } from './prof.service';
import { FIRESTORE_BACKEND, type FirestoreBackend, type ProfilAdmin } from '../core/firestore.backend';

/** Faux `ProfService` : la liste de l'annuaire est déjà chargée. */
class FauxProfService {
  readonly profs = signal<Prof[]>([]);
  readonly chargement = signal<boolean>(false);
  readonly erreur = signal<string | null>(null);
  readonly charger = vi.fn(async () => undefined);
}

/** Faux `FirestoreBackend` : l'inventaire `users` est configurable. */
function creerFauxBackend(etat: { profils: ProfilAdmin[] }): FirestoreBackend {
  return {
    configure: true,
    listerProfils: vi.fn(async () => [...etat.profils]),
    upsertProfils: vi.fn(async (items) => items.length),
  } as unknown as FirestoreBackend;
}

describe('LoginsService.charger', () => {
  let service: LoginsService;
  let annuaire: FauxProfService;
  let backend: FirestoreBackend;
  const etat: { profils: ProfilAdmin[] } = { profils: [] };

  beforeEach(() => {
    etat.profils = [];
    annuaire = new FauxProfService();
    backend = creerFauxBackend(etat);
    TestBed.configureTestingModule({
      providers: [
        LoginsService,
        { provide: ProfService, useValue: annuaire },
        { provide: FIRESTORE_BACKEND, useValue: backend },
      ],
    });
    service = TestBed.inject(LoginsService);
  });

  it('liste les logins depuis la collection users quand elle est non vide', async () => {
    etat.profils = [
      { uid: 'anon_a', data: { login: 'a.b', nom: 'BEL', prenom: 'Ana' } },
    ];

    await service.charger();

    expect(service.logins().map((p) => p.login)).toEqual(['a.b']);
    expect(service.source()).toBe('users');
    expect(backend.upsertProfils).not.toHaveBeenCalled();
  });

  it('peuple users depuis l’annuaire quand la collection est vide', async () => {
    annuaire.profs.set([
      { login: 'a.b', nom: 'BEL', prenom: 'Ana', nomComplet: 'Ana BEL', subjects: [] },
    ]);

    await service.charger();

    expect(service.source()).toBe('annuaire');
    expect(service.logins()).toHaveLength(1);
    expect(backend.upsertProfils).toHaveBeenCalledTimes(1);
    const items = (backend.upsertProfils as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Array<{
      uid: string;
      data: Record<string, unknown>;
    }>;
    expect(items).toHaveLength(1);
    expect(items[0]?.uid).toMatch(/^anon_[0-9a-f]{12}$/);
    expect(items[0]?.data).toMatchObject({ login: 'a.b', nom: 'BEL', prenom: 'Ana' });
  });

  it('ne recharge pas la liste si elle a déjà été chargée', async () => {
    etat.profils = [{ uid: 'anon_a', data: { login: 'a.b', nom: 'BEL', prenom: 'Ana' } }];

    await service.charger();
    await service.charger();

    expect(backend.listerProfils).toHaveBeenCalledTimes(1);
  });
});
