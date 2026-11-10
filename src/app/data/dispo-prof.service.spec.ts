import { describe, expect, it } from 'vitest';

import { filtrerProfsDispo, regrouperDisposParProf } from './dispo-prof.service';
import type { DispoAdmin, ProfilAdmin } from '../core/firestore.backend';

function dispo(uid: string, id: string, data: Record<string, unknown>): DispoAdmin {
  return { uid, id, data };
}

function profil(uid: string, data: Record<string, unknown>): ProfilAdmin {
  return { uid, data };
}

describe('regrouperDisposParProf (disponibilités par professeur)', () => {
  it('regroupe les disponibilités par partition et trie par nom complet', () => {
    const resultat = regrouperDisposParProf(
      [
        profil('uid-b', { login: 'zoe.b', nom: 'BART', prenom: 'Zoé' }),
        profil('uid-a', { login: 'ana.a', nom: 'ALLA', prenom: 'Ana' }),
      ],
      [
        dispo('uid-b', '2026-01-12_0845_0930', {
          date: '2026-01-12',
          heureDebut: '08:45',
          heureFin: '09:30',
        }),
        dispo('uid-a', '2026-01-12_0900_1000', {
          date: '2026-01-12',
          heureDebut: '09:00',
          heureFin: '10:00',
        }),
        dispo('uid-a', '2026-01-11_0900_1000', {
          date: '2026-01-11',
          heureDebut: '09:00',
          heureFin: '10:00',
        }),
      ],
    );

    expect(resultat.map((prof) => prof.nomComplet)).toEqual(['Ana ALLA', 'Zoé BART']);
    expect(resultat[0]?.login).toBe('ana.a');
    expect(resultat[0]?.dispos).toHaveLength(2);
    // Tri date puis heure : la disponibilité du 11 janvier passe en premier.
    expect(resultat[0]?.dispos[0]?.date).toBe('2026-01-11');
    expect(resultat[1]?.dispos[0]?.heureDebut).toBe('08:45');
  });

  it('ignore les disponibilités mal formées', () => {
    const resultat = regrouperDisposParProf(
      [],
      [dispo('uid-a', 'creneau-invalide', { date: 'pas une date', heureDebut: '09:00' })],
    );
    expect(resultat).toEqual([]);
  });

  it('retombe sur les champs dénormalisés de la disponibilité si le profil est absent', () => {
    const resultat = regrouperDisposParProf(
      [],
      [
        dispo('uid-a', '2026-01-12_0845_0930', {
          date: '2026-01-12',
          heureDebut: '08:45',
          heureFin: '09:30',
          nom: 'DUPONT',
          prenom: 'Paul',
          login: 'paul.dupont',
        }),
      ],
    );
    expect(resultat).toHaveLength(1);
    expect(resultat[0]?.nomComplet).toBe('Paul DUPONT');
    expect(resultat[0]?.login).toBe('paul.dupont');
  });
});

describe('filtrerProfsDispo (recherche dans la liste)', () => {
  const profs = regrouperDisposParProf(
    [
      profil('uid-a', { login: 'ana.alla', nom: 'ALLA', prenom: 'Ana' }),
      profil('uid-b', { login: 'zoe.bart', nom: 'BART', prenom: 'Zoé' }),
    ],
    [
      dispo('uid-a', '2026-01-12_0845_0930', {
        date: '2026-01-12',
        heureDebut: '08:45',
        heureFin: '09:30',
      }),
      dispo('uid-b', '2026-01-12_0900_1000', {
        date: '2026-01-12',
        heureDebut: '09:00',
        heureFin: '10:00',
      }),
    ],
  );

  it('renvoie tout le monde sans recherche', () => {
    expect(filtrerProfsDispo(profs, '')).toHaveLength(2);
    expect(filtrerProfsDispo(profs, null)).toHaveLength(2);
  });

  it('filtre sur le nom, le prénom ou le login, sans tenir compte des accents', () => {
    expect(filtrerProfsDispo(profs, 'zoe').map((p) => p.uid)).toEqual(['uid-b']);
    expect(filtrerProfsDispo(profs, 'ALLA').map((p) => p.uid)).toEqual(['uid-a']);
    expect(filtrerProfsDispo(profs, 'zoe.bart').map((p) => p.uid)).toEqual(['uid-b']);
  });

  it('exige tous les mots saisis', () => {
    expect(filtrerProfsDispo(profs, 'ana alla')).toHaveLength(1);
    expect(filtrerProfsDispo(profs, 'ana zoe')).toHaveLength(0);
  });
});
