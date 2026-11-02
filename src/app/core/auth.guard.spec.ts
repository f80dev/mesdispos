import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  provideRouter,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminGuard } from './admin.guard';
import { authGuard } from './auth.guard';
import { AuthService, type Utilisateur } from './auth.service';
import { NotifService } from './notif.service';
import { FIRESTORE_BACKEND, type FirestoreBackend } from './firestore.backend';

const ANON: Utilisateur = {
  uid: 'anon_85209162cfd3',
  displayName: 'Pauline',
  session: 'nom',
};

const ADMIN: Utilisateur = {
  uid: 'uid-firebase',
  displayName: 'Administrateur',
  session: 'firebase',
};

class FauxAuthService {
  utilisateur: Utilisateur | null = null;
  readonly user = signal<Utilisateur | null>(null);
  readonly sessionAdmin = signal<Utilisateur | null>(null);
  readonly attendreSession = vi.fn(async () => this.utilisateur);
  readonly uidEcriture = vi.fn(() => this.utilisateur?.uid ?? null);
}

class FauxNotifService {
  readonly info = vi.fn();
  readonly erreur = vi.fn();
  readonly succes = vi.fn();
  readonly reessayer = vi.fn();
}

/** Faux `FirestoreBackend` dont `estAdmin` répond `admin`. */
function creerFauxBackend(admin: boolean): FirestoreBackend {
  return {
    configure: true,
    ecouterCreneaux: vi.fn(() => () => undefined),
    ecouterDispos: vi.fn(() => () => undefined),
    setDispo: vi.fn(async () => undefined),
    deleteDispo: vi.fn(async () => undefined),
    listerIdsCreneaux: vi.fn(async () => []),
    upsertCreneaux: vi.fn(async () => 0),
    estAdmin: vi.fn(async () => admin),
  };
}

const ROUTE = {} as ActivatedRouteSnapshot;
const ETAT_ADMIN = { url: '/admin/import' } as RouterStateSnapshot;

describe('authGuard', () => {
  let auth: FauxAuthService;

  beforeEach(() => {
    auth = new FauxAuthService();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: NotifService, useValue: new FauxNotifService() },
        { provide: FIRESTORE_BACKEND, useValue: creerFauxBackend(false) },
      ],
    });
  });

  it('laisse passer une session Firebase (administrateur)', async () => {
    auth.utilisateur = ADMIN;
    const resultat = await TestBed.runInInjectionContext(() => authGuard(ROUTE, ETAT_ADMIN));
    expect(resultat).toBe(true);
  });

  it('laisse passer une session « nom seul » (cookie)', async () => {
    auth.utilisateur = ANON;
    const resultat = await TestBed.runInInjectionContext(() => authGuard(ROUTE, ETAT_ADMIN));
    expect(resultat).toBe(true);
  });

  it('redirige vers /login en mémorisant la route demandée si non connecté', async () => {
    auth.utilisateur = null;
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'createUrlTree');

    const resultat = await TestBed.runInInjectionContext(() => authGuard(ROUTE, ETAT_ADMIN));

    expect(resultat).not.toBe(true);
    expect(spy).toHaveBeenCalledWith(['/login'], { queryParams: { retour: '/admin/import' } });
  });
});

describe('adminGuard', () => {
  let auth: FauxAuthService;
  let notif: FauxNotifService;

  function preparer(admin: boolean): void {
    auth = new FauxAuthService();
    notif = new FauxNotifService();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: NotifService, useValue: notif },
        { provide: FIRESTORE_BACKEND, useValue: creerFauxBackend(admin) },
      ],
    });
  }

  it("refuse l'accès sans document admins/{uid}", async () => {
    preparer(false);
    auth.utilisateur = ADMIN;
    auth.sessionAdmin.set(ADMIN);
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'createUrlTree');

    const resultat = await TestBed.runInInjectionContext(() => adminGuard(ROUTE, ETAT_ADMIN));

    expect(resultat).not.toBe(true);
    expect(notif.info).toHaveBeenCalledWith('Accès réservé à un administrateur');
    expect(spy).toHaveBeenCalledWith(['/dispos']);
  });

  it("refuse l'accès à une session « nom seul » même si admins/ le mentionnerait", async () => {
    preparer(true);
    auth.utilisateur = ANON;

    const resultat = await TestBed.runInInjectionContext(() => adminGuard(ROUTE, ETAT_ADMIN));

    expect(resultat).not.toBe(true);
  });

  it('laisse passer un administrateur authentifié', async () => {
    preparer(true);
    auth.utilisateur = ADMIN;
    auth.sessionAdmin.set(ADMIN);

    const resultat = await TestBed.runInInjectionContext(() => adminGuard(ROUTE, ETAT_ADMIN));

    expect(resultat).toBe(true);
  });

  it('renvoie vers /login si personne n\'est connecté', async () => {
    preparer(false);
    auth.utilisateur = null;
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'createUrlTree');

    const resultat = await TestBed.runInInjectionContext(() => adminGuard(ROUTE, ETAT_ADMIN));

    expect(resultat).not.toBe(true);
    expect(spy).toHaveBeenCalledWith(['/login'], { queryParams: { retour: '/admin/import' } });
  });
});
