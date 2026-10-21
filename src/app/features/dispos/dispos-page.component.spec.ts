import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DisposPageComponent } from './dispos-page.component';
import { CreneauService } from '../../data/creneau.service';
import { DispoService } from '../../data/dispo.service';
import { grouperParJour } from '../../shared/date.util';
import type { Creneau } from '../../data/models';

/* Doubles de test ---------------------------------------------------------- */

const CRENEAUX: Creneau[] = [
  { id: '2026-01-12_0845_0930', date: '2026-01-12', heureDebut: '08:45', heureFin: '09:30' },
  { id: '2026-01-12_1400_1500', date: '2026-01-12', heureDebut: '14:00', heureFin: '15:00' },
];

class FauxCreneauService {
  readonly creneaux = signal<Creneau[]>(CRENEAUX);
  readonly chargement = signal(false);
  readonly erreur = signal<string | null>(null);
  readonly ecouter = vi.fn(() => () => undefined);
  readonly arreter = vi.fn();
  readonly reecouter = vi.fn();
}

class FauxDispoService {
  /** Source de vérité du faux service : les `computed` en découlent. */
  readonly creneaux = signal<Creneau[]>(CRENEAUX);
  readonly retenusIds = signal<string[]>([]);
  readonly chargement = signal(false);
  readonly erreur = signal<string | null>(null);

  readonly basculer = vi.fn(async (_creneau: Creneau) => undefined);
  readonly ecouter = vi.fn(() => () => undefined);
  readonly arreter = vi.fn();
  readonly reecouter = vi.fn();
  readonly estEnCours = vi.fn((_creneauId: string) => false);

  readonly disponibles = computed(() => {
    const retenus = new Set(this.retenusIds());
    return this.creneaux().filter((creneau) => !retenus.has(creneau.id));
  });

  readonly retenus = computed(() => {
    const retenus = new Set(this.retenusIds());
    return this.creneaux().filter((creneau) => retenus.has(creneau.id));
  });

  readonly nombreRetenus = computed(() => this.retenus().length);
}

describe('DisposPageComponent (F3 / F4)', () => {
  let fixture: ComponentFixture<DisposPageComponent>;
  let creneaux: FauxCreneauService;
  let dispo: FauxDispoService;

  function texteSection(index: number): string {
    const titres = fixture.nativeElement.querySelectorAll('h2') as NodeListOf<HTMLElement>;
    return titres[index]?.textContent?.trim() ?? '';
  }

  function textesH(): string[] {
    return [...fixture.nativeElement.querySelectorAll('h3')].map(
      (h) => (h as HTMLElement).textContent?.trim() ?? '',
    );
  }

  beforeEach(async () => {
    creneaux = new FauxCreneauService();
    dispo = new FauxDispoService();

    await TestBed.configureTestingModule({
      imports: [DisposPageComponent],
      providers: [
        { provide: CreneauService, useValue: creneaux },
        { provide: DispoService, useValue: dispo },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DisposPageComponent);
  });

  it("s'abonne aux deux services à la création et se désabonne à la destruction", () => {
    fixture.detectChanges();
    expect(creneaux.ecouter).toHaveBeenCalled();
    expect(dispo.ecouter).toHaveBeenCalled();

    fixture.destroy();
    expect(creneaux.arreter).toHaveBeenCalled();
    expect(dispo.arreter).toHaveBeenCalled();
  });

  it("rend les deux sections dans l'ordre du cahier", () => {
    fixture.detectChanges();

    expect(texteSection(0)).toContain('Créneaux disponibles');
    expect(texteSection(1)).toContain('Mes disponibilités');
  });

  it('affiche le compteur N des disponibilités', () => {
    fixture.detectChanges();
    expect(texteSection(1)).toContain('(0)');

    dispo.retenusIds.set([CRENEAUX[0]?.id ?? '']);
    fixture.detectChanges();
    expect(texteSection(1)).toContain('(1)');
  });

  it('regroupe les créneaux par jour avec le libellé français', () => {
    fixture.detectChanges();
    expect(textesH()).toContain('lundi 12 janvier 2026');
  });

  it("affiche l'état de chargement", () => {
    creneaux.chargement.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-progress-bar')).toBeTruthy();
  });

  it("affiche l'état vide de chaque section", () => {
    dispo.retenusIds.set([]);
    fixture.detectChanges();

    const textes = fixture.nativeElement.textContent as string;
    expect(textes).toContain('Aucun créneau proposé pour le moment.');
    expect(textes).toContain("Vous n'avez pas encore retenu de créneau.");
  });

  it("affiche l'état d'erreur avec un bouton Réessayer qui réécoute", () => {
    creneaux.erreur.set('Impossible de lire les créneaux.');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Impossible de lire les créneaux.');
    const bouton = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b as HTMLElement).textContent?.includes('Réessayer'),
    ) as HTMLButtonElement | undefined;

    expect(bouton).toBeTruthy();
    bouton?.click();
    expect(creneaux.reecouter).toHaveBeenCalled();
    expect(dispo.reecouter).toHaveBeenCalled();
  });

  it('un clic sur un créneau émet basculer (aucun bouton Enregistrer)', () => {
    fixture.detectChanges();

    const cartes = fixture.nativeElement.querySelectorAll('app-creneau-card button');
    expect(cartes.length).toBe(CRENEAUX.length);
    (cartes[0] as HTMLButtonElement).click();

    expect(dispo.basculer).toHaveBeenCalledWith(CRENEAUX[0]);
  });

  it('porte aria-pressed sur chaque ligne', () => {
    fixture.detectChanges();
    const cartes = [...fixture.nativeElement.querySelectorAll('app-creneau-card button')];

    expect(cartes[0]?.getAttribute('aria-pressed')).toBe('false');
    expect(cartes[0]?.getAttribute('aria-label')).toMatch(/^Disponible /);
  });

  it("n'expose aucun bouton d'enregistrement ni de confirmation", () => {
    fixture.detectChanges();
    const libelles = [...fixture.nativeElement.querySelectorAll('button')].map((b) =>
      (b as HTMLElement).textContent?.trim(),
    );
    expect(libelles.join(' ')).not.toContain('Enregistrer');
    expect(fixture.nativeElement.querySelector('mat-dialog-container')).toBeNull();
  });

  it('regroupe les disponibilités de la même façon que le service', () => {
    // Garde-fou : la page ne fait que consommer les `computed` du service.
    expect(grouperParJour(dispo.disponibles())).toHaveLength(1);
  });
});
