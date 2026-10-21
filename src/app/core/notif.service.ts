import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * Notifications utilisateur — succès, erreur, et « Réessayer » après un
 * échec d'écriture (F4). Aucun service tiers, aucun analytics (§13).
 */
@Injectable({ providedIn: 'root' })
export class NotifService {
  private readonly snackBar = inject(MatSnackBar);

  /** Message de succès (ex. « 12 créneaux importés, 2 lignes ignorées »). */
  succes(message: string, duree = 3000): void {
    this.snackBar.open(message, 'Fermer', { duration: duree, politeness: 'polite' });
  }

  /** Message d'erreur, avec action facultative (bouton de droite). */
  erreur(message: string, action?: { label: string; executer: () => void }, duree = 8000): void {
    this.snackBar
      .open(message, action?.label ?? 'Fermer', { duration: duree, politeness: 'assertive' })
      .onAction()
      .subscribe(() => action?.executer());
  }

  /** Erreur d'écriture F4 : « Enregistrement impossible. Réessayer ». */
  reessayer(message: string, executer: () => void): void {
    this.erreur(message, { label: 'Réessayer', executer });
  }

  /** Info neutre (ex. « Accès réservé à un administrateur »). */
  info(message: string, duree = 4000): void {
    this.snackBar.open(message, 'Fermer', { duration: duree, politeness: 'polite' });
  }
}
