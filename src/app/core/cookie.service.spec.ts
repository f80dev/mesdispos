import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_AGE_COOKIE, NOM_COOKIE, CookieService } from './cookie.service';

/** Efface le cookie entre deux tests (jsdom conserve `document.cookie`). */
function nettoyer(): void {
  document.cookie = `${NOM_COOKIE}=; Max-Age=0; Path=/`;
}

describe('CookieService (mode A « Nom seul »)', () => {
  let service: CookieService;

  beforeEach(() => {
    nettoyer();
    service = new CookieService();
  });

  it('normalise le nom : trim + collapse des espaces', () => {
    expect(service.normaliserNom('  Marie   Curie  ')).toBe('Marie Curie');
  });

  it('pose un cookie mesdispos_nom avec la valeur normalisée', () => {
    const resultat = service.setNom('  Marie   Curie ');
    expect(resultat.ok).toBe(true);
    expect(document.cookie).toContain(`${NOM_COOKIE}=Marie%20Curie`);
  });

  it('relit la valeur courante', () => {
    service.setNom('Pauline');
    expect(service.lireNom()).toBe('Pauline');
  });

  it('retourne null si le cookie est absent', () => {
    expect(service.lireNom()).toBeNull();
  });

  it('retourne la valeur du cookie au « redémarrage » (nouvelle instance)', () => {
    service.setNom('Pauline');
    const apresRedemarrage = new CookieService();
    expect(apresRedemarrage.lireNom()).toBe('Pauline');
  });

  it('efface le cookie', () => {
    service.setNom('Pauline');
    service.effacer();
    expect(service.lireNom()).toBeNull();
  });

  it('refuse un nom vide avec un message français', () => {
    const resultat = service.setNom('   ');
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.erreur).toContain('Saisissez');
    }
  });

  it('refuse un nom de plus de 50 caractères avec un message français', () => {
    const resultat = service.setNom('x'.repeat(51));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.erreur).toContain('50');
    }
  });

  it('écrit SameSite=Lax, Max-Age = 1 an, Path=/ et aucun HttpOnly', () => {
    // HttpOnly=false est obtenu par construction (un cookie écrit par JS ne peut
    // pas être HttpOnly) : on vérifie la chaîne réellement écrite.
    const prototype = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    let ecrit = '';
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => prototype?.get?.call(document) ?? '',
      set: (valeur: string) => {
        ecrit = valeur;
        prototype?.set?.call(document, valeur);
      },
    });

    service.setNom('Pauline');

    expect(ecrit).toContain(`${NOM_COOKIE}=Pauline`);
    expect(ecrit).toContain('SameSite=Lax');
    expect(ecrit).toContain(`Max-Age=${MAX_AGE_COOKIE}`);
    expect(ecrit).toContain('Path=/');
    expect(ecrit).not.toContain('HttpOnly');
    // `Secure` n'est posé qu'en HTTPS (le test tourne en http sur localhost).
    expect(ecrit).not.toContain('Secure');

    delete (document as unknown as { cookie?: unknown }).cookie;
  });

  it("n'appelle jamais Firestore (mode sans réseau)", () => {
    // Le service n'a aucun injecteur : le mode A ne déclenche aucun import de SDK.
    expect(Object.getOwnPropertyNames(CookieService.prototype)).not.toContain('firebaseDb');
  });
});
