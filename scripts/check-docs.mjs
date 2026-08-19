#!/usr/bin/env node
/**
 * Structural checks for the docs. Prose and typography live in check-prose.mjs.
 *
 *   navigation  every page in docs.json exists, every .mdx is in docs.json,
 *               no page listed twice, path prefix matches its tab
 *   redirects   sources do not shadow real pages, destinations exist, no
 *               duplicates, and a deleted page leaves a redirect behind
 *   links       internal links and their anchors resolve, no .mdx suffixes
 *   audience    Guide and Cloud pages carry no self-hosting instructions
 *   anchors     headings in the configuration reference never disappear,
 *               because they are linked from outside these docs
 *
 * Usage: node scripts/check-docs.mjs [--changed [--base <ref>]]
 *
 * --changed only fails on lines the current branch touched. Findings elsewhere
 * are printed as context.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Report, loadScope, parseArgs } from './lib/checks.mjs';

const root = new URL('..', import.meta.url).pathname;
const skipDirs = new Set(['.git', 'node_modules', 'snippets', '.idea', '.vscode', 'scripts']);

// Every tab owns a set of path prefixes. This is what lets the cloud support
// agent be scoped with a single URL glob, so a page under the wrong prefix is
// a real bug and not a cosmetic one.
const tabPrefixes = {
  Guide: ['general/'],
  Cloud: ['cloud/'],
  'Self-Hosting': ['self-host/'],
  'Public API': ['public-api/'],
  Automation: ['cli/', 'mcp/'],
  Contributing: ['contributing/'],
};

// Deliberate cross-listings: the URL prefix still decides the audience, this
// only moves where the page appears in the sidebar.
//   self-host/cli-auth-server is self-hosting work that only CLI users do, so
//   it sits in the Automation tab while keeping its /self-host/ URL.
const tabPrefixExceptions = new Set(['self-host/cli-auth-server']);

// Pages that are allowed to mention self-hosting mechanics despite living in a
// shared tab, because routing readers to the self-hosting docs is their job.
const selfHostLanguageAllowlist = new Set(['general/introduction', 'general/quickstart']);
const selfHostPatterns = [/`\.env`/, /docker compose/i, /\bpnpm\b/, /NEXT_PUBLIC_/, /IS_GENERAL/];

// Anchors linked from Discord, GitHub issues and the app itself.
const frozenAnchors = 'self-host/configuration/reference';

const options = parseArgs(process.argv, root);
const scope = loadScope(root, options);
const report = new Report({ root, scope, name: 'docs check' });

/* ----------------------------------------------------------------- helpers */

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

const configText = readFileSync(join(root, 'docs.json'), 'utf8');
const configLines = configText.split('\n');

// Anchor a docs.json finding to the line the value appears on, so scoping can
// tell a navigation change from an untouched entry.
function configLine(value) {
  const needle = `"${value}"`;
  const i = configLines.findIndex((l) => l.includes(needle));
  return i === -1 ? 0 : i + 1;
}

// Mintlify slugs headings the GitHub way: lowercase, punctuation dropped,
// spaces to hyphens.
function slug(text) {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*+/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

function headings(body) {
  const found = new Set();
  let fence = false;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const m = line.match(/^#{1,6}\s+(.*)$/);
    if (m) found.add(slug(m[1]));
    for (const id of line.matchAll(/\bid="([^"]+)"/g)) found.add(id[1]);
  }
  return found;
}

// "/old/:slug*" style patterns, as used by Mintlify redirects.
function redirectMatcher(source) {
  const pattern = source
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:\w+\*/g, '.*')
    .replace(/:\w+/g, '[^/]+');
  return new RegExp(`^${pattern}$`);
}

const read = (page) => {
  try {
    return readFileSync(join(root, `${page}.mdx`), 'utf8');
  } catch {
    return null;
  }
};

/* -------------------------------------------------------------- navigation */

const diskPages = listMdx(root);
const snippetPages = listMdx(join(root, 'snippets'));
report.checked = diskPages.length + snippetPages.length;

let docs;
try {
  docs = JSON.parse(configText);
} catch (error) {
  report.add('docs.json', 0, 'navigation', `docs.json is not valid JSON: ${error.message}`);
  report.finish();
}

const navPages = walkPages(docs.navigation.tabs, []);

for (const page of navPages.filter((p) => !diskPages.includes(p))) {
  report.add('docs.json', configLine(page), 'navigation', `listed in docs.json but no file: ${page}.mdx`,
    1, [{ file: `${page}.mdx` }]);
}
for (const page of diskPages.filter((p) => !navPages.includes(p))) {
  report.add(`${page}.mdx`, 0, 'navigation', 'file exists but is not in docs.json, so it is invisible in the sidebar');
}
for (const page of new Set(navPages.filter((p, i) => navPages.indexOf(p) !== i))) {
  report.add('docs.json', configLine(page), 'navigation', `listed more than once, which breaks breadcrumbs and the pager: ${page}`);
}

const tabOf = new Map();
for (const tab of docs.navigation.tabs) {
  for (const page of walkPages(tab.groups ?? [], [])) tabOf.set(page, tab.tab);
}

for (const [page, tab] of tabOf) {
  if (tabPrefixExceptions.has(page)) continue;
  const prefixes = tabPrefixes[tab];
  if (!prefixes) {
    report.add('docs.json', configLine(tab), 'navigation', `tab "${tab}" has no path prefix rule in check-docs.mjs`);
    continue;
  }
  if (!prefixes.some((prefix) => page.startsWith(prefix))) {
    report.add('docs.json', configLine(page), 'navigation',
      `${page} is in the ${tab} tab but should live under ${prefixes.join(' or ')}`);
  }
}

/* --------------------------------------------------------------- redirects */

const redirects = docs.redirects ?? [];
const seenSources = new Set();

for (const entry of redirects) {
  const line = configLine(entry.source ?? '');
  if (!entry.source || !entry.destination) {
    report.add('docs.json', line, 'redirects', `redirect needs both source and destination: ${JSON.stringify(entry)}`);
    continue;
  }
  if (seenSources.has(entry.source)) {
    report.add('docs.json', line, 'redirects', `duplicate redirect source: ${entry.source}`);
  }
  seenSources.add(entry.source);

  const source = entry.source.replace(/^\//, '');
  if (!source.includes(':') && diskPages.includes(source)) {
    report.add('docs.json', line, 'redirects', `${entry.source} redirects away from a page that exists`);
  }
  const destination = entry.destination.replace(/^\//, '').split('#')[0];
  if (entry.destination.startsWith('http') || destination.includes(':')) continue;
  if (!diskPages.includes(destination)) {
    report.add('docs.json', line, 'redirects', `${entry.source} redirects to ${entry.destination}, which does not exist`);
  }
}

// A page that disappears takes its inbound links with it, so the branch that
// removes one has to leave a redirect behind.
if (scope) {
  const matchers = redirects.map((r) => redirectMatcher(r.source ?? ''));
  for (const path of scope.deleted) {
    if (!path.endsWith('.mdx') || path.startsWith('snippets/')) continue;
    const url = `/${path.replace(/\.mdx$/, '')}`;
    if (matchers.some((m) => m.test(url))) continue;
    report.add('docs.json', configLine('redirects'), 'redirects',
      `${path} was deleted without a redirect for ${url}, and its URL is linked from outside these docs`,
      1, [{ file: path }]);
  }
}

/* ------------------------------------------------------------------- links */

const allPages = [...diskPages, ...snippetPages];
const anchorsOf = new Map();
for (const page of allPages) {
  const body = read(page);
  if (body !== null) anchorsOf.set(page, headings(body));
}

for (const page of allPages) {
  const body = read(page);
  if (body === null) continue;
  const lines = body.split('\n');

  lines.forEach((line, i) => {
    for (const match of line.matchAll(/href="([^"]+)"|\]\(([^)\s]+)\)/g)) {
      const raw = match[1] ?? match[2];
      if (/^(https?:|mailto:|tel:|#)/.test(raw)) {
        // Same-page anchor.
        if (raw.startsWith('#') && !anchorsOf.get(page)?.has(raw.slice(1))) {
          report.add(`${page}.mdx`, i + 1, 'links', `${raw} does not match a heading on this page`);
        }
        continue;
      }
      if (raw.endsWith('.mdx')) {
        report.add(`${page}.mdx`, i + 1, 'links', `internal links drop the .mdx extension: ${raw}`);
        continue;
      }
      if (!raw.startsWith('/')) {
        if (/^[\w.-]+\.(png|jpg|jpeg|svg|gif|webp|mp4)$/i.test(raw)) continue;
        report.add(`${page}.mdx`, i + 1, 'links', `internal links start at the root: ${raw}`);
        continue;
      }

      const [target, anchor] = raw.replace(/\/$/, '').slice(1).split('#');
      if (!target) continue;
      if (existsSync(join(root, target))) continue; // images and other assets
      if (!diskPages.includes(target)) {
        report.add(`${page}.mdx`, i + 1, 'links', `links to /${target}, which does not exist`,
          1, [{ file: `${target}.mdx` }]);
        continue;
      }
      if (anchor && !anchorsOf.get(target)?.has(anchor)) {
        report.add(`${page}.mdx`, i + 1, 'links', `links to /${target}#${anchor}, but that page has no such heading`,
          1, [{ file: `${target}.mdx` }]);
      }
    }
  });
}

/* ---------------------------------------------------------------- audience */

for (const page of allPages) {
  const body = read(page);
  if (body === null) continue;
  const tab = tabOf.get(page);
  if (tab !== 'Guide' && tab !== 'Cloud') continue;
  if (selfHostLanguageAllowlist.has(page)) continue;

  body.split('\n').forEach((line, i) => {
    for (const pattern of selfHostPatterns) {
      if (pattern.test(line)) {
        report.add(`${page}.mdx`, i + 1, 'audience', `${tab} pages carry no self-hosting instructions, but this matches ${pattern}`);
      }
    }
  });
}

/* ----------------------------------------------------------------- anchors */

if (scope && scope.touched.has(`${frozenAnchors}.mdx`)) {
  let before;
  try {
    before = execFileSync('git', ['show', `${scope.from}:${frozenAnchors}.mdx`], { cwd: root, encoding: 'utf8' });
  } catch {
    before = null;
  }
  if (before) {
    const now = anchorsOf.get(frozenAnchors) ?? new Set();
    for (const anchor of headings(before)) {
      if (now.has(anchor)) continue;
      report.add(`${frozenAnchors}.mdx`, 0, 'anchors',
        `#${anchor} is gone, and those anchors are linked from outside these docs. Keep the heading, or add the old wording back`);
    }
  }
}

report.finish();
