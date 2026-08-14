# Documentation screenshots

Screenshots in `images/guide/` are captured from a throwaway Postiz instance so
they can be regenerated when the interface changes, rather than being one-off
images nobody can reproduce.

## Regenerating

```bash
cd scripts/screenshots
docker compose up -d              # isolated stack on :4009, own volumes
# wait for the backend, roughly two minutes on a cold start
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4009/api/

node capture.mjs                  # registers demo@acme.test on first run
docker compose exec -T postgres psql -U shots -d shots < seed.sql
node capture.mjs                  # capture with the demo data in place

docker compose down -v            # remove containers and volumes
```

`capture.mjs <name>` captures a single shot, for example `node capture.mjs
calendar`.

## Why it is set up this way

- **Its own compose project and volumes.** It never touches an existing local
  Postiz install or its database.
- **Seeded channels carry placeholder tokens.** They render correctly but
  cannot publish, which is all a screenshot needs, and it avoids connecting
  real social accounts.
- **Fixed 1440px viewport, dark theme, 2x scale.** Re-running produces
  comparable images.

## Conventions

- Screenshots are for **layout orientation and multi-step flows only**. Never
  screenshot a table, a settings toggle or an error message: that content
  belongs in the prose, where it is searchable and does not go stale.
- One screenshot per page, maximum.
- Every image needs real alt text.
- Do not ship a screenshot showing an error state produced by the demo rig. The
  analytics page, for example, shows a refresh error because the demo tokens are
  fake, which would teach the wrong thing.

## What cannot be captured here

Anything that needs a real Postiz Cloud subscription: the plan picker, the
billing page, proration previews, and analytics with real platform data. Those
have to come from a cloud account.
