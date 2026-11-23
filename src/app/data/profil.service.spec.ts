import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import {
  profilDepuisProf,
  profilDepuisSaisieLibre,
  ProfilService,
  versProfil,
} from './profil.service';
import { FIRESTORE_BACKEND, type FirestoreBackend } from '../core/firestore.backend';

describe('profilDepuisProf', () => {
  it('reprend le login, le nom et le prénom de l’enseignant', () => {
    const profil = profilDepuisProf({
      login: 'judith.abensour',
      nom: 'ABENSOUR',
      prenom: 'Judith',
    });
    expect(profil.login).toBe('judith.abensour');
    expect(profil.nom).toBe('ABENSOUR');
    expect(profil.prenom).toBe('Judith');
    expect(typeof profil.updatedAt).toBe('number');
  });

  it('normalise les espaces superflus', () => {
    const profil = profilDepuisProf({ login: ' a.b ', nom: ' DURAND ', prenom: ' Paul ' });
    expect(profil.login).toBe('a.b');
    expect(profil.nom).toBe('DURAND');
    expect(profil.prenom).toBe('Paul');
  });
});

describe('profilDepuisSaisieLibre', () => {
  it('ne renseigne ni le login ni le nom', () => {
    const profil = profilDepuisSaisieLibre(' Pauline ');
    expect(profil.login).toBe('');
    expect(profil.nom).toBe('');
    expect(profil.prenom).toBe('Pauline');
  });
});

describe('versProfil', () => {
  it('lit un document users/{uid}', () => {
    expect(
      versProfil({ login: 'pauline.dupont', nom: 'DUPONT', prenom: 'Pauline', updatedAt: 12 }),
    ).toEqual({ login: 'pauline.dupont', nom: 'DUPONT', prenom: 'Pauline', updatedAt: 12 });
  });

  it('renvoie null pour un document absent ou vide', () => {
    expect(versProfil(null)).toBeNull();
    expect(versProfil({})).toBeNull();
  });

  it('tolère un horodatage absent ou invalide', () => {
    expect(versProfil({ prenom: 'Pauline', updatedAt: 'hier' })?.updatedAt).toBe(0);
  });

  it('lit la capacité « soutenance en anglais »', () => {
    expect(versProfil({ prenom: 'Pauline', soutenanceAnglais: true })?.soutenanceAnglais).toBe(
      true,
    );
    expect(versProfil({ prenom: 'Pauline' })?.soutenanceAnglais).toBeUndefined();
  });

  it('reconnaît un profil ne portant que la capacité « soutenance en anglais »', () => {
    expect(versProfil({ soutenanceAnglais: true })).not.toBeNull();
  });
});

/** Faux backend : seule l'écriture/lecture du profil est utilisée ici. */
function backendFaux(setProfil: (uid: string, data: unknown) => Promise<void>): FirestoreBackend {
  return {
    configure: true,
    setProfil,
    lireProfil: async () => null,
  } as unknown as FirestoreBackend;
}

describe('ProfilService — préférence « soutenance en anglais »', () => {
  it('écrit la préférence dans users/{uid} (mise à jour optimiste)', async () => {
    const setProfil = vi.fn(async (_uid: string, _data: unknown) => undefined);
    TestBed.configureTestingModule({
      providers: [{ provide: FIRESTORE_BACKEND, useValue: backendFaux(setProfil) }],
    });
    const service = TestBed.inject(ProfilService);

    const ok = await service.definirSoutenanceAnglais('uid-1', true);

    expect(ok).toBe(true);
    expect(setProfil).toHaveBeenCalledTimes(1);
    expect(setProfil.mock.calls[0]?.[0]).toBe('uid-1');
    expect(setProfil.mock.calls[0]?.[1]).toMatchObject({ soutenanceAnglais: true });
    expect(service.profil()?.soutenanceAnglais).toBe(true);
  });

  it('restaure la valeur précédente en cas d’échec de l’écriture', async () => {
    const setProfil = vi.fn(async (_uid: string, _data: unknown) => {
      throw new Error('permission-denied');
    });
    TestBed.configureTestingModule({
      providers: [{ provide: FIRESTORE_BACKEND, useValue: backendFaux(setProfil) }],
    });
    const service = TestBed.inject(ProfilService);

    const ok = await service.definirSoutenanceAnglais('uid-1', true);

    expect(ok).toBe(false);
    expect(service.profil()?.soutenanceAnglais).toBeUndefined();
    expect(service.erreur()).toBeTruthy();
  });
});
