import { Component, computed, inject, signal, type OnDestroy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { CalendarEvent } from 'angular-calendar';

import { ComposantAdmin } from '../../core/composant-admin';
import { DispoProfService, filtrerProfsDispo, type ProfDispo } from '../../data/dispo-prof.service';
import { CreneauService } from '../../data/creneau.service';
import { PlanningExportService } from '../../data/planning-export.service';
import { ProfService, type Prof } from '../../data/prof.service';
import { creneauVersIntervalle } from '../../shared/date.util';
import { avecValeurs, basculerValeur } from '../../shared/collection.util';
import { ProfsCalendarComponent } from './profs-calendar.component';
import {
  MatAccordion,
  MatExpansionPanel,
  MatExpansionPanelHeader,
} from '@angular/material/expansion';

/** Colonnes triables du tableau des professeurs. */
export type ColonneTri = 'prof' | 'nombre' | 'secteur' | 'mail';

/** Sens de tri. */
export type SensTri = 'asc' | 'desc';

/**
 * Nombre de variantes de couleur attribuées aux professeurs dans le
 * calendrier (rôles M3 : primary, secondary, tertiary, success, error,
 * surface). Au-delà, les couleurs sont recyclées.
 */
export const PALETTE_PROFS = 6;

// Mobile  : liste des professeurs (cases à cocher) au-dessus du calendrier,
//           colonne unique, cibles tactiles ≥ 48 px.
// Desktop : liste sur 2 colonnes au-dessus du calendrier, largeur max 1100 px.
@Component({
  selector: 'app-dispo-prof',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTooltipModule,
    ProfsCalendarComponent,
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelHeader,
  ],
  templateUrl: './dispo-prof.component.html',
  styleUrl: './dispo-prof.component.scss',
})
export class DispoProfComponent extends ComposantAdmin implements OnDestroy {
  private readonly service = inject(DispoProfService);
  private readonly annuaireService = inject(ProfService);
  private readonly creneauxService = inject(CreneauService);
  private readonly exportService = inject(PlanningExportService);

  /** Tous les professeurs ayant déclaré au moins une disponibilité. */
  readonly profs = this.service.profs;

  /** Vrai pendant la lecture des disponibilités. */
  readonly chargement = this.service.chargement;

  /** Message d'erreur de lecture. */
  readonly erreur = this.service.erreur;

  /** Texte de recherche dans la liste des professeurs. */
  readonly recherche = signal<string>('');

  /** `uid` des professeurs cochés. */
  readonly selection = signal<ReadonlySet<string>>(new Set<string>());

  /** Colonne de tri active (`null` : tri par défaut). */
  readonly triColonne = signal<ColonneTri | null>(null);

  /** Sens de tri actif. */
  readonly triSens = signal<SensTri>('asc');

  /** Professeurs affichés dans la liste (après recherche, puis tri). */
  readonly profsAffiches = computed(() => {
    const liste = filtrerProfsDispo(this.profs(), this.recherche(), (prof) => this.secteur(prof));
    const colonne = this.triColonne();
    if (!colonne) {
      return liste;
    }
    const sens = this.triSens() === 'asc' ? 1 : -1;
    return [...liste].sort((a, b) => sens * this.compareColonne(a, b, colonne));
  });

  /** Nombre de professeurs cochés. */
  readonly nombreCoches = computed(() => this.selection().size);

  /**
   * Événements du calendrier : une disponibilité par professeur et par
   * créneau. **Seuls les créneaux des professeurs cochés** dans le tableau
   * `tblProfs` sont affichés.
   */
  readonly evenements = computed<CalendarEvent[]>(() => {
    const selection = this.selection();
    const evenements: CalendarEvent[] = [];
    this.profs().forEach((prof, index) => {
      if (!selection.has(prof.uid)) {
        return;
      }
      for (const dispo of prof.dispos) {
        const intervalle = creneauVersIntervalle(dispo);
        if (!intervalle) {
          continue;
        }
        const classes = ['creneau-evenement', 'prof-evenement', `prof-c${index % PALETTE_PROFS}`];
        classes.push('prof-selectionne');
        evenements.push({
          id: `${prof.uid}_${dispo.creneauId}`,
          title: `${dispo.heureDebut} – ${dispo.heureFin}`,
          start: intervalle.debut,
          end: intervalle.fin,
          cssClass: classes.join(' '),
          meta: { prof, dispo },
        });
      }
    });
    return evenements;
  });

  /** Nombre de disponibilités affichées dans le calendrier. */
  readonly nombreEvenements = computed(() => this.evenements().length);

  /**
   * Annuaire des enseignants (API Oasis) indexé par `login` : il apporte le
   * secteur de rattachement et l'adresse professionnelle, absents des
   * documents de disponibilité.
   */
  readonly annuaire = computed<ReadonlyMap<string, Prof>>(
    () => new Map(this.annuaireService.profs().map((prof) => [prof.login, prof])),
  );

  /** `true` pendant la génération du classeur Excel. */
  readonly exportEnCours = signal<boolean>(false);

  constructor() {
    super();
    void this.service.charger();
    void this.annuaireService.charger();
    // Les créneaux proposés sont chargés en temps réel : ils constituent les
    // colonnes du planning exporté.
    this.creneauxService.ecouter();
  }

  ngOnDestroy(): void {
    this.creneauxService.arreter();
  }

  /**
   * Exporte le planning des professeurs dans un classeur Excel : une ligne
   * par professeur, une colonne « Anglais » (capacité à comprendre l’anglais)
   * puis une colonne par créneau (`X` = disponible).
   */
  async exporter(): Promise<void> {
    if (!this.exigerAdmin()) {
      return;
    }
    this.exportEnCours.set(true);
    try {
      const resultat = await this.exportService.exporter(
        this.profs(),
        this.creneauxService.creneaux(),
      );
      this.notif.succes(
        `Planning exporté : ${resultat.professeurs} professeur(s), ${resultat.creneaux} créneau(x).`,
      );
    } catch (erreur) {
      console.warn('[MesDispos] Export du planning impossible :', erreur);
      this.notif.erreur(erreur instanceof Error ? erreur.message : "L'export a échoué. Réessayez.");
    } finally {
      this.exportEnCours.set(false);
    }
  }

  /** Secteur de rattachement d'un professeur (`—` si inconnu). */
  secteur(prof: ProfDispo): string {
    const secteur = this.annuaire().get(prof.login)?.secteur?.trim();
    return secteur && secteur.length > 0 ? secteur : '—';
  }

  /** Adresse professionnelle d'un professeur (`null` si inconnue). */
  mail(prof: ProfDispo): string | null {
    const mail = this.annuaire().get(prof.login)?.mailPro?.trim();
    return mail && mail.length > 0 ? mail : null;
  }

  /**
   * Nombre de créneaux **déclarés** par un professeur : tous les créneaux
   * qu'il a rendus disponibles, cochés ou non. La case à cocher ne modifie
   * que la mise en évidence dans le calendrier, pas le décompte.
   */
  nombreCreneauxPlannifies(prof: ProfDispo): number {
    return prof.dispos.length;
  }

  /**
   * Adresse `mailto:` pour contacter un professeur (sujet et corps préremplis).
   * `null` si l'adresse professionnelle est inconnue.
   */
  lienMail(prof: ProfDispo): string | null {
    const mail = this.mail(prof);
    if (!mail) {
      return null;
    }
    const sujet = 'Vos disponibilités — MesDispos';
    const corps = `Bonjour ${prof.prenom || prof.nomComplet},\n\n. N'oubliez pas de saisir l'ensemble de vos disponibilités pour les soutenances de mémoire avant le 31 janvier afin que nous puissions plannifier l'ensemble de ses soutenances au plus vite`;
    return `mailto:${mail}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  }

  /**
   * Compare deux professeurs selon une colonne triable. Renvoie un nombre
   * négatif, nul ou positif (convention `Array.prototype.sort`).
   */
  private compareColonne(a: ProfDispo, b: ProfDispo, colonne: ColonneTri): number {
    switch (colonne) {
      case 'nombre':
        return this.nombreCreneauxPlannifies(a) - this.nombreCreneauxPlannifies(b);
      case 'secteur':
        return this.compareTexte(this.secteur(a), this.secteur(b));
      case 'mail':
        return this.compareTexte(this.mail(a) ?? '', this.mail(b) ?? '');
      case 'prof':
      default:
        return this.compareTexte(a.nomComplet, b.nomComplet);
    }
  }

  /** Comparaison textuelle insensible à la casse et aux accents. */
  private compareTexte(a: string, b: string): number {
    return a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true });
  }

  /**
   * Tri par colonne : un premier clic sur une colonne trie par ordre
   * croissant, un second clic inverse le sens, un clic sur une autre colonne
   * change de colonne (réinitialisant le sens en croissant).
   */
  trier(colonne: ColonneTri): void {
    if (this.triColonne() === colonne) {
      this.triSens.set(this.triSens() === 'asc' ? 'desc' : 'asc');
      return;
    }
    this.triColonne.set(colonne);
    this.triSens.set('asc');
  }

  /** `aria-sort` de l'en-tête de colonne (pour les lecteurs d'écran). */
  ariaSort(colonne: ColonneTri): 'ascending' | 'descending' | 'none' {
    if (this.triColonne() !== colonne) {
      return 'none';
    }
    return this.triSens() === 'asc' ? 'ascending' : 'descending';
  }

  /** Icône de tri de l'en-tête (vide si la colonne n'est pas triée). */
  iconeTri(colonne: ColonneTri): string {
    if (this.triColonne() !== colonne) {
      return 'unfold_more';
    }
    return this.triSens() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  /** Met à jour le texte de recherche à partir de l'événement `input`. */
  surRecherche(evenement: Event): void {
    this.recherche.set((evenement.target as HTMLInputElement).value);
  }

  /** Coche / décoche un professeur. */
  basculer(uid: string, coche: boolean): void {
    this.selection.set(basculerValeur(this.selection(), uid, coche));
  }

  /** `true` si le professeur est coché. */
  estCoche(uid: string): boolean {
    return this.selection().has(uid);
  }

  /** Coche tous les professeurs affichés (après recherche). */
  toutCocher(): void {
    this.selection.set(
      avecValeurs(
        this.selection(),
        this.profsAffiches().map((prof) => prof.uid),
      ),
    );
  }

  /** Décoche tous les professeurs. */
  toutDecocher(): void {
    this.selection.set(new Set<string>());
  }

  /** Bouton « Réessayer ». */
  recharger(): void {
    void this.service.charger();
  }
}
