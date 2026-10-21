import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DispoService, MESSAGE_ECHEC_ECRITURE } from './dispo.service';
import { CreneauService } from './creneau.service';
import { AuthService, type Utilisateur } from '../core/auth.service';
import { NotifService } from '../core/notif.service';
import type { Creneau } from './models';

/* -------------------------------------------------------------------------- */
/* Doubles de test : le SDK Firestore n'est jamais chargé (mock)               */
/* -------------------------------------------------------------------------- */

type Ecouteur = (instantane: { docs: Array<{ id: string; data: () => unknown }> }) => void;

const etat = vi.hoisted(() => ({
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  chemin: [] as unknown[],
  abonnes: [] as Array<() => void>,
  emettre: null as Ecouteur | null,
  snapshotErreur: null as (() => void) | null,
}));

vi.mock('../core/firebase', () => ({
  firebaseConfigure: () => true,
  firebaseDb: async () => ({ instance: 'db' }),
  chargerFirestore: async () => ({
    doc: (...chemin: unknown[]) => ({ chemin }),
    onSnapshot: (_ref: unknown, suivant: Ecouteur, erreur: () => void) => {
      etat.emettre = suivant;
      etat.snapshotErreur = erreur;
      const desabonner = () => undefined;
      etat.abonnes.push(desabonner);
      return desabonner;
    },
  }),
}));

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

describe('DispoService (F4 — sélection immédiate)', () => {
  let service: DispoService;
  let notif: FauxNotifService;
  let creneauxService: { creneaux: ReturnType<typeof signal<Creneau[]>> };

  beforeEach(() => {
    etat.setDoc.mockReset();
    etat.deleteDoc.mockReset();
    etat.chemin = [];
    etat.emettre = null;
    etat.abonnes = [];

    creneauxService = { creneaux: signal<Creneau[]>([CRENEAU, AUTRE_CRENEAU]) };
    notif = new FauxNotifService();

    TestBed.configureTestingModule({
      providers: [
        DispoService,
        { provide: AuthService, useValue: new FauxAuthService() },
        { provide: NotifService, useValue: notif },
        { provide: CreneauService, useValue: creneauxService },
      ],
    });

    service = TestBed.inject(DispoService);
  });

  it('sélectionner crée le document dispos/{creneauId} avec les bons champs', async () => {
    await service.basculer(CRENEAU);

    expect(etat.deleteDoc).not.toHaveBeenCalled();
    expect(etat.setDoc).toHaveBeenCalledTimes(1);
    expect(etat.chemin).toEqual(['users', 'anon_85209162cfd3', 'dispos', CRENEAU.id]);

    const [, document] = etat.setDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
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

    expect(etat.setDoc).not.toHaveBeenCalled();
    expect(etat.deleteDoc).toHaveBeenCalledTimes(1);
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
    etat.setDoc.mockRejectedValueOnce(new Error('permission-denied'));

    await service.basculer(CRENEAU);

    expect(service.idsSelectionnes().has(CRENEAU.id)).toBe(false);
    expect(service.dispos()).toEqual([]);
    expect(notif.reessayer).toHaveBeenCalledTimes(1);
    expect(notif.messages[0]).toBe(MESSAGE_ECHEC_ECRITURE);
    expect(service.estEnCours(CRENEAU.id)).toBe(false);
  });

  it("l'action « Réessayer » du snackbar rejoue l'écriture", async () => {
    etat.setDoc.mockRejectedValueOnce(new Error('offline'));

    await service.basculer(CRENEAU);
    expect(etat.setDoc).toHaveBeenCalledTimes(1);

    etat.setDoc.mockResolvedValueOnce(undefined);
    notif.retry?.();

    await Promise.resolve();
    await Promise.resolve();

    expect(etat.setDoc).toHaveBeenCalledTimes(2);
    expect(service.idsSelectionnes().has(CRENEAU.id)).toBe(true);
  });

  it('double-clic rapide → la dernière action gagne', async () => {
    let resolvoir: () => void = () => undefined;
    etat.setDoc.mockImplementationOnce(
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
    expect(etat.setDoc).toHaveBeenCalledTimes(1);
    expect(etat.deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('lit les dispos via onSnapshot sur users/{uid}/dispos', () => {
    service.ecouter();

    expect(etat.emettre).not.toBeNull();
    etat.emettre?.({
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
