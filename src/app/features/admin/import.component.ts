import {
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
  type OnDestroy,
} from '@angular/core';
import { JsonPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ErreurImport, ExcelImportService, MESSAGE_FORMAT } from '../../data/excel-import.service';
import { ComposantAdmin } from '../../core/composant-admin';
import { PlanningApiService } from '../../core/planning-api.service';
import { CreneauService } from '../../data/creneau.service';
import {
  AttributionService,
  NB_DISPO_FICTIVES_MAX,
  NB_DISPO_FICTIVES_MIN,
} from '../../data/attribution.service';
import { DateGroupPipe } from '../../layout/date-group.pipe';
import { AttributionComponent } from './attribution.component';
import type { ResultatImport } from '../../data/models';

// Mobile  : zone de dépôt pleine largeur, aperçu en cartes, détail des lignes
//           invalides replié, bouton d'import 48 px, boutons de suppression
//           empilés pleine largeur.
// Desktop : aperçu en tableau (4 colonnes), zone de dépôt centrée, zone de
//           suppression alignée à gauche.
@Component({
  selector: 'app-import',
  imports: [
    AttributionComponent,
    DateGroupPipe,
    JsonPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './import.component.html',
  styleUrl: './import.component.scss',
})
export class ImportComponent extends ComposantAdmin implements OnDestroy {
  private readonly importService = inject(ExcelImportService);
  private readonly creneaux = inject(CreneauService);
  private readonly planningApi = inject(PlanningApiService);
  private readonly attribution = inject(AttributionService);

  /**
   * Accès à l'API locale de planning (`AutoPlanning/api.py`) : disponible
   * **uniquement en développement** (le bouton est masqué en production).
   */
  readonly planningApiActif = this.planningApi.actif;
  readonly planningChargement = this.planningApi.chargement;
  readonly planningErreur = this.planningApi.erreur;
  readonly planningEntrees = this.planningApi.entrees;
  readonly filtresTags = signal<string>('');

  /** Déclenche `GET /calendar/json` (méthode `get_filtered_json`). */
  async chargerPlanning(): Promise<void> {
    const tags = this.filtresTags()
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    await this.planningApi.charger(tags);
  }

  /** Met à jour le champ de filtres à partir de l'événement `input`. */
  surFiltres(evenement: Event): void {
    this.filtresTags.set((evenement.target as HTMLInputElement).value);
  }

  private readonly champFichier = viewChild<ElementRef<HTMLInputElement>>('fichier');

  readonly nomFichier = signal<string | null>(null);
  readonly lectureEnCours = signal<boolean>(false);
  readonly importEnCours = signal<boolean>(false);
  readonly survol = signal<boolean>(false);
  readonly resultat = signal<ResultatImport | null>(null);
  readonly message = signal<string | null>(null);

  /** `true` quand la confirmation de suppression totale est affichée. */
  readonly confirmationSuppression = signal<boolean>(false);

  /** `true` pendant la suppression totale des créneaux. */
  readonly suppressionEnCours = signal<boolean>(false);

  /** `true` quand la confirmation de suppression des disponibilités est affichée. */
  readonly confirmationSuppressionDispos = signal<boolean>(false);

  /** `true` pendant la suppression des disponibilités des professeurs. */
  readonly suppressionDisposEnCours = signal<boolean>(false);

  /** `true` pendant la génération des disponibilités fictives. */
  readonly generationFictivesEnCours = signal<boolean>(false);

  /** `true` quand la confirmation de génération fictive est affichée. */
  readonly confirmationFictives = signal<boolean>(false);

  /** Nombre de disponibilités fictives générées par professeur (4 ou 5). */
  readonly nbFictifsMin = NB_DISPO_FICTIVES_MIN;
  readonly nbFictifsMax = NB_DISPO_FICTIVES_MAX;

  /** Message d'erreur de la génération fictive (`null` si tout va bien). */
  readonly erreurFictifs = signal<string | null>(null);

  /**
   * L'import est **réservé à l'administrateur** : tant que la session
   * courante n'est pas inscrite dans `admins`, aucune zone de dépôt n'est
   * affichée et toute action d'import est refusée (le `adminGuard` bloque
   * déjà la route ; ce contrôle est une seconde barrière, côté interface).
   */

  readonly valides = computed(() => this.resultat()?.valides ?? []);
  readonly invalides = computed(() => this.resultat()?.invalides ?? []);
  readonly totalValides = computed(() => this.valides().length);

  constructor() {
    super();
    // Les créneaux proposés sont chargés en temps réel sur la page admin :
    // l'attribution automatique en a besoin (et la suppression totale doit
    // refléter l'état courant de la base).
    this.creneaux.ecouter();
  }

  ngOnDestroy(): void {
    this.creneaux.arreter();
  }

  /** Ouvre le sélecteur de fichiers (la zone de dépôt reste cliquable). */
  choisirFichier(): void {
    if (!this.exigerAdmin()) {
      return;
    }
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
    if (!this.autorise()) {
      this.message.set(this.messageAdminRequis);
      return;
    }
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
    if (!this.exigerAdmin()) {
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

  /** Affiche la confirmation avant la suppression de tous les créneaux. */
  demanderSuppression(): void {
    if (!this.exigerAdmin()) {
      return;
    }
    this.confirmationSuppression.set(true);
  }

  /** Referme la confirmation sans rien supprimer. */
  annulerSuppression(): void {
    this.confirmationSuppression.set(false);
  }

  /** Supprime définitivement **tous** les créneaux de la base. */
  async supprimerTous(): Promise<void> {
    if (!this.exigerAdmin()) {
      return;
    }
    this.suppressionEnCours.set(true);
    try {
      const supprimes = await this.creneaux.supprimerTous();
      this.notif.succes(
        supprimes === 0
          ? 'Aucun créneau à supprimer.'
          : `${supprimes} créneau${supprimes > 1 ? 'x' : ''} supprimé${supprimes > 1 ? 's' : ''}`,
      );
    } catch (erreur) {
      this.notif.erreur(
        erreur instanceof Error ? erreur.message : 'La suppression a échoué. Réessayez.',
      );
    } finally {
      this.suppressionEnCours.set(false);
      this.confirmationSuppression.set(false);
    }
  }

  /**
   * Demande la confirmation avant la génération des disponibilités fictives.
   */
  demanderGenerationFictives(): void {
    if (!this.exigerAdmin()) {
      return;
    }
    this.confirmationFictives.set(true);
  }

  /** Referme la confirmation sans rien écrire. */
  annulerGenerationFictives(): void {
    this.confirmationFictives.set(false);
  }

  /**
   * Génère des **disponibilités fictives** pour l'ensemble des professeurs
   * de la liste (`profs.xlsx`) : chaque professeur reçoit 4 ou 5 créneaux
   * tirés au hasard parmi ceux qu'il n'a pas encore retenus.
   */
  async genererFictives(): Promise<void> {
    if (!this.exigerAdmin()) {
      return;
    }
    this.generationFictivesEnCours.set(true);
    this.erreurFictifs.set(null);
    try {
      const ecrits = await this.attribution.genererFictifs();
      this.confirmationFictives.set(false);
      if (ecrits === 0) {
        this.erreurFictifs.set(
          this.attribution.erreur() ?? 'Aucune disponibilité fictive n’a pu être générée.',
        );
        return;
      }
      this.notif.succes(
        `${ecrits} disponibilité(s) fictive(s) générée(s) (${this.nbFictifsMin} ou ${this.nbFictifsMax} par professeur).`,
      );
    } catch (erreur) {
      this.erreurFictifs.set(
        erreur instanceof Error ? erreur.message : 'La génération a échoué. Réessayez.',
      );
    } finally {
      this.generationFictivesEnCours.set(false);
    }
  }

  /** Affiche la confirmation avant la suppression des disponibilités des professeurs. */
  demanderSuppressionDispos(): void {
    if (!this.exigerAdmin()) {
      return;
    }
    this.confirmationSuppressionDispos.set(true);
  }

  /** Referme la confirmation sans rien supprimer. */
  annulerSuppressionDispos(): void {
    this.confirmationSuppressionDispos.set(false);
  }

  /** Supprime définitivement **toutes** les disponibilités déclarées. */
  async supprimerDispos(): Promise<void> {
    if (!this.exigerAdmin()) {
      return;
    }
    this.suppressionDisposEnCours.set(true);
    try {
      const supprimees = await this.admin.supprimerToutesLesDispos();
      this.notif.succes(
        supprimees === 0
          ? 'Aucune disponibilité à supprimer.'
          : `${supprimees} disponibilité${supprimees > 1 ? 's' : ''} supprimée${supprimees > 1 ? 's' : ''}`,
      );
    } catch (erreur) {
      this.notif.erreur(
        erreur instanceof Error ? erreur.message : 'La suppression a échoué. Réessayez.',
      );
    } finally {
      this.suppressionDisposEnCours.set(false);
      this.confirmationSuppressionDispos.set(false);
    }
  }
}
