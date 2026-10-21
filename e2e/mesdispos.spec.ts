import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours e2e MesDispos (AGENTS.md §10).
 *
 * ⚠️ Ces tests sont ÉCRITS MAIS NON EXÉCUTÉS par l'agent (contrat §3/§13).
 * L'humain lance : `npm run test:e2e:install` puis `npm run test:e2e`.
 *
 * L'application est testée **sans Firebase** : les lectures Firestore sont
 * interceptées et servies par `page.route`, afin que le parcours
 * login → sélection → rechargement → créneau retenu soit reproductible.
 */

interface CreneauFaux {
  id: string;
  date: string;
  heureDebut: string;
  heureFin: string;
  libelle?: string;
}

const CRENEAUX: CreneauFaux[] = [
  {
    id: '2026-01-12_0845_0930',
    date: '2026-01-12',
    heureDebut: '08:45',
    heureFin: '09:30',
    libelle: 'Audition A1',
  },
  {
    id: '2026-01-12_1400_1500',
    date: '2026-01-12',
    heureDebut: '14:00',
    heureFin: '15:00',
  },
];

let retenus = new Set<string>();

/** Intercepte les appels réseau de l'application pour la rendre déterministe. */
async function maquiller(page: Page): Promise<void> {
  await page.route('**/googleapis.com/**', (route) => route.abort());
  await page.route('**/identitytoolkit.googleapis.com/**', (route) => route.abort());
  await page.route('**/firestore.googleapis.com/**', (route) => {
    const url = route.request().url();
    const creneaux = url.includes('/creneaux');
    const dispos = url.includes('/dispos');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        creneaux
          ? CRENEAUX.map((creneau) => ({
              name: `creneaux/${creneau.id}`,
              fields: {
                date: { stringValue: creneau.date },
                heureDebut: { stringValue: creneau.heureDebut },
                heureFin: { stringValue: creneau.heureFin },
                libelle: { stringValue: creneau.libelle ?? '' },
              },
            }))
          : [...retenus].map((id) => {
              const creneau = CRENEAUX.find((c) => c.id === id);
              return {
                name: `users/anon_test/dispos/${id}`,
                fields: {
                  creneauId: { stringValue: id },
                  date: { stringValue: creneau?.date ?? '' },
                  heureDebut: { stringValue: creneau?.heureDebut ?? '' },
                  heureFin: { stringValue: creneau?.heureFin ?? '' },
                  updatedAt: { integerValue: '1' },
                },
              };
            }),
      ),
    });
  });
}

test.beforeEach(async ({ page }) => {
  retenus = new Set<string>();
  await maquiller(page);
  await page.goto('/login');
});

test('parcours complet : prénom → sélection → rechargement → créneau retenu', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'MesDispos' })).toBeVisible();

  await page.getByLabel('Prénom').fill('Pauline');
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page).toHaveURL(/\/dispos$/);
  await expect(page.getByRole('heading', { name: /Mes disponibilités/ })).toBeVisible();

  const carte = page.getByRole('button', { name: /Disponible .* 8 h 45/ });
  await expect(carte).toHaveAttribute('aria-pressed', 'false');
  await carte.click();

  // Sélection optimiste : la ligne bascule de section sans rechargement.
  await expect(page.getByRole('heading', { name: /Mes disponibilités \(1\)/ })).toBeVisible();

  // Le créneau retenu survit à un rechargement (persistance immédiate).
  retenus.add('2026-01-12_0845_0930');
  await page.reload();
  await expect(page.getByRole('heading', { name: /Mes disponibilités \(1\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Retenu .* 8 h 45/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('la session par cookie permet de recharger sans repasser par /login', async ({ page }) => {
  await page.getByLabel('Prénom').fill('Pauline');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page).toHaveURL(/\/dispos$/);

  await page.goto('/');
  await expect(page).toHaveURL(/\/dispos$/);
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
});

test('aucun débordement horizontal à 375 px', async ({ page }, testInfo) => {
  await page.getByLabel('Prénom').fill('Pauline');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page).toHaveURL(/\/dispos$/);

  const largeur = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(largeur).toBe(true);

  await testInfo.attach('capture', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('le bouton « Se déconnecter » efface le cookie et revient à /login', async ({
  page,
  context,
}) => {
  await page.getByLabel('Prénom').fill('Pauline');
  await page.getByRole('button', { name: 'Continuer' }).click();

  await page.getByRole('button', { name: 'Se déconnecter' }).click();

  await expect(page).toHaveURL(/\/login$/);
  const cookies = await context.cookies();
  expect(cookies.find((cookie) => cookie.name === 'mesdispos_nom')).toBeUndefined();
});
