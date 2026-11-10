import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PlanningCalendarComponent } from './planning-calendar.component';
import type { Soutenance } from '../../data/planning-import.service';

const SOUTENANCES: Soutenance[] = [
  {
    date: '2026-01-12',
    heureDebut: '09:00',
    heureFin: '10:00',
    titre: 'Le corps et la marge',
    etudiant: 'Alice Martin',
    directeur: 'Pr. Durand',
    jury2: 'Pr. Petit',
    jury3: 'Pr. Roy',
    salle: 'S12',
  },
  {
    date: '2026-01-13',
    heureDebut: '14:00',
    heureFin: '15:00',
    titre: 'Les voix de la ville',
    etudiant: 'Bruno Petit',
    directeur: 'Pr. Durand',
    jury2: 'Pr. Blanc',
    jury3: 'Pr. Noir',
    salle: 'S07',
  },
];

describe('PlanningCalendarComponent', () => {
  let fixture: ComponentFixture<PlanningCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanningCalendarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PlanningCalendarComponent);
    fixture.componentRef.setInput('soutenances', SOUTENANCES);
    fixture.detectChanges();
  });

  it('liste les salles du planning', () => {
    expect(fixture.componentInstance.salles()).toEqual(['S07', 'S12']);
  });

  it('se positionne par défaut sur la semaine de la première séance', () => {
    const viewDate = fixture.componentInstance.viewDate();
    expect(viewDate.getFullYear()).toBe(2026);
    expect(viewDate.getMonth()).toBe(0);
    expect(viewDate.getDate()).toBe(12);
  });

  it('coche toutes les salles par défaut', () => {
    expect(fixture.componentInstance.sallesChoisis()).toEqual(['S07', 'S12']);
  });

  it('convertit chaque soutenance en événement horodaté', () => {
    const evenements = fixture.componentInstance.evenements();
    expect(evenements).toHaveLength(2);
    expect(evenements[0]?.start.getHours()).toBe(9);
    expect(evenements[0]?.end?.getHours()).toBe(10);
    expect(evenements[0]?.title).toContain('09:00');
  });

  it('masque les soutenances des salles décochées', () => {
    fixture.componentInstance.selectionnerSalles(['S12']);
    fixture.detectChanges();

    const evenements = fixture.componentInstance.evenements();
    expect(evenements).toHaveLength(1);
    expect(evenements[0]?.meta?.soutenance?.salle).toBe('S12');
    expect(fixture.componentInstance.nombreAffiche()).toBe(1);
  });

  it('affiche toutes les salles', () => {
    fixture.componentInstance.toutMasquer();
    expect(fixture.componentInstance.evenements()).toHaveLength(0);

    fixture.componentInstance.toutAfficher();
    expect(fixture.componentInstance.evenements()).toHaveLength(2);
  });

  it('borne la plage horaire affichée aux soutenances', () => {
    expect(fixture.componentInstance.heureDebut()).toBe(8);
    expect(fixture.componentInstance.heureFin()).toBe(16);
  });
});
