import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { App } from './app.component';
import { AuthService, type Utilisateur } from './core/auth.service';
import { CookieService } from './core/cookie.service';

/** Faux AuthService : aucun utilisateur, donc aucun abonnement Firebase. */
class FauxAuthService {
  readonly user = signal<Utilisateur | null>(null);
  readonly attendreSession = async (): Promise<null> => null;
  readonly signOut = async (): Promise<void> => undefined;
}

describe('App (shell)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: new FauxAuthService() },
        CookieService,
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
