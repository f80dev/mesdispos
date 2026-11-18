import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { ThemeService } from '../core/theme.service';

// Mobile: bouton icône 48 px, menu « Clair / Sombre / Automatique ».
// Desktop: idem, aligné sur la droite du header.
@Component({
  selector: 'app-theme-switcher',
  imports: [MatIconModule, MatButtonModule, MatMenuModule],
  template: `
    <button
      matIconButton
      type="button"
      class="bascule-theme"
      [matMenuTriggerFor]="menuTheme"
      [attr.aria-label]="theme.libelle() + ' — changer de thème'"
      title="Changer de thème"
    >
      <mat-icon aria-hidden="true">{{ theme.icone() }}</mat-icon>
    </button>

    <mat-menu #menuTheme="matMenu">
      <button mat-menu-item type="button" (click)="theme.choisir('clair')">
        <mat-icon aria-hidden="true">light_mode</mat-icon>
        <span>Clair</span>
      </button>
      <button mat-menu-item type="button" (click)="theme.choisir('sombre')">
        <mat-icon aria-hidden="true">dark_mode</mat-icon>
        <span>Sombre</span>
      </button>
      <button mat-menu-item type="button" (click)="theme.choisir('auto')">
        <mat-icon aria-hidden="true">brightness_auto</mat-icon>
        <span>Automatique</span>
      </button>
    </mat-menu>
  `,
  styles: `
    .bascule-theme {
      width: 48px;
      height: 48px;
      color: var(--app-on-surface-variant);
    }
  `,
})
export class ThemeSwitcherComponent {
  /** Service de thème : applique la classe `theme-clair` / `theme-sombre` sur `<html>`. */
  protected readonly theme = inject(ThemeService);
}
