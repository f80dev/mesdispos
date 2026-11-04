import { A11yModule } from '@angular/cdk/a11y';
import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { CookieService } from '../../core/cookie.service';
import { AdminService } from '../../core/admin.service';
import { ROUTES } from '../../app.routes';
import { ProfService, filtrerProfs, type Prof } from '../../data/prof.service';
import { profilDepuisProf, profilDepuisSaisieLibre } from '../../data/profil.service';
import { LONGUEUR_NOM_MAX } from '../../shared/date.util';

/** Valeur synthétique du sélecteur : « je ne suis pas dans la liste ». */
export const CHOIX_AUTRE = '__autre__';

// Mobile : carte unique centrée, liste déroulante ≥ 48 px, aucun scroll
//           horizontal à 375 px.
// Desktop: carte centrée 420 px max, liste déroulante + bouton.
@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    A11yModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly cookie = inject(CookieService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly profService = inject(ProfService);
  private readonly adminService = inject(AdminService);

  private readonly champ = viewChild<ElementRef<HTMLInputElement>>('champ');
  private readonly liste = viewChild<MatSelect>('liste');

  readonly maxLength = LONGUEUR_NOM_MAX;
  readonly choixAutre = CHOIX_AUTRE;

  /**
   * Formulaire du mode « nom seul » : `prof` porte le `login` de l'enseignant
   * choisi dans la liste, `prenom` ne sert qu'au saisie libre (« Autre nom »).
   *
   * Aucun validateur `required` : la liste déroulante vide ne doit pas
   * s'afficher en état d'erreur Material (rouge) — c'est le bouton
   * « Continuer » qui est désactivé tant qu'aucun nom n'est choisi.
   */
  readonly formulaire = this.fb.group({
    prof: [''],
    prenom: ['', Validators.maxLength(LONGUEUR_NOM_MAX)],
  });

  /** Enseignants proposés, chargés depuis l'API Oasis. */
  readonly profs = this.profService.profs;
  readonly chargementProfs = this.profService.chargement;
  readonly erreurProfs = this.profService.erreur;

  /** Requête de filtrage saisie par l'utilisateur (nom / prénom). */
  readonly filtre = signal<string>('');

  /** Enseignants correspondant au filtre (nom ou prénom). */
  readonly profsFiltres = computed(() => filtrerProfs(this.profs(), this.filtre()));

  /** Vrai quand un filtre est actif mais ne retourne aucun résultat. */
  readonly filtreSansResultat = computed(
    () => this.filtre().trim().length > 0 && this.profsFiltres().length === 0,
  );

  /** Met à jour le filtre de recherche. */
  filtrer(valeur: string): void {
    this.filtre.set(valeur);
  }

  /**
   * Choix courant du sélecteur (`login` ou `CHOIX_AUTRE`).
   *
   * Signal **explicite** (et non dérivé de `valueChanges`) : le contrôle est
   * désactivé pendant le chargement de la liste, or un contrôle désactivé
   * n'émet plus `valueChanges` — la sélection mémorisée par le cookie
   * risquerait alors de ne jamais être prise en compte.
   */
  readonly choix = signal<string>('');

  /** Saisie libre courante. */
  readonly prenom = toSignal(this.formulaire.controls.prenom.valueChanges, { initialValue: '' });

  /** Vrai lorsque la saisie libre est active (option « Autre nom »). */
  readonly saisieLibre = computed(() => this.choix() === CHOIX_AUTRE);

  /** « Continuer » reste désactivé tant qu'aucun enseignant n'est choisi. */
  readonly peutContinuer = computed(() =>
    this.saisieLibre() ? this.prenom().trim().length > 0 : this.choix().length > 0,
  );

  /** Route initialement demandée (`?retour=/admin/import` ou `?retour=/dispos`). */
  private readonly retour = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('retour'))),
    { initialValue: null },
  );

  /** Vrai quand l'utilisateur tente d'atteindre l'espace administrateur. */
  readonly demandeAdmin = computed(() => this.retour() === ROUTES.admin);

  readonly enCoursAdmin = signal<boolean>(false);
  readonly erreurAdmin = signal<string | null>(null);
  readonly uidAdmin = signal<string | null>(null);

  /** Message d'erreur de la session « nom seul » (nom invalide). */
  readonly erreur = signal<string | null>(null);

  constructor() {
    // Le sélecteur est désactivé tant que la liste des enseignants n'est pas
    // arrivée (en cas d'échec, la saisie libre reste possible).
    effect(() => {
      const controle = this.formulaire.controls.prof;
      if (this.chargementProfs()) {
        controle.disable({ emitEvent: false });
      } else {
        controle.enable({ emitEvent: false });
      }
    });

    // La liste déroulante prend le focus à l'ouverture de /login, pour que le
    // parcours complet tienne en moins de 3 interactions au pouce.
    afterNextRender(() => {
      void this.profService.charger().then(() => {
        this.reprendreNomDuCookie();
        if (this.erreurProfs()) {
          // Liste indisponible : on bascule d'emblée en saisie libre.
          this.selectionner(CHOIX_AUTRE);
        } else {
          this.liste()?.focus();
        }
      });
    });

    // Le champ de saisie libre prend le focus dès qu'il apparaît (il n'existe
    // qu'en mode « Autre nom »). `viewChild` étant un signal, l'effet est
    // rejoué dès que l'élément est rendu.
    //
    // Le focus est posé avec un petit délai : à la fermeture du panneau
    // `mat-select`, Material rend le focus à son déclencheur — il faut donc
    // passer **après** cette restauration, sinon le champ libre ne le garde
    // pas.
    effect(() => {
      const champ = this.champ();
      if (this.saisieLibre() && champ) {
        setTimeout(() => champ.nativeElement.focus(), 250);
      }
    });

    // Retour d'une connexion Google par redirect (mobile) : la session admin
    // est restaurée par `onAuthStateChanged` après le rechargement. On vérifie
    // alors les droits et on ouvre l'import si l'utilisateur est autorisé.
    effect(() => {
      const admin = this.auth.sessionAdmin();
      if (admin && this.demandeAdmin()) {
        void this.verifierEtOuvrir(admin.uid);
      }
    });

    // Filtre réduit à un seul enseignant : on le sélectionne puis on enchaîne
    // directement sur la connexion (parcours réduit à une seule saisie).
    effect(() => {
      const filtre = this.filtre().trim();
      const liste = this.profsFiltres();
      if (filtre.length === 0 || liste.length !== 1) {
        return;
      }
      untracked(() => {
        this.selectionner(liste[0].login);
        void this.continuer();
      });
    });
  }

  /** Enseignant correspondant au `login` sélectionné. */
  private profChoisi(): Prof | null {
    const login = this.choix();
    if (!login || login === CHOIX_AUTRE) {
      return null;
    }
    return this.profs().find((prof) => prof.login === login) ?? null;
  }

  /**
   * Pré-sélection : si le cookie contient le nom d'un enseignant connu, on
   * le sélectionne dans la liste ; sinon on bascule en saisie libre afin que
   * l'utilisateur retrouve exactement ce qu'il avait saisi.
   */
  private reprendreNomDuCookie(): void {
    const nomCookie = this.cookie.lireNom();
    if (!nomCookie) {
      return;
    }
    const prof = this.profs().find((p) => p.nomComplet === nomCookie);
    if (prof) {
      this.selectionner(prof.login);
    } else {
      this.formulaire.controls.prenom.setValue(nomCookie);
      this.selectionner(CHOIX_AUTRE);
    }
  }

  /**
   * Applique un choix : le signal `choix` (source de vérité de l'affichage) et
   * le contrôle de formulaire sont mis à jour de concert.
   */
  private selectionner(valeur: string): void {
    this.choix.set(valeur);
    this.formulaire.controls.prof.setValue(valeur);
  }

  /** Changement de sélection dans la liste déroulante. */
  choisir(valeur: string): void {
    this.selectionner(valeur);
    if (this.saisieLibre()) {
      this.formulaire.controls.prenom.setValue('');
    }
  }

  /** Relance le chargement de la liste des enseignants. */
  reessayerProfs(): void {
    this.profService.reessayer();
  }

  /** Soumission du formulaire « nom seul ». */
  async continuer(): Promise<void> {
    if (!this.peutContinuer()) {
      return;
    }
    const prof = this.profChoisi();
    const nom = this.saisieLibre() ? this.prenom() : (prof?.nomComplet ?? '');
    if (!nom.trim()) {
      return;
    }
    // Une session « nom seul » n'ouvre pas l'espace administrateur : on
    // renvoie le professeur vers ses disponibilités.
    const cible =
      this.demandeAdmin() && !this.auth.sessionAdmin()
        ? ROUTES.dispos
        : (this.retour() ?? ROUTES.dispos);
    this.erreur.set(null);
    // Identité persistée dans `users/{uid}` : `login`, `nom` et `prénom`.
    const identite = this.saisieLibre()
      ? profilDepuisSaisieLibre(this.prenom())
      : prof
        ? profilDepuisProf(prof)
        : undefined;
    const ok = await this.auth.connecterParNom(nom, identite);
    if (ok) {
      await this.router.navigateByUrl(cible);
    } else {
      this.erreur.set(this.auth.erreur() ?? 'Nom invalide.');
    }
  }

  /**
   * Connexion administrateur : **Google** (Firebase Auth). L'uid obtenu doit
   * exister dans la collection `admins` pour ouvrir `/admin/import`.
   */
  async connecterAdmin(): Promise<void> {
    this.erreurAdmin.set(null);
    this.uidAdmin.set(null);
    this.uidVerifie = null;
    this.enCoursAdmin.set(true);
    try {
      const ok = await this.auth.connecterGoogle();
      if (!ok) {
        this.erreurAdmin.set(this.auth.erreur() ?? 'Connexion administrateur impossible.');
        return;
      }
      const uid = this.auth.sessionAdmin()?.uid ?? null;
      if (uid) {
        await this.verifierEtOuvrir(uid);
      }
    } finally {
      this.enCoursAdmin.set(false);
    }
  }

  /** Dernier `uid` dont les droits ont été vérifiés (évite les appels en boucle). */
  private uidVerifie: string | null = null;

  /**
   * Vérifie `admins/{uid}` puis ouvre l'import. Sinon, affiche l'erreur et
   * l'identifiant à inscrire dans la console Firebase.
   */
  private async verifierEtOuvrir(uid: string): Promise<void> {
    if (this.uidVerifie === uid) {
      return;
    }
    this.uidVerifie = uid;
    this.uidAdmin.set(uid);
    if (await this.adminService.verifier(uid)) {
      await this.router.navigateByUrl(ROUTES.admin);
      return;
    }
    this.erreurAdmin.set(
      "Accès refusé : ce compte Google n'est pas administrateur. Ajoutez le document admins/" +
        `${uid} depuis la console Firebase.`,
    );
  }

  /**
   * « Utiliser un autre nom » : efface le cookie, bascule en saisie libre et
   * remet le focus dans le champ.
   */
  utiliserUnAutreNom(): void {
    this.auth.oublierNom();
    this.selectionner(CHOIX_AUTRE);
    this.formulaire.controls.prenom.setValue('');
  }
}
