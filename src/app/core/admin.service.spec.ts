import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminService, MESSAGE_ADMIN_REQUIS } from './admin.service';
import { AuthService, type Utilisateur } from './auth.service';
import { FIRESTORE_BACKEND, type FirestoreBackend } from './firestore.backend';

const ADMIN: Utilisateur = {
  uid: 'uid-firebase',
  displayName: 'Administrateur',
  session: 'firebase',
};

const ANON: Utilisateur = {
  uid: 'anon_85209162cfd3',
  displayName: 'Pauline',
  session: 'nom',
};

class FauxAuthService {
  readonly user = signal<Utilisateur | null>(null);
  readonly sessionAdmin = signal<Utilisateur | null>(null);
}

function creerFauxBackend(admin: boolean): FirestoreBackend {
  return {
    configure: true,
    ecouterCreneaux: vi.fn(() => () => undefined),
    ecouterDispos: vi.fn(() => () => undefined),
    setDispo: vi.fn(async () => undefined),
    deleteDispo: vi.fn(async () => undefined),
    lireIdsDispos: vi.fn(async () => []),
    upsertDispos: vi.fn(async () => 0),
    setProfil: vi.fn(async () => undefined),
    lireProfil: vi.fn(async () => null),
    listerIdsCreneaux: vi.fn(async () => []),
    upsertCreneaux: vi.fn(async () => 0),
    supprimerTousCreneaux: vi.fn(async () => 0),
    supprimerToutesDispos: vi.fn(async () => 0),
    estAdmin: vi.fn(async () => admin),
    creerAdmin: vi.fn(async () => undefined),
    listerProfils: vi.fn(async () => []),
    upsertProfils: vi.fn(async () => 0),
    lireToutesDispos: vi.fn(async () => []),
  };
}

describe('AdminService', () => {
  let auth: FauxAuthService;

  function preparer(admin: boolean): void {
    auth = new FauxAuthService();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: FIRESTORE_BACKEND, useValue: creerFauxBackend(admin) },
      ],
    });
  }

  beforeEach(() => {
    preparer(true);
  });

  it('refuse toute session « nom seul » (cookie)', async () => {
    auth.user.set(ANON);
    const service = TestBed.inject(AdminService);

    expect(service.uid()).toBeNull();
    expect(await service.verifier(null)).toBe(false);
    expect(service.autorise()).toBe(false);
  });

  it('autorise une session Firebase inscrite dans admins', async () => {
    auth.sessionAdmin.set(ADMIN);
    const service = TestBed.inject(AdminService);

    expect(await service.verifier(ADMIN.uid)).toBe(true);
    expect(service.autorise()).toBe(true);
    expect(service.verifie()).toBe(true);
  });

  it('refuse une session Firebase absente de admins', async () => {
    preparer(false);
    auth.sessionAdmin.set(ADMIN);
    const service = TestBed.inject(AdminService);

    expect(await service.verifier(ADMIN.uid)).toBe(false);
    expect(service.autorise()).toBe(false);
  });

  it('expose un message de refus français', () => {
    expect(MESSAGE_ADMIN_REQUIS).toBe('Accès réservé à un administrateur');
  });

  it('autorise la session ouverte par mot de passe (création de admins/{uid})', async () => {
    auth.sessionAdmin.set(ADMIN);
    const service = TestBed.inject(AdminService);

    await service.autoriserParMotDePasse(ADMIN.uid, 'abc123');

    expect(service.autorise()).toBe(true);
    expect(service.verifie()).toBe(true);
  });

  it('propage le refus des règles quand l’empreinte est incorrecte', async () => {
    preparer(false);
    auth.sessionAdmin.set(ADMIN);
    const backend = TestBed.inject(FIRESTORE_BACKEND);
    vi.mocked(backend.creerAdmin).mockRejectedValueOnce(new Error('permission-denied'));
    const service = TestBed.inject(AdminService);

    await expect(service.autoriserParMotDePasse(ADMIN.uid, 'mauvaise')).rejects.toThrow();
    expect(service.autorise()).toBe(false);
  });

  it('ouvre l’accès malgré l’échec d’écriture si la fiche admins existe déjà', async () => {
    preparer(true);
    auth.sessionAdmin.set(ADMIN);
    const backend = TestBed.inject(FIRESTORE_BACKEND);
    vi.mocked(backend.creerAdmin).mockRejectedValueOnce(new Error('permission-denied'));
    const service = TestBed.inject(AdminService);

    await service.autoriserParMotDePasse(ADMIN.uid, 'abc123');

    expect(service.autorise()).toBe(true);
    expect(service.verifie()).toBe(true);
  });
});
