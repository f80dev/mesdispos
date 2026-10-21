import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type Route } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { App } from './app.component';
import { AuthService, type Utilisateur } from './core/auth.service';
import { CookieService } from './core/cookie.service';
import { FIRESTORE_BACKEND, type FirestoreBackend } from './core/firestore.backend';

@Component({ template: '<p>login-stub</p>', selector: 'test-login' })
class LoginStub {}

@Component({ template: '<p>dispos-stub</p>', selector: 'test-dispos' })
class DisposStub {}

/** Faux AuthService : aucun utilisateur, donc aucun abonnement Firebase. */
class FauxAuthService {
  readonly user = signal<Utilisateur | null>(null);
  readonly attendreSession = async (): Promise<null> => null;
  readonly signOut = async (): Promise<void> => undefined;
}

const FAUX_FIRESTORE: FirestoreBackend = {
  configure: false,
  ecouterCreneaux: async () => () => undefined,
  ecouterDispos: async () => () => undefined,
  setDispo: async () => undefined,
  deleteDispo: async () => undefined,
  listerIdsCreneaux: async () => [],
  upsertCreneaux: async () => 0,
  estAdmin: async () => false,
};

const ROUTES: Route[] = [
  { path: 'login', component: LoginStub },
  { path: 'dispos', component: DisposStub },
  { path: '**', redirectTo: 'dispos' },
];

describe('App (shell)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, LoginStub, DisposStub],
      providers: [
        provideRouter(ROUTES),
        { provide: AuthService, useValue: new FauxAuthService() },
        CookieService,
        { provide: FIRESTORE_BACKEND, useValue: FAUX_FIRESTORE },
      ],
    }).compileComponents();
  });

  it("crée l'application", () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('affiche le point de sortie du routeur', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });

  it('masque le header sur /login', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/login');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-header')).toBeNull();

    await router.navigateByUrl('/dispos');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-header')).not.toBeNull();
  });
});
