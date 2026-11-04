import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, isDevMode, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Une entrée du planning renvoyée par l'API locale `AutoPlanning/api.py`
 * (route `GET /calendar/json`). La forme exacte dépend du planning : on ne
 * conserve qu'un objet JSON générique.
 */
export type EntreePlanning = Record<string, unknown>;

/**
 * Adresse de l'API locale de développement (Flask, `AutoPlanning/api.py`).
 * Le port 8000 correspond à `app.run(debug=True, port=8000)` ; les
 * docstrings du fichier mentionnent 5000 : adaptez cette constante si le
 * serveur Flask écoute ailleurs.
 */
export const API_PLANNING_URL = 'http://localhost:5000';

/** Route déclenchant la méthode `get_filtered_json`. */
export const ROUTE_CALENDAR_JSON = '/calendar/json';

/**
 * `PlanningApiService` — accès **exclusivement en développement** à l'API
 * de planning locale (serveur Flask `AutoPlanning`).
 *
 * En production le service est neutralisé (`actif()` vaut `false`) : aucune
 * requête HTTP n'est émise et le bouton correspondant est masqué dans
 * l'écran d'administration.
 */
@Injectable({ providedIn: 'root' })
export class PlanningApiService {
  private readonly http = inject(HttpClient);

  /** `true` uniquement dans un build de développement. */
  readonly actif = isDevMode();

  readonly chargement = signal<boolean>(false);
  readonly erreur = signal<string | null>(null);
  readonly entrees = signal<EntreePlanning[]>([]);

  /**
   * Appelle `GET /calendar/json` (méthode `get_filtered_json` côté Python) et
   * mémorise les entrées reçues.
   *
   * @param tags filtres optionnels, transmis en `?tags=a,b`.
   */
  async charger(tags: string[] = []): Promise<void> {
    if (!this.actif) {
      this.erreur.set("L'API de planning local n'est accessible qu'en développement.");
      return;
    }
    this.chargement.set(true);
    this.erreur.set(null);
    try {
      let params = new HttpParams();
      const filtres = tags.map((t) => t.trim()).filter((t) => t.length > 0);
      if (filtres.length > 0) {
        params = params.set('tags', filtres.join(','));
      }
      const reponse = await firstValueFrom(
        this.http.get<EntreePlanning[]>(`${API_PLANNING_URL}${ROUTE_CALENDAR_JSON}`, { params }),
      );
      this.entrees.set(Array.isArray(reponse) ? reponse : []);
    } catch (erreur) {
      this.entrees.set([]);
      this.erreur.set(
        erreur instanceof Error
          ? `Appel à ${ROUTE_CALENDAR_JSON} impossible : ${erreur.message}`
          : `Appel à ${ROUTE_CALENDAR_JSON} impossible.`,
      );
    } finally {
      this.chargement.set(false);
    }
  }

  /** Vide l'état affiché (résultat et message d'erreur). */
  reinitialiser(): void {
    this.entrees.set([]);
    this.erreur.set(null);
  }
}
