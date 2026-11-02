import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, timeout, retry, catchError } from 'rxjs';

declare const proxy: string;

/**
 * Enveloppe renvoyée par `/api/v1/profs` : la liste des professeurs est dans
 * `elements` (réponse paginée de l'API Oasis).
 */
export interface ReponseProfs {
  elements: ProfOasis[];
}

/**
 * Matière / domaine enseigné, tel que renvoyé par l'API dans `subjects`.
 *
 * Le schéma documenté annonce `["Art"]`, mais l'API renvoie en pratique des
 * objets `{ code, year, description }` (et parfois une chaîne simple, selon
 * la version). Les deux formes sont donc tolérées.
 */
export type SujetOasis = string | { code?: string; year?: string; description?: string };

/**
 * Enseignant tel que décrit par l'API REST Oasis (`ProfSchema`).
 *
 * Schéma complet renvoyé par `GET /api/v1/profs` :
 * `{ nip, login, type_utilisateur, nom_usuel, prenom_usuel, civilite,
 *    mail_pro, mail_perso, ine, annee, secteur, statut_etab, service,
 *    service_libelle, date_fin_de_contrat, present, photo, subjects }`.
 *
 * Tous les champs sont optionnels côté type : l'API peut omettre une clé
 * selon l'enseignant (ex. `mail_perso` vide, `ine` inconnu).
 */
export interface ProfOasis {
  /** Numéro d'identification de la personne (NIP). */
  nip?: string;
  /** Identifiant LDAP — clé d'unicité d'un enseignant. */
  login: string;
  /** Type d'utilisateur (`P` = professeur). */
  type_utilisateur?: string;
  /** Nom d'usage en majuscules. */
  nom_usuel: string;
  /** Prénom d'usage. */
  prenom_usuel: string;
  /** Civilité (`F`, `M`, …). */
  civilite?: string;
  /** Messagerie professionnelle. */
  mail_pro?: string;
  /** Messagerie personnelle. */
  mail_perso?: string;
  /** Identifiant national étudiant / enumérateur de l'établissement. */
  ine?: string;
  /** Année d'affectation. */
  annee?: string;
  /** Secteur d'enseignement rattaché. */
  secteur?: string;
  /** Statut dans l'établissement (`C`, `T`, `V`, …). */
  statut_etab?: string;
  /** Code du service / direction des études. */
  service?: string;
  /** Libellé du service / direction des études. */
  service_libelle?: string;
  /** Fin de contrat (JJ/MM/AAAA). */
  date_fin_de_contrat?: string;
  /** Présence actuelle (`ACT` = présent, `INA` = absent). */
  present?: string;
  /** Une photo est-elle disponible ? */
  photo?: boolean;
  /** Matières / domaines enseignés (ex. `[{ code: 'DESSIN', … }]`). */
  subjects?: SujetOasis[];
}

@Injectable({ providedIn: 'root' })
export class CoursServices {
  public homolo = false;

  private readonly http = inject(HttpClient);

  getApiUrl(object: string, year = 2026, params = '') {
    let url = '/api/v1/{object}?year={year}&{params}'
      .replace('{year}', year.toString())
      .replace('{object}', object)
      .replace('{params}', params);
    console.log('Appel de ' + proxy + url);
    return proxy + url;
  }

  // Le frontend n'envoie PLUS d'Authorization Basic :
  // c'est le Worker Cloudflare qui injecte le couple (plannerview, ***)
  // côté serveur. Aucun couple user/password ne transite par le navigateur.
  getHeaders(): HttpHeaders {
    return new HttpHeaders({});
  }

  getCourses(offset = 0, limit = 500): Observable<any> {
    //
    let headers = this.getHeaders();
    return this.http
      .get<any>(this.getApiUrl('courses') + 'offset=' + offset + '&limit=' + limit, { headers })
      .pipe(
        timeout(30000),
        retry({ count: 3, delay: 2000 }),
        catchError((err) => {
          throw err;
        }),
      );
  }

  getProfs(): Observable<ReponseProfs> {
    //voir https://test.ensad.oasispro.fr/testapi/v1/doc#/Professeurs/Oasis%5CEnsad%5COverride%5CApi%5CREST%5CData%5CController%5CLdap%5CProfCtrl%3A%3AselectProfs
    const url = this.getApiUrl('profs', 2026);
    const headers = this.getHeaders();
    return this.http.get<ReponseProfs>(url, { headers, withCredentials: false }).pipe(
      timeout(30000),
      retry({ count: 3, delay: 2000 }),
      catchError((err) => {
        console.error('[CSP-DEBUG] getProfs() failed:', {
          message: err.message,
          status: err.status,
          statusText: err.statusText,
          url: err.url,
          error: err.error,
          timestamp: new Date().toISOString(),
        });
        throw err;
      }),
    );
  }

  // Cache for programs with 10-hour TTL using localStorage
  private readonly PROGRAMS_STORAGE_KEY = 'programs_cache';
  private readonly PROGRAMS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  /**
   * Get cache from localStorage
   */
  private getProgramsCache(): Map<string, { data: any; timestamp: number }> {
    try {
      const stored = localStorage.getItem(this.PROGRAMS_STORAGE_KEY);
      if (stored) {
        return new Map(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('[CoursServices] Failed to parse programs cache from localStorage:', e);
    }
    return new Map();
  }

  /**
   * Save cache to localStorage
   */
  private saveProgramsCache(cache: Map<string, { data: any; timestamp: number }>): void {
    try {
      localStorage.setItem(this.PROGRAMS_STORAGE_KEY, JSON.stringify([...cache]));
    } catch (e) {
      console.warn('[CoursServices] Failed to save programs cache to localStorage:', e);
    }
  }

  getPrograms(offset = 0, limit = 100): Observable<any> {
    const cacheKey = `programs_${offset}_${limit}`;
    const now = Date.now();

    // Check if cached data exists and is still valid
    const cache = this.getProgramsCache();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.timestamp < this.PROGRAMS_CACHE_TTL) {
      return new Observable((observer) => {
        observer.next(cached.data);
        observer.complete();
      });
    }

    let headers = this.getHeaders();
    //voir https://test.ensad.oasispro.fr/testapi/v1/doc#/Cours/Oasis%5CEnsad%5COverride%5CApi%5CREST%5CData%5CController%5CCourse%5CProgramCtrl%3A%3Alist
    const url = this.getApiUrl(
      'programs',
      2026,
      'offset=' + offset + '&limit=' + limit + '&include_details=true',
    );

    return new Observable((observer) => {
      this.http
        .get<any[]>(url, { headers })
        .pipe(
          timeout(30000),
          retry({ count: 3, delay: 10000 }),
          catchError((err) => {
            throw err;
          }),
        )
        .subscribe({
          next: (data) => {
            // Store in localStorage cache
            if (data) {
              cache.set(cacheKey, { data, timestamp: now });
              this.saveProgramsCache(cache);
              observer.next(data);
              observer.complete();
            } else {
              observer.error({ message: 'data est null' });
            }
          },
          error: (err) => {
            observer.error(err);
          },
        });
    });
  }

  /**
   * Clear all programs cache from localStorage
   */
  clearProgramsCache(): void {
    localStorage.removeItem(this.PROGRAMS_STORAGE_KEY);
    console.log('[CoursServices] Programs cache cleared from localStorage');
  }

  /**
   * Invalidate programs cache for a specific offset/limit combination
   */
  invalidateProgramsCache(offset = 0, limit = 100): void {
    const cacheKey = `programs_${offset}_${limit}`;
    const cache = this.getProgramsCache();
    cache.delete(cacheKey);
    this.saveProgramsCache(cache);
    console.log('[CoursServices] Programs cache invalidated for key:', cacheKey);
  }

  getSecteurs(): Observable<any> {
    return this.importCsvAsJson('secteurs.csv', 'Sigle');
  }

  getTypeCours(): Observable<any> {
    return this.importCsvAsJson('types_cours.csv', 'Code');
  }

  getCoursSecteur(): Observable<any> {
    return this.importCsvAsJson('cours_secteurs.csv', 'Cours', ';');
  }

  /**
   * Import and parse a CSV file from the static directory
   * @param filename - The filename (e.g., 'secteurs.csv' from public/ directory)
   * @param keyName - The key name to wrap the result array in the returned object
   * @returns Observable of parsed CSV data as {keyName: array}
   */
  importCsvAsJson(
    filename: string,
    keyName: string,
    separator = ',',
  ): Observable<{ [key: string]: any[] }> {
    return new Observable<{ [key: string]: any[] }>((observer) => {
      this.http.get(`/${filename}`, { responseType: 'text' }).subscribe({
        next: (csvContent: string) => {
          try {
            const wrapped: any = {};

            for (let row of this.parseCsvToJson(csvContent, separator)) {
              wrapped[row[keyName]] = row;
            }
            observer.next(wrapped);
            observer.complete();
          } catch (error) {
            observer.error(error);
          }
        },
        error: (error) => {
          console.log('Erreur de chargement de ' + filename);
          observer.error(error);
        },
      });
    });
  }

  /**
   * Parse CSV content to JSON array
   * @param csvContent - The CSV string content
   * @returns Array of objects with headers as keys
   */
  private parseCsvToJson(csvContent: string, separator = ','): any[] {
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length === 0) return [];

    // Parse header row, handling quoted fields
    const headerLine = lines[0];
    const headers = this.parseCSVLine(headerLine, separator);

    const result: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i], separator);
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      result.push(obj);
    }
    return result;
  }

  /**
   * Parse a single CSV line handling quoted fields and comma separators
   * @param line - A CSV line string
   * @returns Array of field values
   */
  private parseCSVLine(line: string, separator = ','): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === separator) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    result.push(current.trim());
    return result;
  }
}
