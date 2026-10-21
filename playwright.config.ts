import { defineConfig, devices } from '@playwright/test';

/**
 * MesDispos — configuration Playwright (contrat AGENTS.md §4 / §10).
 *
 * ATTENTION : ces tests sont ÉCRITS MAIS NON EXÉCUTÉS par l'agent (AGENTS.md §3/§13).
 * L'humain doit d'abord installer les navigateurs :
 *   npx playwright install
 * puis lancer : npm run test:e2e
 *
 * Les 3 viewports du cahier : 375 (mobile), 768 (tablette), 1280 (desktop).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  },
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: false },
    },
    {
      name: 'tablette',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
