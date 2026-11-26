import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { FIRESTORE_BACKEND, type FirestoreBackend } from '../core/firestore.backend';
import { ConfigService } from './config.service';

/**
 * Faux backend : la lecture de `config/app` et l'écriture sont simulées, le
 * document en base est modifiable à la main.
 */
function creerFauxBackend(etat: { config: Record<string, unknown> | null }): FirestoreBackend {
  return {
    configure: true,
    ecouterConfig: vi.fn(
      (
        _id: string,
        suivant: (doc: { data: () => Record<string, unknown> } | null) => void,
        _erreur: (raison?: string) => void,
      ) => {
        suivant(etat.config ? { data: () => etat.config } : null);
        return () => undefined;
      },
    ),
    ecrireConfig: vi.fn(async (_id: string, data: unknown) => {
      etat.config = { ...(etat.config ?? {}), ...(data as Record<string, unknown>) };
    }),
  } as unknown as FirestoreBackend;
}

describe('ConfigService — date limite', () => {
  it('retombe sur la valeur de settings quand la base ne contient rien', () => {
    const backend = creerFauxBackend({ config: null });
    TestBed.configureTestingModule({
      providers: [{ provide: FIRESTORE_BACKEND, useValue: backend }],
    });

    const service = TestBed.inject(ConfigService);
    service.ecouter();

    expect(service.deadline()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('lit la date limite stockée en base', () => {
    const backend = creerFauxBackend({ config: { deadline: '2027-03-15' } });
    TestBed.configureTestingModule({
      providers: [{ provide: FIRESTORE_BACKEND, useValue: backend }],
    });

    const service = TestBed.inject(ConfigService);
    service.ecouter();

    expect(service.deadline()).toBe('2027-03-15');
  });

  it('écrit la date limite en base et met à jour le signal', async () => {
    const etat = { config: { deadline: '2027-01-31' } as Record<string, unknown> | null };
    const backend = creerFauxBackend(etat);
    TestBed.configureTestingModule({
      providers: [{ provide: FIRESTORE_BACKEND, useValue: backend }],
    });

    const service = TestBed.inject(ConfigService);
    const ok = await service.enregistrerDeadline('2027-06-01');

    expect(ok).toBe(true);
    expect(etat.config?.['deadline']).toBe('2027-06-01');
    expect(service.deadline()).toBe('2027-06-01');
  });

  it('refuse une date invalide sans rien écrire', async () => {
    const etat = { config: null as Record<string, unknown> | null };
    const backend = creerFauxBackend(etat);
    TestBed.configureTestingModule({
      providers: [{ provide: FIRESTORE_BACKEND, useValue: backend }],
    });

    const service = TestBed.inject(ConfigService);
    const ok = await service.enregistrerDeadline('pas-une-date');

    expect(ok).toBe(false);
    expect(etat.config).toBe(null);
  });
});
