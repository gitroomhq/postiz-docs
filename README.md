# Postiz documentation

The source for [docs.postiz.com](https://docs.postiz.com), built with
[Mintlify](https://mintlify.com).

## Running it locally

```bash
npx mint dev          # preview at http://localhost:3000
npm run check         # structural checks (see below)
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
- Start a product page with a bold **Where:** line giving the path through the
  interface, so support can link someone straight to the control.
- Say a tier name ("Team and above"), never a price, outside `cloud/plans`.

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

1. Create the `.mdx` file with `title`, `description` and, in the Guide tab, an
   `icon`.
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
