import { Injectable } from '@angular/core';

import { normaliserNom, validerNom, type Resultat } from '../shared/date.util';

/** Nom du cookie fonctionnel du mode A (F2, §11). */
export const NOM_COOKIE = 'mesdispos_nom';

/** Durée de vie : 1 an (31 536 000 s), cf. §7 « Max-Age ≈ 1 an ». */
export const MAX_AGE_COOKIE = 31_536_000;

/**
 * `CookieService` — mode A « Nom seul » (F2).
 *
 * ⚠️ RGPD : c'est le **seul** cookie de l'application, strictement nécessaire à
 * la fourniture du service demandé par l'utilisateur (le nom saisi sert à
 * réidentifier le parcours). Aucun cookie tiers, aucun bandeau de consentement,
 * aucun analytics (§13). Suppression immédiate possible via « Se déconnecter ».
 *
 * Attributs posés :
 *  - `HttpOnly=false` — **par construction** : un cookie écrit depuis
 *    `document.cookie` ne peut pas être `HttpOnly` (le navigateur l'ignore et
 *    l'exigerait de `Set-Cookie` côté serveur). La valeur reste donc lisible
 *    par le script de la page, ce qui est voulu ici : la page doit pouvoir la
 *    relire et l'effacer sans appel réseau.
 *  - `SameSite=Lax` — le cookie n'est renvoyé qu'en navigation de premier
 *    niveau : suffisant, et il ne fuite pas vers un tiers.
 *  - `Secure` — posé automatiquement si `location.protocol === 'https:'`.
 *  - `Max-Age=31536000`, `Path=/` — 1 an, disponible sur toutes les routes.
 *
 * Le service ne touche **jamais** Firestore : le prénom n'est pas miroir en
 * base (§5 « Pas de miroir Firestore du prénom »).
 */
@Injectable({ providedIn: 'root' })
export class CookieService {
  /** `trim` + collapse des espaces (délégation à la logique pure partagée). */
  normaliserNom(saisi: string | null | undefined): string {
    return normaliserNom(saisi);
  }

  /**
   * Valide puis pose le cookie `mesdispos_nom`.
   * @returns `{ ok: true }` ou `{ ok: false, erreur: <message français> }`.
   */
  setNom(nom: string | null | undefined): Resultat<string> {
    const validation = validerNom(nom);
    if (!validation.ok) {
      return validation;
    }
    document.cookie = `${NOM_COOKIE}=${encodeURIComponent(validation.valeur)}; Max-Age=${MAX_AGE_COOKIE}; Path=/; SameSite=Lax${this.suffixeSecure()}`;
    return { ok: true, valeur: validation.valeur };
  }

  /** Valeur courante du cookie, `null` si absent ou vide. */
  lireNom(): string | null {
    if (typeof document === 'undefined') {
      return null;
    }
    for (const morceau of document.cookie.split(';')) {
      const separateur = morceau.indexOf('=');
      if (separateur < 0) {
        continue;
      }
      const cle = morceau.slice(0, separateur).trim();
      if (cle !== NOM_COOKIE) {
        continue;
      }
      const valeur = decodeURIComponent(morceau.slice(separateur + 1).trim());
      return valeur.length > 0 ? valeur : null;
    }
    return null;
  }

  /** Supprime le cookie (Max-Age=0). */
  effacer(): void {
    document.cookie = `${NOM_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${this.suffixeSecure()}`;
  }

  /** `; Secure` uniquement en HTTPS (F2 mode A). */
  private suffixeSecure(): string {
    return typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  }
}
