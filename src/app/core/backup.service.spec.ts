import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';

import { construireArchive, nomFichierSauvegarde, type ContenuSauvegarde } from './backup.service';

const CONTENU: ContenuSauvegarde = {
  creneaux: [
    {
      id: '2026-01-12_0845_0930',
      data: { date: '2026-01-12', heureDebut: '08:45', heureFin: '09:30' },
    },
  ],
  profils: [{ uid: 'anon_0123456789ab', data: { login: 'judith.abensour', nom: 'ABENSOUR' } }],
  dispos: [
    {
      uid: 'anon_0123456789ab',
      id: '2026-01-12_0845_0930',
      data: { date: '2026-01-12', heureDebut: '08:45', heureFin: '09:30' },
    },
  ],
  horodatage: '2026-01-12T08:00:00.000Z',
  version: '1',
};

describe('construireArchive', () => {
  it('contient les fichiers JSON, CSV et la notice', () => {
    const archive = unzipSync(construireArchive(CONTENU));
    expect(Object.keys(archive).sort()).toEqual([
      'creneaux.csv',
      'creneaux.json',
      'dispos.csv',
      'dispos.json',
      'lisez-moi.txt',
      'meta.json',
      'profils.json',
    ]);
  });

  it('exporte les créneaux, les profils et les disponibilités', () => {
    const archive = unzipSync(construireArchive(CONTENU));
    const creneaux = JSON.parse(strFromU8(archive['creneaux.json'])) as Array<
      Record<string, unknown>
    >;
    const profils = JSON.parse(strFromU8(archive['profils.json'])) as Array<
      Record<string, unknown>
    >;
    const dispos = JSON.parse(strFromU8(archive['dispos.json'])) as Array<Record<string, unknown>>;

    expect(creneaux[0]['id']).toBe('2026-01-12_0845_0930');
    expect(creneaux[0]['heureDebut']).toBe('08:45');
    expect(profils[0]['uid']).toBe('anon_0123456789ab');
    expect(dispos[0]['creneauId']).toBe('2026-01-12_0845_0930');
    expect(dispos[0]['uid']).toBe('anon_0123456789ab');
  });

  it('produit des CSV séparés par des points-virgules', () => {
    const archive = unzipSync(construireArchive(CONTENU));
    const csv = strFromU8(archive['creneaux.csv']);
    expect(csv.split('\r\n')[0]).toContain('id;date;heureDebut;heureFin;libelle');
    expect(csv).toContain('2026-01-12_0845_0930;2026-01-12;08:45;09:30');
  });

  it('renseigne la volumétrie dans meta.json', () => {
    const archive = unzipSync(construireArchive(CONTENU));
    const meta = JSON.parse(strFromU8(archive['meta.json'])) as Record<string, unknown>;
    expect(meta['creneaux']).toBe(1);
    expect(meta['profils']).toBe(1);
    expect(meta['dispos']).toBe(1);
    expect(meta['horodatage']).toBe('2026-01-12T08:00:00.000Z');
  });
});

describe('nomFichierSauvegarde', () => {
  it('horodate le nom du fichier', () => {
    expect(nomFichierSauvegarde(new Date(2026, 0, 12, 9, 5))).toBe(
      'mesdispos-sauvegarde-2026-01-12_0905.zip',
    );
  });
});
