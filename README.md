# Postiz documentation

The source for [docs.postiz.com](https://docs.postiz.com), built with
[Mintlify](https://mintlify.com).

## Running it locally

```bash
npx mint dev          # preview at http://localhost:3000
npm run check         # structure and prose checks (see below)
npm run check:prose   # prose only, or pass files: npm run check:prose -- general/quickstart.mdx
npx mint broken-links # internal link checker
```

`mint dev` also warns about pages that exist on disk but are missing from
`docs.json`.

## How the docs are organised

Six tabs, three of which are audiences:

| Tab | Path prefix | For | Rule |
|---|---|---|---|
| **Guide** | `/general/**` | Everyone | How the product works. Never mentions env vars, Docker or installation |
| **Cloud** | `/cloud/**` | Postiz Cloud users | Plans, billing, limits. The only place a price appears |
| **Self-Hosting** | `/self-host/**` | People running their own instance | Install, configure, provider API keys, infrastructure |
| **Public API** | `/public-api/**` | Developers | Endpoints and per-platform settings schemas |
| **Automation** | `/cli/**`, `/mcp/**` | Developers | CLI and MCP |
| **Contributing** | `/contributing/**` | Contributors | Working on Postiz itself |

**The path prefix must match the tab.** It is what lets the cloud support agent
be scoped to non-self-hosting content with a single rule, so a page in the
wrong prefix is a real bug, not a cosmetic one.

**Every page belongs to exactly one tab.** Listing a page in two places breaks
breadcrumbs and the previous/next pager. Link across tabs with `<Card>`
instead.

### Writing for a shared page

When something differs between cloud and self-hosted, escalate in this order:

1. A value differs: an inline `<Note>` starting with the words
   **"On self-hosted Postiz:"**.
2. Short steps differ: a `<Tabs>` block with tabs named exactly
   `Postiz Cloud` and `Self-hosted`, cloud first.
3. A whole procedure differs, or an environment variable is involved: do not
   inline it. Link to the other tab with a `<Card>`.
4. The feature does not exist on one side: a `<Warning>`.

Two things a Guide or Cloud page must never contain: `` `.env` `` and a
`docker` or `pnpm` command. `npm run check` enforces this.

### Style

- **No em-dashes.** Use commas, colons, parentheses or a full stop. Enforced by
  `npm run check`.
- **No generated filler.** Phrases like "seamlessly", "dive into", "leverage",
  "unlock the power of" and "it is worth noting" are rejected. Say the thing
  instead.
- Start a product page with a bold **Where:** line giving the path through the
  interface, so support can link someone straight to the control.
- Say a tier name ("Team and above"), never a price, outside `cloud/plans`.

## Automated checks

`npm run check` runs two dependency-free scripts, and the same two run on every
pull request through `.github/workflows/docs-checks.yml`. A failure blocks the
merge, so run it before pushing.

`scripts/check-docs.mjs` covers structure: every page in `docs.json` exists,
every `.mdx` is in `docs.json`, no page is listed twice, no em-dashes, and no
self-hosting mechanics on a Guide or Cloud page.

`scripts/check-prose.mjs` covers the writing itself, grouped by rule id:

| Rule | Catches |
|---|---|
| `typography` | em and en dashes, smart quotes, ellipsis characters, non-breaking and zero-width characters |
| `ai-marker` | phrases that read as generated filler |
| `typo` | common misspellings and doubled words |
| `naming` | product names in the wrong casing: `Github`, `NodeJS`, `Javascript`, lowercase `postiz` |
| `spacing` | double spaces, trailing whitespace, stray blank lines, space before punctuation |
| `frontmatter` | missing `title`, `description` or `icon`, trailing periods, descriptions over 160 characters |
| `markdown` | unclosed components and inline code, unlabelled code fences, heading levels, empty or vague links, images missing alt text or missing from disk |

Prose rules ignore code fences, inline code, link targets and URLs, so a
command that has to be lowercase is never flagged.

When a rule is wrong about a specific line, suppress it with a comment on the
line above, naming the rule:

```mdx
{/* docs-lint-ignore typo */}
- My Business Business Information API
```

`{/* docs-lint-ignore-file: ai-marker, naming */}` does the same for a whole
file. Both take a comma separated list. Suppress the narrowest thing that
works, and never a whole file for a single line.

## Generated tables

Some tables are derived from the Postiz source so they cannot silently drift.
They live between markers:

```mdx
{/* GENERATED:pricing */}
...
{/* /GENERATED:pricing */}
```

Regenerate with a `postiz-app` checkout beside this repo:

```bash
node scripts/sync-facts.mjs           # rewrite the tables
node scripts/sync-facts.mjs --check   # fail if they are stale
POSTIZ_APP=/path/to/postiz-app node scripts/sync-facts.mjs
```

Current regions: `pricing` and `limits` (from `pricing.ts`), `platforms` (from
the provider registry), `analytics` (from the analytics allowlists). Edit the
source, not the table.

## Adding a page

1. Create the `.mdx` file with `title`, `description` and `icon`. Pages driven
   by an `openapi` entry take their description from the spec.
2. Add it to `docs.json` under exactly one tab.
3. Run `npm run check`.

## Moving a page

Existing URLs are linked from Discord, YouTube videos and GitHub issues. If you
must move one, add a `redirects` entry in `docs.json` in the same change.
Wildcards work, so a whole directory is one entry:

```json
{ "source": "/old-dir/:slug*", "destination": "/new-dir/:slug*", "permanent": true }
```

Never rename or reorder an existing `###` heading in
`self-host/configuration/reference.mdx`: those anchors are linked externally.

## Keeping the support agent scoped to cloud

The cloud support agent must never answer from self-hosting documentation: a
paying cloud customer asking about connecting a channel should not be told to
edit an environment variable.

In Fin, under the website source's **Advanced sync settings > URLs to
exclude**, that is two globs:

```
https://docs.postiz.com/self-host/**
https://docs.postiz.com/contributing/**
```

This works only while the prefixes stay honest, which is the rule above. Do
not use `noindex` frontmatter or a robots rule instead: that would also drop
the self-hosting pages from Google, and they should stay findable.
