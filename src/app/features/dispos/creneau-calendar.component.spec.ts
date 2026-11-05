import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CreneauCalendarComponent } from './creneau-calendar.component';
import type { Creneau } from '../../data/models';

const CRENEAUX: Creneau[] = [
  { id: '2026-01-12_0845_0930', date: '2026-01-12', heureDebut: '08:45', heureFin: '09:30' },
  {
    id: '2026-01-12_1400_1500',
    date: '2026-01-12',
    heureDebut: '14:00',
    heureFin: '15:00',
    libelle: 'Audition A1',
  },
];

describe('CreneauCalendarComponent', () => {
  let fixture: ComponentFixture<CreneauCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreneauCalendarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CreneauCalendarComponent);
    fixture.componentRef.setInput('creneaux', CRENEAUX);
    fixture.componentRef.setInput('idsSelectionnes', new Set<string>());
    fixture.detectChanges();
  });

  it('convertit chaque créneau en événement horodaté', () => {
    const evenements = fixture.componentInstance.evenements();
    const premier = evenements[0];
    expect(evenements).toHaveLength(2);
    expect(premier?.start.getHours()).toBe(8);
    expect(premier?.start.getMinutes()).toBe(45);
    expect(premier?.end?.getMinutes()).toBe(30);
    expect(premier?.end?.getHours()).toBe(9);
    expect(premier?.title).toContain('08:45');
  });

  it('marque les créneaux retenus avec la classe CSS dédiée', () => {
    fixture.componentRef.setInput('idsSelectionnes', new Set([CRENEAUX[0]?.id ?? '']));
    fixture.detectChanges();

    const evenements = fixture.componentInstance.evenements();
    expect(evenements[0]?.cssClass).toContain('creneau-retenu');
    expect(evenements[1]?.cssClass).not.toContain('creneau-retenu');
  });

  it('émet le créneau cliqué', () => {
    const emis: Creneau[] = [];
    fixture.componentInstance.basculer.subscribe((creneau) => emis.push(creneau));

    fixture.componentInstance.surClicEvenement(fixture.componentInstance.evenements()[0]!);

    expect(emis).toEqual([CRENEAUX[0]]);
  });

  it('borne la plage horaire affichée aux créneaux', () => {
    expect(fixture.componentInstance.heureDebut()).toBe(7);
    expect(fixture.componentInstance.heureFin()).toBe(16);
  });

  it('rend effectivement un événement dans la grille (date d\'événement valide)', () => {
    fixture.componentRef.setInput('idsSelectionnes', new Set([CRENEAUX[0]?.id ?? '']));
    fixture.detectChanges();
    fixture.detectChanges();

    const evenement = fixture.componentInstance.evenements()[0];
    expect(evenement?.start).toBeInstanceOf(Date);
    expect(Number.isNaN(evenement?.start.getTime())).toBe(false);

    const conteneurs = fixture.nativeElement.querySelectorAll('.cal-event-container');
    expect(conteneurs.length).toBe(CRENEAUX.length);
    expect(conteneurs[0].classList).toContain('creneau-evenement');
    expect(conteneurs[0].classList).toContain('creneau-retenu');
    expect(conteneurs[1].classList).not.toContain('creneau-retenu');
  });
});
