#!/usr/bin/env node
/**
 * Structural checks for the docs.
 *
 *   1. every page listed in docs.json exists on disk
 *   2. every .mdx on disk is listed in docs.json (no orphans, still indexed
 *      by search but invisible in the sidebar)
 *   3. no page is listed twice (breaks breadcrumbs and the prev/next pager)
 *   4. no em-dashes anywhere
 *   5. Guide and Cloud pages carry no self-hosting instructions
 *
 * Usage: node scripts/check-docs.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const skipDirs = new Set(['.git', 'node_modules', 'snippets', '.idea', '.vscode', 'scripts']);

// Pages that are allowed to mention self-hosting mechanics despite living in a
// shared tab, because routing readers to the self-hosting docs is their job.
const selfHostLanguageAllowlist = new Set(['introduction', 'quickstart']);

const failures = [];

function walkPages(node, out) {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => walkPages(n, out));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'pages' || typeof value === 'object') walkPages(value, out);
    }
  }
  return out;
}

function listMdx(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listMdx(full, out);
    else if (entry.endsWith('.mdx')) out.push(relative(root, full).replace(/\.mdx$/, ''));
  }
  return out;
}

const docs = JSON.parse(readFileSync(join(root, 'docs.json'), 'utf8'));
const navPages = walkPages(docs.navigation.tabs, []);
const diskPages = listMdx(root);

// 1 + 2 + 3
const missing = navPages.filter((p) => !diskPages.includes(p));
const orphans = diskPages.filter((p) => !navPages.includes(p));
const duplicates = navPages.filter((p, i) => navPages.indexOf(p) !== i);

if (missing.length) failures.push(`listed in docs.json but no file:\n  ${missing.join('\n  ')}`);
if (orphans.length) failures.push(`file exists but not in docs.json:\n  ${orphans.join('\n  ')}`);
if (duplicates.length) failures.push(`listed more than once in docs.json:\n  ${[...new Set(duplicates)].join('\n  ')}`);

// which tab does a page belong to
const tabOf = new Map();
for (const tab of docs.navigation.tabs) {
  for (const page of walkPages(tab.groups ?? [], [])) tabOf.set(page, tab.tab);
}

// 4 + 5
const selfHostPatterns = [/`\.env`/, /docker compose/i, /\bpnpm\b/, /NEXT_PUBLIC_/, /IS_GENERAL/];
const allFiles = [...diskPages, ...listMdx(join(root, 'snippets')).map((p) => p)];

for (const page of new Set(allFiles)) {
  let body;
  try {
    body = readFileSync(join(root, `${page}.mdx`), 'utf8');
  } catch {
    continue;
  }

  if (body.includes('—')) {
    const line = body.split('\n').findIndex((l) => l.includes('—')) + 1;
    failures.push(`${page}.mdx:${line} contains an em-dash`);
  }

  const tab = tabOf.get(page);
  if ((tab === 'Guide' || tab === 'Cloud') && !selfHostLanguageAllowlist.has(page)) {
    for (const pattern of selfHostPatterns) {
      if (pattern.test(body)) {
        failures.push(`${page}.mdx is in the ${tab} tab but matches ${pattern}`);
      }
    }
  }
}

if (failures.length) {
  console.error('docs check failed:\n');
  failures.forEach((f) => console.error(`  ${f}\n`));
  process.exit(1);
}

console.log(`docs check passed: ${navPages.length} pages, all in navigation, no em-dashes.`);
