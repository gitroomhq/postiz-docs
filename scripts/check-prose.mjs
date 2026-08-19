#!/usr/bin/env node
/**
 * Prose and mechanics checks for the docs.
 *
 * Everything in here is deterministic and automatable: no judgement calls, no
 * network, no dependencies. Structural checks (navigation, orphans) live in
 * check-docs.mjs.
 *
 *   typography    em-dashes, smart quotes, invisible characters
 *   ai-marker     phrases that read as generated filler
 *   typo          common misspellings and doubled words
 *   naming        product names spelled with the wrong casing
 *   spacing       double spaces, trailing whitespace, stray blank lines
 *   frontmatter   title, description and icon rules
 *   markdown      fences, inline code, headings, links, images, components
 *
 * Suppress a single line with a comment on the line above it:
 *
 *   {/* docs-lint-ignore ai-marker *\/}
 *
 * or a whole file with `docs-lint-ignore-file: rule-id, rule-id` anywhere in it.
 *
 * Usage: node scripts/check-prose.mjs [file ...] [--changed [--base <ref>]]
 *
 * --changed only fails on lines the current branch touched. Findings elsewhere
 * are printed as context.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { Report, loadScope, parseArgs } from './lib/checks.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const skipDirs = new Set(['.git', 'node_modules', '.idea', '.vscode', 'scripts', 'images', 'logo']);

/* ------------------------------------------------------------------ rules */

// Phrases that mark generated filler. Matched against prose only, never code.
const AI_PHRASES = [
  /\bdelv(?:e|es|ed|ing)\b/i,
  /\btapestry\b/i,
  /\b(?:a|is a) testament to\b/i,
  /\bin the realm of\b/i,
  /\bthe world of\b/i,
  /\bnavigating the\b/i,
  /\bever-(?:evolving|changing|growing)\b/i,
  /\bfast-paced\b/i,
  /\bgame[- ]chang(?:er|ing)\b/i,
  /\bcutting[- ]edge\b/i,
  /\bstate[- ]of[- ]the[- ]art\b/i,
  /\b(?:unlock|unleash|harness) the (?:power|potential)\b/i,
  /\belevate your\b/i,
  /\b(?:let's |we'll )?(?:deep )?dive into\b/i,
  /\bseamless(?:ly)?\b/i,
  /\beffortless(?:ly)?\b/i,
  /\bhassle[- ]free\b/i,
  /\bsupercharge\b/i,
  /\brevolutioni[sz]e\b/i,
  /\btransformative\b/i,
  /\bunparalleled\b/i,
  /\bunmatched\b/i,
  /\bplethora\b/i,
  /\bmyriad\b/i,
  /\bempower(?:s|ing|ed)?\b/i,
  /\bboasts\b/i,
  /\bmeticulous(?:ly)?\b/i,
  /\bcarefully crafted\b/i,
  /\bcomprehensive guide\b/i,
  /\bultimate guide\b/i,
  /\blook no further\b/i,
  /\bit(?:'s| is) (?:worth|important to) not(?:e|ing)\b/i,
  /\bneedless to say\b/i,
  /\bit goes without saying\b/i,
  /\bfirst and foremost\b/i,
  /\brest assured\b/i,
  /\bat the end of the day\b/i,
  /\bwhen it comes to\b/i,
  /\bin (?:conclusion|summary)\b/i,
  /^(?:furthermore|moreover)\b/i,
  /\bwhether you(?:'re| are) an? [^,.]{2,30}, /i,
  /\b(?:is|are|it)(?:n't| not) just [^.]{2,40}(?:,|;) (?:it|they|but)\b/i,
  /\bleverag(?:e|es|ing)\b/i,
  /\butiliz(?:e|es|ing)\b/i,
  /\bas an ai\b/i,
  /\bas of my (?:last|knowledge)\b/i,
  /\bknowledge cutoff\b/i,
];

// wrong -> right. Left side is matched case-insensitively on word boundaries.
const TYPOS = [
  ['recieve', 'receive'], ['seperate', 'separate'], ['occured', 'occurred'],
  ['occurence', 'occurrence'], ['succesful', 'successful'], ['succesfully', 'successfully'],
  ['enviroment', 'environment'], ['existance', 'existence'], ['definately', 'definitely'],
  ['publically', 'publicly'], ['dependancy', 'dependency'], ['dependancies', 'dependencies'],
  ['accomodate', 'accommodate'], ['neccessary', 'necessary'], ['necessarry', 'necessary'],
  ['compatability', 'compatibility'], ['authentification', 'authentication'],
  ['seperated', 'separated'], ['sucess', 'success'], ['adress', 'address'],
  ['recomend', 'recommend'], ['recomended', 'recommended'], ['refered', 'referred'],
  ['refering', 'referring'], ['begining', 'beginning'], ['comming', 'coming'],
  ['runing', 'running'], ['seting', 'setting'], ['setttings', 'settings'],
  ['acount', 'account'], ['aplication', 'application'], ['availabe', 'available'],
  ['avalible', 'available'], ['calender', 'calendar'], ['chanel', 'channel'],
  ['chanels', 'channels'], ['configuraton', 'configuration'], ['containes', 'contains'],
  ['diferent', 'different'], ['dont', "don't"], ['doesnt', "doesn't"], ['isnt', "isn't"],
  ['wont', "won't"], ['cant', "can't"], ['youre', "you're"], ['its own account', null],
  ['follwing', 'following'], ['fowlling', 'following'], ['hte', 'the'], ['teh', 'the'],
  ['taht', 'that'], ['thier', 'their'], ['recieved', 'received'], ['retreive', 'retrieve'],
  ['reponse', 'response'], ['requst', 'request'], ['sould', 'should'], ['shoud', 'should'],
  ['sucessfully', 'successfully'], ['througout', 'throughout'], ['untill', 'until'],
  ['usefull', 'useful'], ['wich', 'which'], ['wil', 'will'], ['alot', 'a lot'],
  ['everytime', 'every time'], ['inbetween', 'in between'], ['loosing', 'losing'],
  ['maintainance', 'maintenance'], ['mispelled', 'misspelled'], ['ocurred', 'occurred'],
  ['paramater', 'parameter'], ['paramaters', 'parameters'], ['persistant', 'persistent'],
  ['prefered', 'preferred'], ['priviledge', 'privilege'], ['recuring', 'recurring'],
  ['refernce', 'reference'], ['registraton', 'registration'], ['reprot', 'report'],
  ['scheduel', 'schedule'], ['schedual', 'schedule'], ['screenshoot', 'screenshot'],
  ['seach', 'search'], ['secuirty', 'security'], ['serivce', 'service'],
  ['sepcify', 'specify'], ['sucessful', 'successful'], ['sytem', 'system'],
  ['temoprary', 'temporary'], ['tokne', 'token'], ['upadte', 'update'],
  ['varaible', 'variable'], ['verison', 'version'], ['wheter', 'whether'],
  ['workfow', 'workflow'], ['yuo', 'you'], ['mastadon', 'Mastodon'],
].filter(([, right]) => right !== null);

// Product names that only have one correct spelling.
const NAMES = [
  [/\bGit[Hh]ub\b/g, 'GitHub', /GitHub/],
  [/\bgithub\b/g, 'GitHub', /GitHub/],
  [/\bGit[Ll]ab\b/g, 'GitLab', /GitLab/],
  [/\b[Jj]ava[Ss]cript\b/g, 'JavaScript', /JavaScript/],
  [/\b[Tt]ype[Ss]cript\b/g, 'TypeScript', /TypeScript/],
  [/\bNode\.?[Jj][Ss]\b|\bnodejs\b/gi, 'Node.js', /Node\.js/],
  [/\bpostgre[s]?[- ]?sql\b|\bPostgres[Ss][Qq][Ll]\b/gi, 'PostgreSQL', /PostgreSQL/],
  [/\bmy[- ]?sql\b/gi, 'MySQL', /MySQL/],
  [/\b[Rr]edis\b/g, 'Redis', /Redis/],
  [/\b[Yy]ou[Tt]ube\b/g, 'YouTube', /YouTube/],
  [/\b[Tt]ik[Tt]ok\b/g, 'TikTok', /TikTok/],
  [/\b[Ll]inked[Ii]n\b/g, 'LinkedIn', /LinkedIn/],
  [/\b[Ww]ord[Pp]ress\b/g, 'WordPress', /WordPress/],
  [/\b[Bb]lue[Ss]ky\b/g, 'Bluesky', /Bluesky/],
  [/\b[Mm]astodon\b/g, 'Mastodon', /Mastodon/],
  [/\b[Dd]iscord\b/g, 'Discord', /Discord/],
  [/\b[Tt]elegram\b/g, 'Telegram', /Telegram/],
  [/\b[Dd]ocker\b/g, 'Docker', /Docker/],
  [/\b[Kk]ubernetes\b/g, 'Kubernetes', /Kubernetes/],
  [/\b[Nn][Pp][Mm]\b/g, 'npm', /npm/],
  [/\bMac ?OS\b|\bmacos\b/g, 'macOS', /macOS/],
  [/\b[Oo][Aa]uth\b|\bOAUTH\b/g, 'OAuth', /OAuth/],
  [/\b[Pp]ostiz\b/g, 'Postiz', /Postiz/],
];

const COMPONENTS = new Set([
  'Accordion', 'AccordionGroup', 'Card', 'CardGroup', 'Check', 'CodeGroup', 'Columns',
  'Expandable', 'Frame', 'Info', 'Note', 'ParamField', 'RequestExample', 'ResponseExample',
  'ResponseField', 'Snippet', 'Step', 'Steps', 'Tab', 'Tabs', 'Tip', 'Tooltip', 'Update',
  'Warning',
]);

// Repeated words that are legitimate English.
const REPEATABLE = new Set(['had', 'that', 'is', 'no', 'the the']);

/* ------------------------------------------------------------- collection */

function listMdx(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listMdx(full, out);
    else if (entry.endsWith('.mdx')) out.push(full);
  }
  return out;
}

/* ---------------------------------------------------------------- masking */

const blank = (s) => ' '.repeat(s.length);
// Spacing rules run against a copy masked with a filler character instead of
// spaces, so a masked code span never looks like whitespace.
const FILL = '\u0001';
const filled = (s) => FILL.repeat(s.length);

// Attributes whose values are prose and should still be checked.
const PROSE_ATTRS = /^(?:title|alt|label|description|tooltip|caption|text|placeholder)$/i;

function maskTags(line, mask) {
  return line.replace(/<[^<>]*>/g, (tag) => {
    let out = mask(tag);
    for (const m of tag.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)) {
      if (!PROSE_ATTRS.test(m[1])) continue;
      const start = m.index + m[0].indexOf('"') + 1;
      out = out.slice(0, start) + m[2] + out.slice(start + m[2].length);
    }
    return out;
  });
}

function maskProse(line, mask = blank) {
  let out = line;
  out = out.replace(/`[^`]*`/g, mask);              // inline code
  out = maskTags(out, mask);                        // MDX and HTML tags
  out = out.replace(/\]\([^)]*\)/g, mask);         // link and image targets
  out = out.replace(/https?:\/\/\S+/g, mask);      // bare URLs
  out = out.replace(/^\s*(?:import|export)\s.*$/, mask); // MDX imports
  return out;
}

/* ---------------------------------------------------------------- reports */

const options = parseArgs(process.argv, root);
const report = new Report({ root, scope: loadScope(root, options), name: 'prose check' });

/* ------------------------------------------------------------------ check */

function checkFile(file) {
  report.checked += 1;
  const raw = readFileSync(file, 'utf8');
  const lines = raw.split('\n');

  const fileIgnores = new Set(
    [...raw.matchAll(/docs-lint-ignore-file:\s*([\w, -]+)/g)]
      .flatMap((m) => m[1].split(',').map((s) => s.trim()))
      .filter(Boolean),
  );
  const lineIgnores = new Map();
  lines.forEach((l, i) => {
    const m = l.match(/docs-lint-ignore\s+([\w, -]+?)\s*(?:\*\/\}|-->|$)/);
    if (m) lineIgnores.set(i + 2, new Set(m[1].split(',').map((s) => s.trim())));
  });

  // say() takes a zero-based line index. sayFile() reports a whole-file
  // problem, which counts whenever the branch touched the file at all.
  const say = (i, col, rule, message) => {
    if (fileIgnores.has(rule)) return;
    if (lineIgnores.get(i + 1)?.has(rule)) return;
    report.add(file, i + 1, rule, message, col);
  };
  const sayFile = (rule, message) => {
    if (fileIgnores.has(rule)) return;
    report.add(file, 0, rule, message);
  };

  // frontmatter and fenced code regions
  let fmEnd = -1;
  if (lines[0] === '---') fmEnd = lines.indexOf('---', 1);
  const inFence = new Array(lines.length).fill(false);
  let fence = null;
  for (let i = fmEnd + 1; i < lines.length; i += 1) {
    const open = lines[i].match(/^\s*(```+|~~~+)(.*)$/);
    if (fence === null && open) {
      fence = open[1][0];
      inFence[i] = true;
      const lang = open[2].trim();
      if (!lang) say(i, 1, 'markdown', 'code fence has no language');
      continue;
    }
    if (fence !== null) {
      inFence[i] = true;
      if (new RegExp(`^\\s*${fence === '`' ? '```+' : '~~~+'}\\s*$`).test(lines[i])) fence = null;
    }
  }
  if (fence !== null) sayFile('markdown', 'unclosed code fence');

  /* frontmatter, except in snippets which are partials */
  const isSnippet = relative(root, file).startsWith('snippets/');
  if (fmEnd === -1) {
    if (!isSnippet) sayFile('frontmatter', 'missing frontmatter block');
  } else {
    const fm = Object.fromEntries(
      lines.slice(1, fmEnd)
        .map((l) => l.match(/^([\w-]+):\s*(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]),
    );
    const at = (key) => lines.findIndex((l) => l.startsWith(`${key}:`));
    const required = fm.openapi ? ['title', 'icon'] : ['title', 'description', 'icon'];
    for (const key of required) {
      if (!fm[key]) sayFile('frontmatter', `frontmatter is missing "${key}"`);
    }
    if (fm.title?.endsWith('.')) say(at('title'), 1, 'frontmatter', 'title ends with a period');
    if (fm.description?.endsWith('.')) say(at('description'), 1, 'frontmatter', 'description ends with a period');
    if (fm.description && fm.description.length > 160) {
      say(at('description'), 1, 'frontmatter', `description is ${fm.description.length} chars, keep it under 160`);
    }
    if (fm.title && /^[a-z]/.test(fm.title)) say(at('title'), 1, 'frontmatter', 'title does not start with a capital');
    if (fm.description && /^[a-z]/.test(fm.description)) {
      say(at('description'), 1, 'frontmatter', 'description does not start with a capital');
    }
  }

  /* per line */
  let blanks = 0;
  let lastHeading = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const code = inFence[i];
    const fm = fmEnd !== -1 && i <= fmEnd;
    const source = fm
      ? (/^(?:title|description|sidebarTitle):/.test(line) ? line.replace(/^[\w-]+:/, blank) : blank(line))
      : line;
    const prose = code ? '' : maskProse(source);
    const spaced = code ? '' : maskProse(source, filled);

    /* whitespace, everywhere including code */
    if (/[ \t]+$/.test(line)) say(i, line.search(/[ \t]+$/) + 1, 'spacing', 'trailing whitespace');
    if (!code && /\t/.test(line)) say(i, line.indexOf('\t') + 1, 'spacing', 'tab character, use spaces');

    if (line.trim() === '') {
      blanks += 1;
      if (blanks === 2 && !code) say(i, 1, 'spacing', 'more than one blank line in a row');
    } else {
      blanks = 0;
    }

    /* typography, everywhere: an em-dash in a code sample is still wrong */
    for (const [ch, name] of [['—', 'em-dash'], ['–', 'en-dash'], ['‘', 'smart quote'],
      ['’', 'smart apostrophe'], ['“', 'smart quote'], ['”', 'smart quote'],
      ['…', 'ellipsis character'], [' ', 'non-breaking space'], ['​', 'zero-width space'],
      ['‍', 'zero-width joiner'], ['﻿', 'byte order mark']]) {
      const at = line.indexOf(ch);
      if (at !== -1) say(i, at + 1, 'typography', `${name} (${JSON.stringify(ch)})`);
    }
    if (/ -- /.test(line) && !code) say(i, line.indexOf(' -- ') + 1, 'typography', 'double hyphen used as a dash');

    /* ai markers */
    for (const re of AI_PHRASES) {
      const m = prose.match(re);
      if (m) say(i, m.index + 1, 'ai-marker', `reads as generated filler: "${m[0].trim()}"`);
    }

    /* typos */
    for (const [wrong, right] of TYPOS) {
      const m = prose.match(new RegExp(`\\b${wrong}\\b`, 'i'));
      if (m) say(i, m.index + 1, 'typo', `"${m[0]}" should be "${right}"`);
    }
    const dup = spaced.match(/\b([A-Za-z']{2,})[ \t]+\1\b/i);
    if (dup && !REPEATABLE.has(dup[1].toLowerCase())) {
      say(i, dup.index + 1, 'typo', `doubled word: "${dup[0]}"`);
    }

    /* product naming */
    for (const [re, correct] of NAMES) {
      for (const m of prose.matchAll(re)) {
        if (m[0] === correct) continue;
        const before = prose[m.index - 1] ?? ' ';
        const after = prose[m.index + m[0].length] ?? ' ';
        if (/[-_/.@]/.test(before) || /[-_/.@]/.test(after)) continue; // docker-compose, postiz-app
        say(i, m.index + 1, 'naming', `"${m[0]}" should be "${correct}"`);
      }
    }

    /* spacing and punctuation in prose */
    const dbl = spaced.match(/\S  +\S/);
    if (dbl && !/^\s*(?:[|>]|-{2,})/.test(line)) {
      say(i, dbl.index + 2, 'spacing', 'double space between words');
    }
    const beforePunct = spaced.match(/[\w"')][ \t]+(?:[,.;](?![\w/])|[!?](?=\s|$))/);
    if (beforePunct) say(i, beforePunct.index + 2, 'spacing', 'space before punctuation');
    const afterPunct = spaced.match(/[a-z]{2}[,;](?=[A-Za-z])/);
    if (afterPunct) say(i, afterPunct.index + 1, 'spacing', 'missing space after punctuation');

    /* markdown mechanics */
    if (!code) {
      const ticks = (line.match(/`/g) ?? []).length;
      if (ticks % 2 === 1 && !/^\s*(```|~~~)/.test(line)) {
        say(i, line.indexOf('`') + 1, 'markdown', 'odd number of backticks, inline code is not closed');
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading && !fm) {
        const level = heading[1].length;
        const text = heading[2].trim();
        if (level === 1) say(i, 1, 'markdown', 'h1 is the frontmatter title, start pages at h2');
        if (lastHeading && level > lastHeading + 1) {
          say(i, 1, 'markdown', `heading jumps from h${lastHeading} to h${level}`);
        }
        lastHeading = level;
        if (/[.,;:!]$/.test(text)) say(i, 1, 'markdown', 'heading ends with punctuation');
        const identifier = /^[`$]/.test(text) || /^[a-z][\w.-]*$/.test(text) || /^(?:npm|macOS|iOS|docker-compose)\b/.test(text);
        if (/^[a-z]/.test(text) && !identifier) say(i, 1, 'markdown', 'heading does not start with a capital');
      }

      for (const m of line.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)) {
        const [, text, target] = m;
        if (!target.trim()) say(i, m.index + 1, 'markdown', 'link has an empty target');
        if (!text.trim() && line[m.index - 1] !== '!') say(i, m.index + 1, 'markdown', 'link has no text');
        if (/^(here|click here|this link|link|read more)$/i.test(text.trim())) {
          say(i, m.index + 1, 'markdown', `link text "${text}" says nothing, describe the target`);
        }
      }

      for (const m of line.matchAll(/!\[([^\]]*)\]\(([^)]+)\)|<img\b[^>]*?src="([^"]+)"[^>]*>/g)) {
        const src = m[2] ?? m[3];
        if (m[1] !== undefined && !m[1].trim()) say(i, m.index + 1, 'markdown', 'image has no alt text');
        if (m[3] !== undefined && !/\balt="[^"]+"/.test(m[0])) say(i, m.index + 1, 'markdown', 'image has no alt text');
        if (!src || /^https?:|^data:|\{/.test(src)) continue;
        const path = src.startsWith('/') ? join(root, src) : join(dirname(file), src);
        if (!existsSync(path.split('#')[0])) say(i, m.index + 1, 'markdown', `image not found on disk: ${src}`);
      }

    }
  }

  /* component balance, over the whole document so multi-line tags still pair */
  const doc = lines.map((l, i) => (inFence[i] || (fmEnd !== -1 && i <= fmEnd) ? blank(l) : l)).join('\n');
  const lineOf = (index) => doc.slice(0, index).split('\n').length;
  const components = [];
  for (const m of doc.matchAll(/<(\/?)([A-Z][\w.]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g)) {
    const [, closing, name, , selfClosing] = m;
    const at = lineOf(m.index);
    if (!COMPONENTS.has(name)) {
      say(at - 1, 1, 'markdown', `unknown component <${name}>`);
      continue;
    }
    if (selfClosing) continue;
    if (!closing) { components.push({ name, line: at }); continue; }
    const open = components.pop();
    if (!open) say(at - 1, 1, 'markdown', `</${name}> closes a component that was never opened`);
    else if (open.name !== name) {
      say(at - 1, 1, 'markdown', `</${name}> closes <${open.name}> opened on line ${open.line}`);
    }
  }
  for (const open of components) {
    say(open.line - 1, 1, 'markdown', `<${open.name}> is never closed`);
  }

  if (!raw.endsWith('\n')) sayFile('spacing', 'file does not end with a newline');
  if (raw.endsWith('\n\n')) sayFile('spacing', 'file ends with a blank line');
}

/* ------------------------------------------------------------------- main */

const files = options.files.length ? options.files : listMdx(root);

for (const file of files) {
  if (!file.endsWith('.mdx') || !existsSync(file)) continue;
  checkFile(file);
}

report.finish();
