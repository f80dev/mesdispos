import { Injectable, computed, signal } from '@angular/core';

/** Choix de thème proposé à l'utilisateur. */
export type ThemeChoix = 'auto' | 'clair' | 'sombre';

/** Thème effectivement appliqué à l'écran. */
export type ThemeApplique = 'clair' | 'sombre';

/** Clé de persistance de la préférence d'affichage (exception `localStorage` admise). */
const CLE_PREFERENCE = 'mesdispos_theme';

/**
 * Gère le thème de l'application : clair ou sombre.
 *
 * Le rendu est piloté par la propriété CSS `color-scheme` de l'élément racine :
 *  - `theme-clair`  → `color-scheme: light`
 *  - `theme-sombre` → `color-scheme: dark`
 *  - aucune classe  → `color-scheme: light dark` (suivi du réglage système).
 *
 * Les tokens `--mat-sys-*` étant produits par `mat.theme()` en `color-scheme`,
 * ce seul réglage suffit à basculer l'ensemble de l'interface.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** Préférence choisie par l'utilisateur (« auto » = suivi du système). */
  private readonly choix = signal<ThemeChoix>(this.lirePreference());

  /** Préférence courante, exposée au template. */
  readonly themeChoisi = this.choix.asReadonly();

  /** Thème réellement appliqué (résolution de « auto »). */
  readonly themeApplique = computed<ThemeApplique>(() => {
    const choix = this.choix();
    if (choix === 'clair') {
      return 'clair';
    }
    if (choix === 'sombre') {
      return 'sombre';
    }
    return this.systemeEstSombre() ? 'sombre' : 'clair';
  });

  /** Icône Material à afficher dans le sélecteur de thème. */
  readonly icone = computed(() => (this.themeApplique() === 'sombre' ? 'dark_mode' : 'light_mode'));

  /** Libellé accessible du sélecteur de thème. */
  readonly libelle = computed(() =>
    this.themeApplique() === 'sombre' ? 'Thème sombre' : 'Thème clair',
  );

  constructor() {
    this.appliquer();

    // Le système peut changer de thème pendant la session : on suit alors le
    // réglage tant que l'utilisateur n'a pas fait de choix explicite.
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (this.choix() === 'auto') {
          this.appliquer();
        }
      });
    }
  }

  /** Change le thème (et le mémorise). */
  choisir(choix: ThemeChoix): void {
    this.choix.set(choix);
    this.ecrirePreference(choix);
    this.appliquer();
  }

  /** Bascule clair ⇄ sombre en partant du thème actuellement appliqué. */
  basculer(): void {
    this.choisir(this.themeApplique() === 'sombre' ? 'clair' : 'sombre');
  }

  /** Applique la classe de thème sur `<html>` et met à jour la couleur de la barre système. */
  private appliquer(): void {
    if (typeof document === 'undefined') {
      return;
    }
    const racine = document.documentElement;
    const choix = this.choix();
    racine.classList.toggle('theme-clair', choix === 'clair');
    racine.classList.toggle('theme-sombre', choix === 'sombre');

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', this.themeApplique() === 'sombre' ? '#151515' : '#fcfcfc');
    }
  }

  /** Le système d'exploitation est-il en thème sombre ? */
  private systemeEstSombre(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return false;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /** Lit la préférence mémorisée (absente ou invalide ⇒ « auto »). */
  private lirePreference(): ThemeChoix {
    try {
      const valeur = localStorage.getItem(CLE_PREFERENCE);
      if (valeur === 'clair' || valeur === 'sombre' || valeur === 'auto') {
        return valeur;
      }
    } catch {
      // Stockage indisponible (navigation privée) : on reste sur « auto ».
    }
    return 'auto';
  }

  /** Mémorise la préférence d'affichage. */
  private ecrirePreference(choix: ThemeChoix): void {
    try {
      localStorage.setItem(CLE_PREFERENCE, choix);
    } catch {
      // Preference non mémorisée : le thème s'applique quand même.
    }
  }
}
