import { describe, expect, it } from 'vitest';

import { profilDepuisProf, profilDepuisSaisieLibre, versProfil } from './profil.service';

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
});
