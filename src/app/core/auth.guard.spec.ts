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

/* Doubles de test ---------------------------------------------------------- */

const etat = vi.hoisted(() => ({ admin: false }));

vi.mock('./firebase', () => ({
  firebaseConfigure: () => true,
  firebaseDb: async () => ({ instance: 'db' }),
  chargerFirestore: async () => ({
    doc: (...chemin: unknown[]) => ({ chemin }),
    getDoc: async () => ({ exists: () => etat.admin }),
  }),
}));

const ANON: Utilisateur = {
  uid: 'anon_85209162cfd3',
  displayName: 'Pauline',
  anon: true,
  email: null,
  photoURL: null,
};

const GOOGLE: Utilisateur = {
  uid: 'uid-firebase',
  displayName: 'Pauline D.',
  anon: false,
  email: 'pauline@example.fr',
  photoURL: null,
};

class FauxAuthService {
  utilisateur: Utilisateur | null = null;
  readonly user = signal<Utilisateur | null>(null);
  readonly attendreSession = vi.fn(async () => this.utilisateur);
}

class FauxNotifService {
  readonly info = vi.fn();
  readonly erreur = vi.fn();
  readonly succes = vi.fn();
  readonly reessayer = vi.fn();
}

const ROUTE = {} as ActivatedRouteSnapshot;
const ETAT_ADMIN = { url: '/admin/import' } as RouterStateSnapshot;

function preparer(auth: FauxAuthService): void {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: NotifService, useValue: new FauxNotifService() },
    ],
  });
}

describe('authGuard', () => {
  let auth: FauxAuthService;

  beforeEach(() => {
    auth = new FauxAuthService();
    preparer(auth);
  });

  it('laisse passer un utilisateur Google', async () => {
    auth.utilisateur = GOOGLE;
    const resultat = await TestBed.runInInjectionContext(() => authGuard(ROUTE, ETAT_ADMIN));
    expect(resultat).toBe(true);
  });

  it('laisse passer un utilisateur anonyme (mode A)', async () => {
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

  beforeEach(() => {
    etat.admin = false;
    auth = new FauxAuthService();
    notif = new FauxNotifService();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: NotifService, useValue: notif },
      ],
    });
  });

  it("refuse l'accès sans document admins/{uid}", async () => {
    auth.utilisateur = GOOGLE;
    etat.admin = false;
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'createUrlTree');

    const resultat = await TestBed.runInInjectionContext(() => adminGuard(ROUTE, ETAT_ADMIN));

    expect(resultat).not.toBe(true);
    expect(notif.info).toHaveBeenCalledWith('Accès réservé à un administrateur');
    expect(spy).toHaveBeenCalledWith(['/dispos']);
  });

  it("refuse l'accès à un utilisateur anonyme même si admins/ le mentionnerait", async () => {
    auth.utilisateur = ANON;
    etat.admin = true;

    const resultat = await TestBed.runInInjectionContext(() => adminGuard(ROUTE, ETAT_ADMIN));

    expect(resultat).not.toBe(true);
  });

  it('laisse passer un admin en mode B', async () => {
    auth.utilisateur = GOOGLE;
    etat.admin = true;

    const resultat = await TestBed.runInInjectionContext(() => adminGuard(ROUTE, ETAT_ADMIN));

    expect(resultat).toBe(true);
  });

  it("renvoie vers /login si personne n'est connecté", async () => {
    auth.utilisateur = null;
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'createUrlTree');

    const resultat = await TestBed.runInInjectionContext(() => adminGuard(ROUTE, ETAT_ADMIN));

    expect(resultat).not.toBe(true);
    expect(spy).toHaveBeenCalledWith(['/login'], { queryParams: { retour: '/admin/import' } });
  });
});
