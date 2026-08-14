/**
 * Captures documentation screenshots from a local Postiz.
 *
 *   node capture.mjs            capture everything
 *   node capture.mjs calendar   capture one shot by name
 *
 * Deterministic by design: fixed viewport, dark theme, demo data seeded by
 * seed.sql, so re-running produces the same images when the UI has not moved.
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.POSTIZ_URL || 'http://localhost:4009';
const OUT = process.env.OUT_DIR || '/Users/egelhaus/Git-Repos/postiz-docs/images/guide';
const EMAIL = 'demo@acme.test';
const PASSWORD = 'DocsDemo!2345';
const VIEWPORT = { width: 1440, height: 900 };

const only = process.argv[2];

// The week grid starts at midnight. Scroll the scrollable pane so working
// hours (where the demo posts sit) are what the screenshot shows.
async function scrollToWorkingHours(page) {
  await page.evaluate(() => {
    const panes = [...document.querySelectorAll('*')].filter((el) => {
      const s = getComputedStyle(el);
      return (
        (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight + 200
      );
    });
    const pane = panes.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (pane) pane.scrollTop = pane.scrollHeight * 0.33;
  });
  await page.waitForTimeout(700);
}

const shots = [
  {
    name: 'shell/overview',
    goto: '/launches',
    wait: 3000,
    action: scrollToWorkingHours,
    note: 'App shell: left rail, channel sidebar, calendar',
  },
  {
    name: 'calendar/week',
    goto: '/launches',
    wait: 3000,
    action: scrollToWorkingHours,
    note: 'Week view with tagged posts',
  },
  {
    name: 'calendar/month',
    goto: '/launches',
    wait: 3000,
    action: async (page) => {
      await page.getByText('Month', { exact: true }).first().click();
      await page.waitForTimeout(2000);
    },
    note: 'Month view',
  },
  {
    name: 'calendar/list',
    goto: '/launches',
    wait: 3000,
    action: async (page) => {
      const toggles = page.locator('button:has(svg)');
      await toggles.last().click();
      await page.waitForTimeout(2000);
    },
    note: 'List view with state filters',
  },
  {
    name: 'channels/sidebar',
    goto: '/launches',
    wait: 3000,
    action: async (page) => {
      await page.waitForTimeout(500);
    },
    clip: { x: 0, y: 0, width: 520, height: 900 },
    note: 'Channel sidebar grouped by customer',
  },
  {
    name: 'channels/add-channel',
    goto: '/launches',
    wait: 2000,
    action: async (page) => {
      await page.getByText('Add Channel', { exact: false }).first().click();
      await page.waitForTimeout(1500);
    },
    note: 'Add Channel dialog, the platform grid',
  },
  {
    name: 'settings/overview',
    goto: '/settings',
    wait: 2500,
    note: 'Settings tabs',
  },
  {
    name: 'analytics/empty',
    goto: '/analytics',
    wait: 2500,
    note: 'Analytics page',
  },
  {
    name: 'media/library',
    goto: '/media',
    wait: 2000,
    note: 'Media library',
  },
  {
    name: 'automations/plugs',
    goto: '/plugs',
    wait: 2000,
    note: 'Plugs page',
  },
  {
    name: 'automations/third-party',
    goto: '/third-party',
    wait: 2000,
    note: 'Third-party integrations',
  },
  {
    name: 'agents/chat',
    goto: '/agents',
    wait: 2500,
    note: 'AI agent',
  },
];

async function ensureLoggedIn(page) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  if (page.url().includes('/launches') || page.url().includes('/analytics')) return;

  // register first, the instance has no email provider so activation is skipped
  await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const emailBox = page.locator('input[name="email"], input[type="email"]').first();
  if (await emailBox.count()) {
    await emailBox.fill(EMAIL);
    await page.locator('input[name="password"], input[type="password"]').first().fill(PASSWORD);
    const company = page.locator('input[name="company"]');
    if (await company.count()) await company.fill('Acme Coffee');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(6000);
  }

  if (!page.url().includes('/launches')) {
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.locator('input[name="email"], input[type="email"]').first().fill(EMAIL);
    await page.locator('input[name="password"], input[type="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(6000);
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
const page = await context.newPage();

await ensureLoggedIn(page);
console.log('logged in, at', page.url());

for (const shot of shots) {
  if (only && !shot.name.includes(only)) continue;
  try {
    await page.goto(`${BASE}${shot.goto}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(shot.wait ?? 2000);
    if (shot.action) await shot.action(page);

    const dir = join(OUT, shot.name.split('/')[0]);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = join(OUT, `${shot.name}.png`);
    await page.screenshot({
      path,
      fullPage: shot.full ?? false,
      ...(shot.clip ? { clip: shot.clip } : {}),
    });
    console.log(`captured ${shot.name}  (${shot.note})`);
  } catch (error) {
    console.error(`FAILED ${shot.name}: ${error.message}`);
  }
}

await browser.close();
