import { describe, expect, it } from 'vitest';

import { normaliserProfs } from './prof.service';
import type { ProfOasis } from '../core/cours.services';

function prof(partiel: Partial<ProfOasis> & { login: string }): ProfOasis {
  return {
    nip: '1',
    type_utilisateur: 'P',
    nom_usuel: '',
    prenom_usuel: '',
    ...partiel,
  };
}

describe('normaliserProfs (liste des professeurs Oasis)', () => {
  it('renvoie une liste vide si la réponse est absente', () => {
    expect(normaliserProfs(null)).toEqual([]);
    expect(normaliserProfs(undefined)).toEqual([]);
    expect(normaliserProfs([])).toEqual([]);
  });

  it('compose le nom complet « Prénom NOM »', () => {
    const resultat = normaliserProfs([
      prof({ login: 'judith.abensour', prenom_usuel: 'Judith', nom_usuel: 'ABENSOUR' }),
    ]);
    expect(resultat).toHaveLength(1);
    expect(resultat[0]?.nomComplet).toBe('Judith ABENSOUR');
    expect(resultat[0]?.prenom).toBe('Judith');
    expect(resultat[0]?.nom).toBe('ABENSOUR');
  });

  it('déduplique les entrées répétées par l’API (même login)', () => {
    const resultat = normaliserProfs([
      prof({ login: 'a.b', prenom_usuel: 'Ana', nom_usuel: 'BEL' }),
      prof({ login: 'a.b', prenom_usuel: 'Ana', nom_usuel: 'BEL' }),
    ]);
    expect(resultat).toHaveLength(1);
  });

  it('écarte les enseignants sortants (present ≠ ACT)', () => {
    const resultat = normaliserProfs([
      prof({ login: 'a.b', prenom_usuel: 'Ana', nom_usuel: 'BEL', present: 'ACT' }),
      prof({ login: 'c.d', prenom_usuel: 'Carl', nom_usuel: 'DUR', present: 'INA' }),
    ]);
    expect(resultat.map((p) => p.login)).toEqual(['a.b']);
  });

  it('ignore les entrées sans login ni nom affichable', () => {
    const resultat = normaliserProfs([
      prof({ login: '', prenom_usuel: 'Sans', nom_usuel: 'Login' }),
      prof({ login: 'x.y', prenom_usuel: '', nom_usuel: '' }),
    ]);
    expect(resultat).toEqual([]);
  });

  it('trie par nom complet, insensible à la casse et aux accents', () => {
    const resultat = normaliserProfs([
      prof({ login: 'z.z', prenom_usuel: 'Zoé', nom_usuel: 'ZULU' }),
      prof({ login: 'a.a', prenom_usuel: 'Ana', nom_usuel: 'Alvarez' }),
      prof({ login: 'e.e', prenom_usuel: 'Éloi', nom_usuel: 'École' }),
    ]);
    expect(resultat.map((p) => p.nomComplet)).toEqual(['Ana Alvarez', 'Éloi École', 'Zoé ZULU']);
  });

  it('conserve le libellé du service quand il est présent', () => {
    const resultat = normaliserProfs([
      prof({
        login: 'a.b',
        prenom_usuel: 'Ana',
        nom_usuel: 'BEL',
        service_libelle: 'Direction des études',
      }),
    ]);
    expect(resultat[0]?.service).toBe('Direction des études');
  });

  it('reporte les champs du schéma API (nip, secteur, subjects, mail)', () => {
    const resultat = normaliserProfs([
      prof({
        login: 'a.b',
        nip: '11177',
        prenom_usuel: 'Ana',
        nom_usuel: 'BEL',
        civilite: 'F',
        mail_pro: 'ana.bel@ensad.fr',
        secteur: '3',
        statut_etab: 'V',
        service_libelle: 'Direction des études',
        subjects: [{ code: 'DESSIN', year: '2026', description: '<p>Dessin</p>' }],
      }),
    ]);
    expect(resultat[0]?.nip).toBe('11177');
    expect(resultat[0]?.civilite).toBe('F');
    expect(resultat[0]?.mailPro).toBe('ana.bel@ensad.fr');
    expect(resultat[0]?.secteur).toBe('3');
    expect(resultat[0]?.statutEtab).toBe('V');
    expect(resultat[0]?.subjects).toEqual(['DESSIN']);
  });

  it('tolère un schéma partiel (champs absents ou vides)', () => {
    const resultat = normaliserProfs([
      prof({
        login: 'a.b',
        prenom_usuel: 'Ana',
        nom_usuel: 'BEL',
        mail_pro: '',
        service_libelle: '',
      }),
    ]);
    expect(resultat[0]?.mailPro).toBeUndefined();
    expect(resultat[0]?.service).toBeUndefined();
    expect(resultat[0]?.subjects).toEqual([]);
  });

  it('accepte `subjects` sous forme de chaînes comme d’objets', () => {
    const resultat = normaliserProfs([
      prof({ login: 'a.b', prenom_usuel: 'Ana', nom_usuel: 'BEL', subjects: ['Art'] }),
      prof({
        login: 'c.d',
        prenom_usuel: 'Carl',
        nom_usuel: 'DUR',
        subjects: [{ code: 'SCULPTURE' }, { description: 'sans code' }],
      }),
    ]);
    expect(resultat[0]?.subjects).toEqual(['Art']);
    expect(resultat[1]?.subjects).toEqual(['SCULPTURE']);
  });

  it('ignore une entrée malformée sans faire échouer la liste', () => {
    const resultat = normaliserProfs([
      prof({ login: 'a.b', prenom_usuel: 'Ana', nom_usuel: 'BEL' }),
      null as unknown as ProfOasis,
      { login: 'c.d' } as ProfOasis,
    ]);
    expect(resultat.map((p) => p.login)).toEqual(['a.b']);
  });
});
