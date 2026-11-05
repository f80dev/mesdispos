import { describe, expect, it } from 'vitest';

import {
  compterLignes,
  construireCsvMemoires,
  construireCsvSalles,
  csvDisponibilites,
  indexerColonnesSource,
} from './prompt-ia.service';
import { echapperCsv, remplacerGabarit, versCsv } from '../shared/csv.util';

/** Les deux premières lignes d'un export : noms techniques puis libellés. */
const EN_TETES_MEMOIRES = [
  [
    '[[ CODE ]]',
    '[[ CODE_STUDENT ]]',
    '[[ CODE_THESIS_TYPE ]]',
    '[[ TITLE ]]',
    '[[ STATUS ]]',
    '[[ DIRECTION_STATUS ]]',
    '[[ DIRECTOR ]]',
    '[[ SUBJECT_SUBMISSION_DATE ]]',
  ],
  [
    'Identifiant unique',
    'Étudiant',
    'Type de mémoire',
    'Titre',
    'Statut du mémoire',
    'Statut de la direction de mémoire',
    'Directeurs / Directeur de mémoire',
    'Date de dépôt du sujet',
  ],
];

describe('echapperCsv', () => {
  it('laisse passer une valeur simple', () => {
    expect(echapperCsv('simple')).toBe('simple');
  });

  it('entoure les valeurs contenant une virgule', () => {
    expect(echapperCsv('a,b')).toBe('"a,b"');
  });

  it('double le guillemet interne', () => {
    expect(echapperCsv('il dit "oui"')).toBe('"il dit ""oui"""');
  });
});

describe('versCsv', () => {
  it('produit un en-tête puis les lignes', () => {
    expect(versCsv(['a', 'b'], [['1', '2']])).toBe('a,b\n1,2\n');
  });
});

describe('remplacerGabarit', () => {
  it('remplace tous les champs entre accolades', () => {
    expect(remplacerGabarit('a {{x}} b {{ y }}', { x: '1', y: '2' })).toBe('a 1 b 2');
  });

  it('laisse intact un champ inconnu', () => {
    expect(remplacerGabarit('{{inconnu}}', { x: '1' })).toBe('{{inconnu}}');
  });
});

describe('indexerColonnesSource', () => {
  it('reconnaît les en-têtes techniques et démarre aux données', () => {
    const colonnes = [
      { cle: 'identifiant', technique: 'CODE', humain: 'identifiant unique', position: 0 },
    ];
    const resultat = indexerColonnesSource(
      [['[[ CODE ]]'], ['Identifiant unique'], ['34']],
      colonnes,
    );
    expect(resultat.indexes).toEqual([0]);
    expect(resultat.premiereDonnee).toBe(2);
  });

  it('reconnaît les en-têtes humains', () => {
    const colonnes = [{ cle: 'numero', technique: 'CODE', humain: 'numero', position: 0 }];
    const resultat = indexerColonnesSource([['Numéro'], ['-102']], colonnes);
    expect(resultat.indexes).toEqual([0]);
    expect(resultat.premiereDonnee).toBe(1);
  });
});

describe('construireCsvMemoires', () => {
  it('ignore les deux lignes d’en-tête et garde les données', () => {
    const csv = construireCsvMemoires([
      ...EN_TETES_MEMOIRES,
      [
        '34',
        'BENDELAC Noé',
        'Mémoire M1',
        'titre de mémoire',
        'En attente de soutenance',
        'Directeur confirmé',
        'WHILHEM Marie',
        'Jeudi 29 octobre 2026 à 15:32',
      ],
    ]);
    const lignes = csv.trim().split('\n');
    expect(lignes[0]).toBe(
      'identifiant,etudiant,type,titre,statut,statut_direction,directeur,date_depot_sujet',
    );
    expect(lignes[1]).toBe(
      '34,BENDELAC Noé,Mémoire M1,titre de mémoire,En attente de soutenance,' +
        'Directeur confirmé,WHILHEM Marie,Jeudi 29 octobre 2026 à 15:32',
    );
    expect(compterLignes(csv)).toBe(1);
  });
});

describe('construireCsvSalles', () => {
  it('produit le CSV des salles', () => {
    const csv = construireCsvSalles([
      ['[[ CODE ]]', '[[ NAME ]]'],
      ['Numéro', 'Nom'],
      [-102, '-102 Atelier Son Vidéo'],
    ]);
    expect(csv.trim().split('\n')).toEqual(['numero,nom', '-102,-102 Atelier Son Vidéo']);
  });
});

describe('csvDisponibilites', () => {
  it('agrège les créneaux par professeur', () => {
    const csv = csvDisponibilites(
      [{ uid: 'anon_a', data: { login: 'j.abensour', nom: 'ABENSOUR', prenom: 'Judith' } }],
      [
        {
          uid: 'anon_a',
          id: 'c1',
          data: { date: '2026-01-12', heureDebut: '08:45', heureFin: '09:30' },
        },
        {
          uid: 'anon_a',
          id: 'c2',
          data: { date: '2026-01-13', heureDebut: '10:00', heureFin: '11:00' },
        },
      ],
    );
    const lignes = csv.trim().split('\n');
    expect(lignes[0]).toBe('login,nom,prenom,nb_creneaux,disponibilites');
    expect(lignes[1]).toBe(
      'j.abensour,ABENSOUR,Judith,2,2026-01-12 08:45-09:30; 2026-01-13 10:00-11:00',
    );
  });

  it('conserve un professeur sans disponibilité', () => {
    const csv = csvDisponibilites([{ uid: 'anon_b', data: { prenom: 'Pauline' } }], []);
    expect(csv.trim().split('\n')[1]).toBe(',,Pauline,0,');
  });
});
