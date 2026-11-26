import {
  Component,
  ElementRef,
  computed,
  effect,
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
import { ProfsImportService, type ResultatImportProfs } from '../../data/profs-import.service';
import type { LigneProfImport } from '../../data/prof.service';
import { BackupService, MESSAGE_BACKUP_ECHEC } from '../../core/backup.service';
import { ComposantAdmin } from '../../core/composant-admin';
import { ConfigService } from '../../data/config.service';
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
    DateGroupPipe,
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
  private readonly profsImport = inject(ProfsImportService);
  private readonly creneaux = inject(CreneauService);
  private readonly planningApi = inject(PlanningApiService);
  private readonly attribution = inject(AttributionService);
  private readonly backup = inject(BackupService);
  private readonly config = inject(ConfigService);

  /**
   * Date limite de réponse : lue **en base** (`config/app`), modifiable par
   * l'administrateur depuis cette page.
   */
  readonly deadline = this.config.deadline;

  /** Valeur du champ de saisie (format `YYYY-MM-DD`). */
  readonly deadlineSaisi = signal<string>(this.config.deadline());

  /** `true` pendant l'écriture de la date limite en base. */
  readonly deadlineEnCours = signal<boolean>(false);

  /** Message d'erreur de l'enregistrement de la date limite. */
  readonly deadlineErreur = signal<string | null>(null);

  /** `true` tant que l'administrateur saisit la date (évite l'écrasement). */
  private readonly saisieActive = signal<boolean>(false);

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
  private readonly champFichierProfs = viewChild<ElementRef<HTMLInputElement>>('fichierProfs');

  readonly nomFichier = signal<string | null>(null);
  readonly lectureEnCours = signal<boolean>(false);
  readonly importEnCours = signal<boolean>(false);
  readonly survol = signal<boolean>(false);
  readonly resultat = signal<ResultatImport | null>(null);
  readonly message = signal<string | null>(null);

  /** État de l'import de la **liste des professeurs** (`profs.xlsx`). */
  readonly nomFichierProfs = signal<string | null>(null);
  readonly lectureProfsEnCours = signal<boolean>(false);
  readonly importProfsEnCours = signal<boolean>(false);
  readonly survolProfs = signal<boolean>(false);
  readonly resultatProfs = signal<ResultatImportProfs | null>(null);
  readonly messageProfs = signal<string | null>(null);

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

  /** `true` pendant la fabrication/téléchargement de l'archive de sauvegarde. */
  readonly backupEnCours = signal<boolean>(false);

  /** Message d'erreur de la sauvegarde (`null` si tout va bien). */
  readonly backupErreur = signal<string | null>(null);

  /** `true` quand la confirmation d'effacement des professeurs est affichée. */
  readonly confirmationSuppressionProfs = signal<boolean>(false);

  /** `true` pendant l'effacement des professeurs. */
  readonly suppressionProfsEnCours = signal<boolean>(false);

  /** Message d'erreur de l'effacement des professeurs (`null` si tout va bien). */
  readonly erreurProfs = signal<string | null>(null);

  /**
   * L'import est **réservé à l'administrateur** : tant que la session
   * courante n'est pas inscrite dans `admins`, aucune zone de dépôt n'est
   * affichée et toute action d'import est refusée (le `adminGuard` bloque
   * déjà la route ; ce contrôle est une seconde barrière, côté interface).
   */

  readonly valides = computed(() => this.resultat()?.valides ?? []);
  readonly invalides = computed(() => this.resultat()?.invalides ?? []);
  readonly totalValides = computed(() => this.valides().length);

  readonly profsValides = computed(() => this.resultatProfs()?.valides ?? []);
  readonly profsInvalides = computed(() => this.resultatProfs()?.invalides ?? []);
  readonly totalProfsValides = computed(() => this.profsValides().length);

  constructor() {
    super();
    // Les créneaux proposés sont chargés en temps réel sur la page admin :
    // l'attribution automatique en a besoin (et la suppression totale doit
    // refléter l'état courant de la base).
    this.creneaux.ecouter();
    // La date limite provient de `config/app` : on l'écoute pour rester à
    // jour, et on suit la base tant que l'administrateur ne saisit rien.
    this.config.ecouter();
    effect(() => {
      const valeur = this.config.deadline();
      if (!this.saisieActive()) {
        this.deadlineSaisi.set(valeur);
      }
    });
  }

  /** Saisie de la date limite (champ `type="date"`). */
  surDeadline(evenement: Event): void {
    const valeur = (evenement.target as HTMLInputElement).value;
    this.saisieActive.set(true);
    this.deadlineErreur.set(null);
    this.deadlineSaisi.set(valeur);
  }

  /**
   * Enregistre la date limite dans `config/app` : elle s'applique
   * immédiatement à tous les clients (compte à rebours du header).
   */
  async enregistrerDeadline(): Promise<void> {
    if (!this.exigerAdmin()) {
      return;
    }
    const valeur = this.deadlineSaisi().trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
      this.deadlineErreur.set('Saisissez une date valide (format JJ/MM/AAAA).');
      return;
    }
    this.deadlineEnCours.set(true);
    this.deadlineErreur.set(null);
    try {
      const ok = await this.config.enregistrerDeadline(valeur);
      if (!ok) {
        this.deadlineErreur.set(
          this.config.erreur() ?? 'La date limite n’a pas pu être enregistrée.',
        );
        return;
      }
      this.saisieActive.set(false);
      this.deadlineSaisi.set(this.config.deadline());
      this.notif.succes('Date limite de réponse enregistrée.');
    } catch (erreur) {
      this.deadlineErreur.set(
        erreur instanceof Error ? erreur.message : 'La date limite n’a pas pu être enregistrée.',
      );
    } finally {
      this.deadlineEnCours.set(false);
    }
  }

  ngOnDestroy(): void {
    this.creneaux.arreter();
    this.config.arreter();
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

  /** Ouvre le sélecteur de fichiers des professeurs. */
  choisirFichierProfs(): void {
    if (!this.exigerAdmin()) {
      return;
    }
    this.champFichierProfs()?.nativeElement.click();
  }

  /** Réception du fichier `profs.xlsx` (input file ou drag & drop). */
  async surFichierProfs(evenement: Event): Promise<void> {
    const input = evenement.target as HTMLInputElement;
    const fichier = input.files?.[0];
    input.value = '';
    if (fichier) {
      await this.analyserProfs(fichier);
    }
  }

  async surDepotProfs(evenement: DragEvent): Promise<void> {
    evenement.preventDefault();
    this.survolProfs.set(false);
    const fichier = evenement.dataTransfer?.files?.[0];
    if (fichier) {
      await this.analyserProfs(fichier);
    }
  }

  private async analyserProfs(fichier: File): Promise<void> {
    if (!this.autorise()) {
      this.messageProfs.set(this.messageAdminRequis);
      return;
    }
    this.messageProfs.set(null);
    this.resultatProfs.set(null);
    this.nomFichierProfs.set(fichier.name);
    this.lectureProfsEnCours.set(true);
    try {
      this.resultatProfs.set(await this.profsImport.lire(fichier));
    } catch (erreur) {
      this.messageProfs.set(erreur instanceof ErreurImport ? erreur.message : MESSAGE_FORMAT);
    } finally {
      this.lectureProfsEnCours.set(false);
    }
  }

  /** Upsert batch des professeurs valides dans `users`. */
  async importerProfs(): Promise<void> {
    const lignes = this.profsValides();
    if (lignes.length === 0) {
      return;
    }
    if (!this.exigerAdmin()) {
      return;
    }
    this.importProfsEnCours.set(true);
    try {
      const { importes } = await this.profsImport.importer(lignes);
      this.notif.succes(
        `${importes} professeur(s) importé(s), ${this.profsInvalides().length} ligne(s) ignorée(s)`,
      );
      this.resultatProfs.set({ valides: [], invalides: this.profsInvalides() });
      this.nomFichierProfs.set(null);
    } catch (erreur) {
      this.notif.erreur(erreur instanceof Error ? erreur.message : "L'import a échoué. Réessayez.");
    } finally {
      this.importProfsEnCours.set(false);
    }
  }

  /** Nom affichable d'une ligne de professeurs (rappel dans la liste des erreurs). */
  nomLigneProf(ligne: LigneProfImport): string {
    return [ligne.prenom, ligne.nom].filter(Boolean).join(' ') || ligne.login;
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

  /**
   * Produit l'archive ZIP de sauvegarde complète de la base et déclenche son
   * téléchargement (créneaux, profils de professeurs, disponibilités).
   */
  async sauvegarder(): Promise<void> {
    if (!this.exigerAdmin()) {
      return;
    }
    this.backupEnCours.set(true);
    this.backupErreur.set(null);
    try {
      const resume = await this.backup.telecharger();
      this.notif.succes(
        `Sauvegarde téléchargée : ${resume.creneaux} créneau(x), ${resume.profils} professeur(s), ${resume.dispos} disponibilité(s).`,
      );
    } catch (erreur) {
      this.backupErreur.set(erreur instanceof Error ? erreur.message : MESSAGE_BACKUP_ECHEC);
      this.notif.erreur(erreur instanceof Error ? erreur.message : MESSAGE_BACKUP_ECHEC);
    } finally {
      this.backupEnCours.set(false);
    }
  }

  /** Affiche la confirmation avant l'effacement de tous les professeurs. */
  demanderSuppressionProfs(): void {
    if (!this.exigerAdmin()) {
      return;
    }
    this.erreurProfs.set(null);
    this.confirmationSuppressionProfs.set(true);
  }

  /** Referme la confirmation sans rien supprimer. */
  annulerSuppressionProfs(): void {
    this.confirmationSuppressionProfs.set(false);
  }

  /**
   * Efface **tous les professeurs** de la base : profils (`users/{uid}`) et
   * disponibilités (`users/{uid}/dispos`). Action irréversible.
   */
  async supprimerProfs(): Promise<void> {
    if (!this.exigerAdmin()) {
      return;
    }
    this.suppressionProfsEnCours.set(true);
    this.erreurProfs.set(null);
    try {
      const { profils, dispos } = await this.admin.supprimerTousLesProfils();
      this.notif.succes(`${profils} professeur(s) et ${dispos} disponibilité(s) effacés.`);
      this.confirmationSuppressionProfs.set(false);
    } catch (erreur) {
      this.erreurProfs.set(
        erreur instanceof Error ? erreur.message : 'La suppression a échoué. Réessayez.',
      );
      this.notif.erreur(
        erreur instanceof Error ? erreur.message : 'La suppression a échoué. Réessayez.',
      );
    } finally {
      this.suppressionProfsEnCours.set(false);
    }
  }
}
