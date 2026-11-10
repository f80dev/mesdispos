import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ComposantAdmin } from '../../core/composant-admin';
import {
  MESSAGE_COPIE_ECHEC,
  PromptIaService,
  URL_GABARIT,
  URL_MEMOIRES,
  URL_SALLES,
} from '../../data/prompt-ia.service';
import {
  PlanningImportService,
  type LignePlanning,
  type ResultatPlanning,
  type Soutenance,
} from '../../data/planning-import.service';
import { PlanningCalendarComponent } from './planning-calendar.component';
// Mobile  : boutons pleine largeur (48 px), compteurs sur une ligne,
//           aperçu du prompt replié (défilement interne autorisé).
// Desktop : boutons alignés à gauche, aperçu sur toute la largeur.
@Component({
  selector: 'app-prompt-ia',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    PlanningCalendarComponent,
  ],
  templateUrl: './prompt.component.html',
  styleUrl: './prompt.component.scss',
})
export class PromptIaComponent extends ComposantAdmin {
  private readonly promptService = inject(PromptIaService);
  private readonly planningService = inject(PlanningImportService);

  readonly enCours = this.promptService.enCours;
  readonly erreur = this.promptService.erreur;
  readonly prompt = this.promptService.prompt;
  readonly statistiques = this.promptService.statistiques;

  /** Vrai pendant la copie dans le presse-papiers. */
  readonly copieEnCours = signal<boolean>(false);

  /** Fichiers utilisés : affichés pour que l'administrateur sache ce qui est lu. */
  readonly urlGabarit = URL_GABARIT;
  readonly urlMemoires = URL_MEMOIRES;
  readonly urlSalles = URL_SALLES;

  /** Classeur des mémoires importé par l'administrateur (`null` si défaut). */
  readonly fichierMemoires = this.promptService.fichierMemoires;

  /** Nombre de mémoires contenues dans le classeur importé. */
  readonly nbMemoiresImportees = this.promptService.nbMemoiresImportees;

  /**
   * Importe un classeur des mémoires au format `memoires.xlsx`.
   *
   * Le fichier remplace `public/memoires.xlsx` pour les prochaines
   * générations de prompt ; il reste en mémoire.
   */
  async importMemoires(evenement: Event): Promise<void> {
    const champ = evenement.target as HTMLInputElement;
    const fichier = champ.files?.[0];
    if (!fichier) {
      return;
    }
    try {
      const nombre = await this.promptService.importerMemoires(fichier);
      this.notif.succes(
        `${nombre} mémoire(s) importée(s) depuis ${fichier.name}. Le prompt utilisera ce fichier.`,
      );
    } catch (erreur) {
      this.notif.erreur(erreur instanceof Error ? erreur.message : 'Import impossible.');
    } finally {
      champ.value = '';
    }
  }

  /** Retire le classeur importé : le fichier par défaut est de nouveau utilisé. */
  retirerMemoires(): void {
    this.promptService.retirerMemoires();
    this.notif.info('Liste des mémoires retirée : le fichier par défaut est réutilisé.');
  }

  /** Nom du classeur de planning importé (`null` si aucun). */
  readonly fichierPlanning = signal<string | null>(null);

  /** Vrai pendant la lecture du classeur de planning. */
  readonly lecturePlanning = signal<boolean>(false);

  /** Soutenances du planning importé (source du calendrier). */
  readonly soutenances = signal<Soutenance[]>([]);

  /** Lignes du planning rejetées, avec leur message. */
  readonly lignesInvalides = signal<LignePlanning[]>([]);

  /**
   * Importe le **planning de soutenances** produit par l'IA (le classeur
   * `.xlsx` renvoyé après collage du prompt dans une IA).
   *
   * Le planning est affiché dans un calendrier hebdomadaire filtrable par
   * salle ; le fichier reste en mémoire, rien n'est envoyé.
   */
  async importPlanning(evenement: Event): Promise<void> {
    const champ = evenement.target as HTMLInputElement;
    const fichier = champ.files?.[0];
    if (!fichier) {
      return;
    }
    if (!this.exigerAdmin()) {
      champ.value = '';
      return;
    }
    this.lecturePlanning.set(true);
    try {
      const resultat: ResultatPlanning = await this.planningService.lire(fichier);
      this.soutenances.set(resultat.valides);
      this.lignesInvalides.set(resultat.invalides);
      this.fichierPlanning.set(fichier.name);
      const ignorees = resultat.invalides.length;
      this.notif.succes(
        `${resultat.valides.length} soutenance(s) importée(s) depuis ${fichier.name}` +
          (ignorees > 0 ? `, ${ignorees} ligne(s) ignorée(s).` : '.'),
      );
    } catch (erreur) {
      this.notif.erreur(
        erreur instanceof Error ? erreur.message : 'Import du planning impossible.',
      );
    } finally {
      this.lecturePlanning.set(false);
      champ.value = '';
    }
  }

  /** Retire le planning importé : le calendrier est vidé. */
  retirerPlanning(): void {
    this.soutenances.set([]);
    this.lignesInvalides.set([]);
    this.fichierPlanning.set(null);
    this.notif.info('Planning retiré.');
  }

  /** Assemble le prompt (gabarit + CSV) sans le copier. */
  async generer(): Promise<void> {
    if (!this.exigerAdmin()) {
      return;
    }
    try {
      await this.promptService.generer();
      this.notif.info('Prompt généré : il est prêt à être copié.');
    } catch (erreur) {
      this.notif.erreur(erreur instanceof Error ? erreur.message : 'Génération impossible.');
    }
  }

  /** Assemble (au besoin) le prompt et le copie dans le presse-papiers. */
  async copier(): Promise<void> {
    if (!this.exigerAdmin()) {
      return;
    }
    this.copieEnCours.set(true);
    try {
      const copie = await this.promptService.copier();
      if (copie) {
        this.notif.succes('Prompt copié dans le presse-papiers.');
      } else {
        this.notif.erreur(MESSAGE_COPIE_ECHEC);
      }
    } catch (erreur) {
      this.notif.erreur(erreur instanceof Error ? erreur.message : 'Copie impossible.');
    } finally {
      this.copieEnCours.set(false);
    }
  }
}
