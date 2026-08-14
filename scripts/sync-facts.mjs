#!/usr/bin/env node
/**
 * Regenerates the tables in the docs that are derived from the Postiz source,
 * so they cannot silently drift.
 *
 * Reads from a checkout of gitroomhq/postiz-app (default ../postiz-app,
 * override with POSTIZ_APP=/path/to/postiz-app) and rewrites the content
 * between GENERATED markers:
 *
 *     {"{"}/* GENERATED:pricing *{"/"}{"}"}
 *     ...table...
 *     {"{"}/* /GENERATED:pricing *{"/"}{"}"}
 *
 * Regions:
 *   pricing    -> cloud/plans.mdx
 *   limits     -> cloud/limits.mdx
 *   platforms  -> guide/platforms/overview.mdx
 *   analytics  -> guide/analytics.mdx
 *
 * Usage: node scripts/sync-facts.mjs [--check]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const docsRoot = new URL('..', import.meta.url).pathname;
const appRoot = process.env.POSTIZ_APP || join(docsRoot, '..', 'postiz-app');
const checkOnly = process.argv.includes('--check');

if (!existsSync(appRoot)) {
  console.error(`postiz-app checkout not found at ${appRoot}`);
  console.error('Set POSTIZ_APP=/path/to/postiz-app');
  process.exit(2);
}

const app = (p) => readFileSync(join(appRoot, p), 'utf8');

/* ------------------------------------------------------------------ pricing */

function readPricing() {
  const src = app('libraries/nestjs-libraries/src/database/prisma/subscriptions/pricing.ts');
  const start = src.indexOf('export const pricing');
  const literal = src.slice(src.indexOf('{', start));
  // The literal is plain data (no expressions), so evaluating it is safe here
  // and far more robust than regex-scraping 18 fields per tier.
  // eslint-disable-next-line no-eval
  return eval(`(${literal.slice(0, literal.lastIndexOf('}') + 1)})`);
}

const money = (n) => (n === 0 ? 'Free' : `$${n}`);
const yes = (b) => (b ? 'Yes' : 'No');
const count = (n) => (n >= 1000000 ? 'Unlimited' : String(n));

function pricingTable(pricing) {
  const tiers = Object.values(pricing).filter((t) => t.current !== 'FREE');
  const head = `| | ${tiers.map((t) => titleCase(t.current)).join(' | ')} |`;
  const rule = `|---|${tiers.map(() => '---').join('|')}|`;
  const rows = [
    ['Per month', tiers.map((t) => money(t.month_price))],
    ['Per year', tiers.map((t) => money(t.year_price))],
    ['Channels', tiers.map((t) => String(t.channel))],
    ['Posts per month', tiers.map((t) => count(t.posts_per_month))],
    ['AI image credits', tiers.map((t) => String(t.image_generation_count))],
    ['AI video credits', tiers.map((t) => String(t.generate_videos))],
    ['Webhooks', tiers.map((t) => count(t.webhooks))],
    ['Team members', tiers.map((t) => yes(t.team_members))],
    ['RSS auto-posting', tiers.map((t) => yes(t.autoPost))],
    ['Public API, CLI and MCP', tiers.map((t) => yes(t.public_api))],
    ['AI features', tiers.map((t) => yes(t.ai))],
    ['Image generator', tiers.map((t) => yes(t.image_generator))],
    ['Import from channels', tiers.map((t) => yes(t.import_from_channels))],
  ].map(([label, cells]) => `| **${label}** | ${cells.join(' | ')} |`);
  return [head, rule, ...rows].join('\n');
}

function limitsTable(pricing) {
  const tiers = Object.values(pricing).filter((t) => t.current !== 'FREE');
  const rows = [
    ['Channels', 'Connecting or enabling one past the cap', tiers.map((t) => t.channel)],
    ['AI images per month', 'Generating an image with no credits left', tiers.map((t) => t.image_generation_count)],
    ['AI videos per month', 'Generating a video with no credits left', tiers.map((t) => t.generate_videos)],
    ['Webhooks', 'Saving one past the cap', tiers.map((t) => t.webhooks)],
  ];
  const head = `| Limit | Enforced when | ${tiers.map((t) => titleCase(t.current)).join(' | ')} |`;
  const rule = `|---|---|${tiers.map(() => '---').join('|')}|`;
  return [
    head,
    rule,
    ...rows.map(([l, w, cells]) => `| ${l} | ${w} | ${cells.map(count).join(' | ')} |`),
  ].join('\n');
}

const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

/* ---------------------------------------------------------------- platforms */

function readProviders() {
  const managerPath = 'libraries/nestjs-libraries/src/integrations/integration.manager.ts';
  const manager = app(managerPath);

  // class name -> source file, from the import block
  const importMap = new Map();
  for (const m of manager.matchAll(/import\s*\{\s*(\w+)\s*\}\s*from\s*'@gitroom\/nestjs-libraries\/(.+?)'/g)) {
    importMap.set(m[1], `libraries/nestjs-libraries/src/${m[2]}.ts`);
  }

  // ordered, commented-out entries excluded
  const listBlock = manager.slice(
    manager.indexOf('export const socialIntegrationList'),
    manager.indexOf('@Injectable()')
  );
  const classNames = [...listBlock.matchAll(/^\s*new (\w+)\(\),/gm)].map((m) => m[1]);

  // identifier -> frontend component file, via the Providers map, so we can
  // read maximumCharacters and postComment from the right component.
  const showAllPath = 'apps/frontend/src/components/new-launch/providers/show.all.providers.tsx';
  const showAll = app(showAllPath);
  const componentPath = new Map();
  for (const m of showAll.matchAll(/import\s+(\w+)\s+from\s+'@gitroom\/frontend\/(.+?)'/g)) {
    componentPath.set(m[1], `apps/frontend/src/${m[2]}.tsx`);
  }
  const identifierToFile = new Map();
  for (const m of showAll.matchAll(/identifier:\s*'([\w-]+)',\s*\n\s*component:\s*(\w+),/g)) {
    identifierToFile.set(m[1], componentPath.get(m[2]));
  }

  return classNames.map((cls) => {
    const src = app(importMap.get(cls));
    const field = (name) => {
      const m = src.match(new RegExp(`^\\s+(?:override\\s+)?${name}\\s*=\\s*(.+?);`, 'm'));
      return m ? m[1].replace(/ as const$/, '').replace(/^'|'$/g, '') : undefined;
    };
    const identifier = field('identifier');

    const componentFile = identifierToFile.get(identifier);
    let maxChars = 'varies';
    if (componentFile && existsSync(join(appRoot, componentFile))) {
      const m = app(componentFile).match(/maximumCharacters:\s*([\d_]+)/);
      if (m) maxChars = Number(m[1].replace(/_/g, '')).toLocaleString('en-US');
    }

    let connect = 'OAuth';
    if (src.includes('customFields(')) connect = 'Credentials in Postiz';
    if (field('isWeb3') === 'true') connect = 'In-app dialog';
    if (field('isChromeExtension') === 'true') connect = 'Browser extension';
    if (field('externalUrl')) connect = 'Instance URL';

    // "needs a developer app" means the provider reads credentials from the
    // environment, which is what a self-hoster has to supply.
    const infraVars = ['FRONTEND_URL', 'NOT_SECURED', 'DISABLE_SSRF_PROTECTION', 'NODE_ENV', 'STORAGE_PROVIDER'];
    const envVars = [...new Set([...src.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]))].filter(
      (v) => !infraVars.includes(v) && !v.startsWith('NEXT_PUBLIC_')
    );

    return {
      identifier,
      name: (field('name') || '').replace(/\\n/g, ' ').trim(),
      editor: field('editor') || 'normal',
      connect,
      needsApp: envVars.length > 0,
      envVars,
      maxChars,
    };
  });
}

function platformsTable(providers) {
  const head = '| Platform | API `__type` | How you connect it | Self-hosted: needs a developer app | Characters |';
  const rule = '|---|---|---|---|---|';
  const rows = providers.map(
    (p) =>
      `| ${p.name} | \`${p.identifier}\` | ${p.connect} | ${p.needsApp ? 'Yes' : 'No'} | ${p.maxChars} |`
  );
  return [head, rule, ...rows].join('\n');
}

/* ---------------------------------------------------------------- analytics */

function analyticsTable(providers) {
  const src = app('apps/frontend/src/components/platform-analytics/platform.analytics.tsx');
  const allowed = [
    ...src
      .slice(src.indexOf('const allowedIntegrations'), src.indexOf(']', src.indexOf('const allowedIntegrations')))
      .matchAll(/'([\w-]+)'/g),
  ].map((m) => m[1]);

  // The 30 and 90 day selectors are each gated on their own allowlist, which
  // sits immediately before the `key: 30` / `key: 90` push.
  const listBefore = (key) => {
    const at = src.indexOf(`key: ${key},`);
    if (at === -1) return [];
    const block = src.slice(0, at);
    const open = block.lastIndexOf('[');
    return [...block.slice(open).matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
  };
  const thirty = listBefore(30);
  const ninety = listBefore(90);

  const nameOf = new Map(providers.map((p) => [p.identifier, p.name]));
  const ranges = (id) => {
    const out = ['7'];
    if (thirty.includes(id)) out.push('30');
    if (ninety.includes(id)) out.push('90');
    return `${out.join(', ')} days`;
  };
  const head = '| Platform | Ranges available |';
  const rule = '|---|---|';
  const rows = allowed.map((id) => `| ${nameOf.get(id) || id} | ${ranges(id)} |`);
  return [head, rule, ...rows].join('\n');
}

/* ------------------------------------------------------------------- writer */

function applyRegion(file, region, content) {
  const path = join(docsRoot, file);
  if (!existsSync(path)) return { file, region, status: 'page not written yet' };

  const open = `{/* GENERATED:${region} */}`;
  const close = `{/* /GENERATED:${region} */}`;
  const body = readFileSync(path, 'utf8');
  const from = body.indexOf(open);
  const to = body.indexOf(close);
  if (from === -1 || to === -1) return { file, region, status: 'no markers' };

  const next =
    body.slice(0, from + open.length) +
    '\n' +
    content +
    '\n' +
    body.slice(to);

  if (next === body) return { file, region, status: 'unchanged' };
  if (checkOnly) return { file, region, status: 'STALE' };
  writeFileSync(path, next);
  return { file, region, status: 'updated' };
}

const pricing = readPricing();
const providers = readProviders();

if (process.argv.includes('--print')) {
  console.log(pricingTable(pricing), '\n');
  console.log(limitsTable(pricing), '\n');
  console.log(platformsTable(providers), '\n');
  console.log(analyticsTable(providers));
  process.exit(0);
}

const results = [
  applyRegion('cloud/plans.mdx', 'pricing', pricingTable(pricing)),
  applyRegion('cloud/limits.mdx', 'limits', limitsTable(pricing)),
  applyRegion('guide/platforms/overview.mdx', 'platforms', platformsTable(providers)),
  applyRegion('guide/analytics.mdx', 'analytics', analyticsTable(providers)),
];

for (const r of results) console.log(`  ${r.status.padEnd(20)} ${r.file} [${r.region}]`);
console.log(`\n${providers.length} providers, ${Object.keys(pricing).length} tiers read from ${appRoot}`);

if (checkOnly && results.some((r) => r.status === 'STALE')) {
  console.error('\nGenerated tables are out of date. Run: node scripts/sync-facts.mjs');
  process.exit(1);
}
