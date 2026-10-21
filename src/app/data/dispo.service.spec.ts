import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DispoService, MESSAGE_ECHEC_ECRITURE } from './dispo.service';
import { CreneauService } from './creneau.service';
import { AuthService, type Utilisateur } from '../core/auth.service';
import { NotifService } from '../core/notif.service';
import { FIRESTORE_BACKEND, type FirestoreBackend } from '../core/firestore.backend';
import type { Creneau } from './models';

const CRENEAU: Creneau = {
  id: '2026-01-12_0845_0930',
  date: '2026-01-12',
  heureDebut: '08:45',
  heureFin: '09:30',
  libelle: 'Audition A1',
};

const AUTRE_CRENEAU: Creneau = {
  id: '2026-01-12_1400_1500',
  date: '2026-01-12',
  heureDebut: '14:00',
  heureFin: '15:00',
};

/** Faux AuthService : un utilisateur anonyme connecté, comme en mode A. */
class FauxAuthService {
  readonly user = signal<Utilisateur | null>({
    uid: 'anon_85209162cfd3',
    displayName: 'Pauline',
    anon: true,
    email: null,
    photoURL: null,
  });
  readonly attendreSession = vi.fn(async () => this.user());
}

/** Faux NotifService : on capture l'action « Réessayer ». */
class FauxNotifService {
  readonly messages: string[] = [];
  retry: (() => void) | null = null;
  reessayer = vi.fn((message: string, executer: () => void) => {
    this.messages.push(message);
    this.retry = executer;
  });
  erreur = vi.fn((message: string) => this.messages.push(message));
  succes = vi.fn((message: string) => this.messages.push(message));
  info = vi.fn((message: string) => this.messages.push(message));
}

/** Faux `FirestoreBackend` — enregistre les écritures via `setDispo`/`deleteDispo`,
 *  expose `ecouterDispos` via une callback que les tests peuvent piloter. */
function creerFauxBackend(): FirestoreBackend & {
  setDispoMock: ReturnType<typeof vi.fn>;
  deleteDispoMock: ReturnType<typeof vi.fn>;
  emettre: ((s: { docs: Array<{ id: string; data: () => unknown }> }) => void) | null;
} {
  const setDispoMock = vi.fn(async (_uid: string, _id: string, _data: unknown) => undefined);
  const deleteDispoMock = vi.fn(async (_uid: string, _id: string) => undefined);
  const self: ReturnType<typeof creerFauxBackend> = {
    configure: true,
    setDispo: setDispoMock as unknown as FirestoreBackend['setDispo'],
    deleteDispo: deleteDispoMock as unknown as FirestoreBackend['deleteDispo'],
    ecouterCreneaux: vi.fn(async () => () => undefined),
    ecouterDispos: vi.fn(
      async (
        _uid: string,
        suivant: (s: { docs: Array<{ id: string; data: () => unknown }> }) => void,
        _erreur: () => void,
      ) => {
        self.emettre = suivant;
        return () => undefined;
      },
    ) as unknown as FirestoreBackend['ecouterDispos'],
    listerIdsCreneaux: vi.fn(async () => []),
    upsertCreneaux: vi.fn(async () => 0),
    estAdmin: vi.fn(async () => false),
    setDispoMock,
    deleteDispoMock,
    emettre: null,
  } as unknown as ReturnType<typeof creerFauxBackend>;
  return self;
}

describe('DispoService (F4 — sélection immédiate)', () => {
  let service: DispoService;
  let notif: FauxNotifService;
  let backend: ReturnType<typeof creerFauxBackend>;
  let creneauxService: { creneaux: ReturnType<typeof signal<Creneau[]>> };

  beforeEach(() => {
    backend = creerFauxBackend();
    creneauxService = { creneaux: signal<Creneau[]>([CRENEAU, AUTRE_CRENEAU]) };
    notif = new FauxNotifService();

    TestBed.configureTestingModule({
      providers: [
        DispoService,
        { provide: AuthService, useValue: new FauxAuthService() },
        { provide: NotifService, useValue: notif },
        { provide: CreneauService, useValue: creneauxService },
        { provide: FIRESTORE_BACKEND, useValue: backend },
      ],
    });

    service = TestBed.inject(DispoService);
  });

  it('sélectionner crée le document dispos/{creneauId} avec les bons champs', async () => {
    await service.basculer(CRENEAU);

    expect(backend.deleteDispoMock).not.toHaveBeenCalled();
    expect(backend.setDispoMock).toHaveBeenCalledTimes(1);

    const [uid, id, document] = backend.setDispoMock.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(uid).toBe('anon_85209162cfd3');
    expect(id).toBe(CRENEAU.id);
    expect(document).toMatchObject({
      creneauId: CRENEAU.id,
      date: '2026-01-12',
      heureDebut: '08:45',
      heureFin: '09:30',
      libelle: 'Audition A1',
    });
    expect(typeof document['updatedAt']).toBe('number');
  });

  it('désélectionner supprime le document', async () => {
    service.dispos.set([
      {
        creneauId: CRENEAU.id,
        date: CRENEAU.date,
        heureDebut: CRENEAU.heureDebut,
        heureFin: CRENEAU.heureFin,
        updatedAt: 1,
      },
    ]);

    await service.basculer(CRENEAU);

    expect(backend.setDispoMock).not.toHaveBeenCalled();
    expect(backend.deleteDispoMock).toHaveBeenCalledTimes(1);
    expect(backend.deleteDispoMock.mock.calls[0]?.[0]).toBe('anon_85209162cfd3');
    expect(backend.deleteDispoMock.mock.calls[0]?.[1]).toBe(CRENEAU.id);
    expect(service.idsSelectionnes().has(CRENEAU.id)).toBe(false);
  });

  it("applique la mise à jour optimiste AVANT l'écriture Firestore", () => {
    void service.basculer(CRENEAU);

    // L'état local a déjà bougé alors que l'écriture est encore en vol.
    expect(service.idsSelectionnes().has(CRENEAU.id)).toBe(true);
    expect(service.retenus().map((c) => c.id)).toEqual([CRENEAU.id]);
    expect(service.disponibles().map((c) => c.id)).toEqual([AUTRE_CRENEAU.id]);
    expect(service.estEnCours(CRENEAU.id)).toBe(true);
  });

  it('compte les disponibilités en temps réel', async () => {
    expect(service.nombreRetenus()).toBe(0);
    await service.basculer(CRENEAU);
    expect(service.nombreRetenus()).toBe(1);
    await service.basculer(AUTRE_CRENEAU);
    expect(service.nombreRetenus()).toBe(2);
  });

  it("échec réseau → rollback de l'état + snackbar « Réessayer »", async () => {
    backend.setDispoMock.mockRejectedValueOnce(new Error('permission-denied'));

    await service.basculer(CRENEAU);

    expect(service.idsSelectionnes().has(CRENEAU.id)).toBe(false);
    expect(service.dispos()).toEqual([]);
    expect(notif.reessayer).toHaveBeenCalledTimes(1);
    expect(notif.messages[0]).toBe(MESSAGE_ECHEC_ECRITURE);
    expect(service.estEnCours(CRENEAU.id)).toBe(false);
  });

  it("l'action « Réessayer » du snackbar rejoue l'écriture", async () => {
    backend.setDispoMock.mockRejectedValueOnce(new Error('offline'));

    await service.basculer(CRENEAU);
    expect(backend.setDispoMock).toHaveBeenCalledTimes(1);

    backend.setDispoMock.mockResolvedValueOnce(undefined);
    notif.retry?.();

    await Promise.resolve();
    await Promise.resolve();

    expect(backend.setDispoMock).toHaveBeenCalledTimes(2);
    expect(service.idsSelectionnes().has(CRENEAU.id)).toBe(true);
  });

  it('double-clic rapide → la dernière action gagne', async () => {
    let resolvoir: () => void = () => undefined;
    backend.setDispoMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvoir = resolve;
        }),
    );

    const premier = service.basculer(CRENEAU); // sélection
    const second = service.basculer(CRENEAU); // désélection immédiate

    resolvoir();
    await Promise.all([premier, second]);

    // La réponse tardive de la première action ne doit pas écraser la seconde.
    expect(service.idsSelectionnes().has(CRENEAU.id)).toBe(false);
    expect(backend.setDispoMock).toHaveBeenCalledTimes(1);
    expect(backend.deleteDispoMock).toHaveBeenCalledTimes(1);
  });

  it('lit les dispos via onSnapshot sur users/{uid}/dispos', () => {
    service.ecouter();

    expect(backend.emettre).not.toBeNull();
    backend.emettre?.({
      docs: [
        {
          id: CRENEAU.id,
          data: () => ({
            creneauId: CRENEAU.id,
            date: '2026-01-12',
            heureDebut: '08:45',
            heureFin: '09:30',
            updatedAt: 1,
          }),
        },
      ],
    });

    expect(service.dispos()).toHaveLength(1);
    expect(service.nombreRetenus()).toBe(1);
    expect(service.chargement()).toBe(false);
  });

  it('conserve les disponibilités orphelines dans « Mes disponibilités »', () => {
    creneauxService.creneaux.set([]); // le créneau a été supprimé par un admin
    service.dispos.set([
      {
        creneauId: CRENEAU.id,
        date: '2026-01-12',
        heureDebut: '08:45',
        heureFin: '09:30',
        updatedAt: 1,
      },
    ]);

    expect(service.retenus()).toEqual([
      { id: CRENEAU.id, date: '2026-01-12', heureDebut: '08:45', heureFin: '09:30' },
    ]);
  });
});
