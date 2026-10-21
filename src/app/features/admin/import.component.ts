import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ErreurImport, ExcelImportService, MESSAGE_FORMAT } from '../../data/excel-import.service';
import { NotifService } from '../../core/notif.service';
import { DateGroupPipe } from '../../layout/date-group.pipe';
import type { LigneImport, ResultatImport } from '../../data/models';

// Mobile  : zone de dépôt pleine largeur, aperçu en cartes, détail des lignes
//           invalides replié, bouton d'import 48 px.
// Desktop : aperçu en tableau (4 colonnes), zone de dépôt centrée.
@Component({
  selector: 'app-import',
  imports: [
    DateGroupPipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './import.component.html',
  styleUrl: './import.component.scss',
})
export class ImportComponent {
  private readonly importService = inject(ExcelImportService);
  private readonly notif = inject(NotifService);

  private readonly champFichier = viewChild<ElementRef<HTMLInputElement>>('fichier');

  readonly nomFichier = signal<string | null>(null);
  readonly lectureEnCours = signal<boolean>(false);
  readonly importEnCours = signal<boolean>(false);
  readonly survol = signal<boolean>(false);
  readonly resultat = signal<ResultatImport | null>(null);
  readonly message = signal<string | null>(null);

  readonly valides = computed(() => this.resultat()?.valides ?? []);
  readonly invalides = computed(() => this.resultat()?.invalides ?? []);
  readonly totalValides = computed(() => this.valides().length);

  readonly groupsValides = computed(() => {
    const groupes = new Map<string, LigneImport[]>();
    for (const ligne of this.valides()) {
      const groupe = groupes.get(ligne.date);
      if (groupe) {
        groupe.push(ligne);
      } else {
        groupes.set(ligne.date, [ligne]);
      }
    }
    return [...groupes.entries()].map(([date, lignes]) => ({ date, lignes }));
  });

  /** Ouvre le sélecteur de fichiers (la zone de dépôt reste cliquable). */
  choisirFichier(): void {
    this.champFichier()?.nativeElement.click();
  }

  /** Réception du fichier via le `input[type=file]` ou le drag & drop. */
  async surFichier(evenement: Event): Promise<void> {
    const input = evenement.target as HTMLInputElement;
    const fichier = input.files?.[0];
    input.value = '';
    if (fichier) {
      await this.analyser(fichier);
    }
  }

  async surDepot(evenement: DragEvent): Promise<void> {
    evenement.preventDefault();
    this.survol.set(false);
    const fichier = evenement.dataTransfer?.files?.[0];
    if (fichier) {
      await this.analyser(fichier);
    }
  }

  private async analyser(fichier: File): Promise<void> {
    this.message.set(null);
    this.resultat.set(null);
    this.nomFichier.set(fichier.name);
    this.lectureEnCours.set(true);
    try {
      this.resultat.set(await this.importService.lire(fichier));
    } catch (erreur) {
      this.message.set(erreur instanceof ErreurImport ? erreur.message : MESSAGE_FORMAT);
    } finally {
      this.lectureEnCours.set(false);
    }
  }

  /** Upsert batch des lignes valides (F6). */
  async importer(): Promise<void> {
    const lignes = this.valides();
    if (lignes.length === 0) {
      return;
    }
    this.importEnCours.set(true);
    try {
      const { importes } = await this.importService.importer(lignes);
      this.notif.succes(
        `${importes} créneaux importés, ${this.invalides().length} lignes ignorées`,
      );
      this.resultat.set({ valides: [], invalides: this.invalides() });
      this.nomFichier.set(null);
    } catch (erreur) {
      this.notif.erreur(erreur instanceof Error ? erreur.message : "L'import a échoué. Réessayez.");
    } finally {
      this.importEnCours.set(false);
    }
  }
}
