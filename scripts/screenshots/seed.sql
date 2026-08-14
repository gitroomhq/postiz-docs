-- Seeds a demo organisation for documentation screenshots.
-- Channels carry placeholder tokens: they render in the UI but cannot publish,
-- which is all a screenshot needs.

\set ON_ERROR_STOP on

DO $$
DECLARE
  org_id   text;
  acme_id  text;
  north_id text;
  grp      text;
  base     timestamp := date_trunc('week', now()) + interval '1 day';
  ch       record;
BEGIN
  SELECT id INTO org_id FROM "Organization" ORDER BY "createdAt" LIMIT 1;
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found. Register a user through the UI first.';
  END IF;

  DELETE FROM "TagsPosts" WHERE "postId" IN (SELECT id FROM "Post" WHERE "organizationId" = org_id);
  DELETE FROM "Post" WHERE "organizationId" = org_id;
  DELETE FROM "Integration" WHERE "organizationId" = org_id;
  DELETE FROM "Tags" WHERE "orgId" = org_id;
  DELETE FROM "Customer" WHERE "orgId" = org_id;

  INSERT INTO "Customer" (id, name, "orgId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, 'Acme Coffee', org_id, now(), now())
  RETURNING id INTO acme_id;

  INSERT INTO "Customer" (id, name, "orgId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, 'Northwind', org_id, now(), now())
  RETURNING id INTO north_id;

  INSERT INTO "Integration"
    (id, "internalId", "organizationId", name, picture, "providerIdentifier", type,
     token, "customerId", "postingTimes", "createdAt", "updatedAt")
  VALUES
    ('demo-x',      'demo-x-1',      org_id, '@acmecoffee',      '/icons/platforms/x.png',            'x',             'social', 'demo', acme_id,
      '[{"time":540},{"time":780},{"time":1080}]', now(), now()),
    ('demo-li',     'demo-li-1',     org_id, 'Acme Coffee Co.',  '/icons/platforms/linkedin.png',     'linkedin',      'social', 'demo', acme_id,
      '[{"time":540},{"time":780}]', now(), now()),
    ('demo-ig',     'demo-ig-1',     org_id, 'acme.coffee',      '/icons/platforms/instagram.png',    'instagram',     'social', 'demo', acme_id,
      '[{"time":660},{"time":1080}]', now(), now()),
    ('demo-bsky',   'demo-bsky-1',   org_id, 'northwind.bsky',   '/icons/platforms/bluesky.png',      'bluesky',       'social', 'demo', north_id,
      '[{"time":600},{"time":900}]', now(), now()),
    ('demo-md',     'demo-md-1',     org_id, '@northwind',       '/icons/platforms/mastodon.png',     'mastodon',      'social', 'demo', north_id,
      '[{"time":600}]', now(), now()),
    ('demo-yt',     'demo-yt-1',     org_id, 'Acme Coffee TV',   '/icons/platforms/youtube.png',      'youtube',       'social', 'demo', acme_id,
      '[{"time":900}]', now(), now());

  INSERT INTO "Tags" (id, name, color, "orgId", "createdAt", "updatedAt") VALUES
    ('tag-launch',  'Launch',    '#9900e6', org_id, now(), now()),
    ('tag-evergr',  'Evergreen', '#0ea5e9', org_id, now(), now()),
    ('tag-client',  'Client',    '#f59e0b', org_id, now(), now());

  FOR ch IN
    SELECT * FROM (VALUES
      ('demo-x',    0, 9,  'PUBLISHED', 'Our new single-origin roast lands tomorrow. Six months of sourcing in one bag.', 'tag-launch'),
      ('demo-li',   0, 13, 'PUBLISHED', 'We rebuilt our roasting schedule around demand forecasting. Write-up below.', 'tag-evergr'),
      ('demo-ig',   1, 11, 'PUBLISHED', 'Behind the counter at 6am.', 'tag-evergr'),
      ('demo-bsky', 1, 10, 'QUEUE',     'Small update shipping this week: faster order pickup.', 'tag-client'),
      ('demo-x',    2, 9,  'QUEUE',     'Three things we learned running a subscription for a year.', 'tag-evergr'),
      ('demo-li',   2, 13, 'QUEUE',     'Hiring a roaster. Remote-friendly on the admin side, hands-on for the rest.', 'tag-client'),
      ('demo-yt',   3, 15, 'QUEUE',     'Full tour of the new roastery.', 'tag-launch'),
      ('demo-ig',   3, 11, 'DRAFT',     'Draft: carousel of the new packaging.', 'tag-launch'),
      ('demo-md',   4, 10, 'QUEUE',     'Now on the fediverse. Same coffee, fewer ads.', 'tag-evergr'),
      ('demo-x',    4, 18, 'QUEUE',     'Friday: the roastery is open late for tastings.', 'tag-client'),
      ('demo-bsky', 5, 15, 'DRAFT',     'Draft: weekend opening hours.', 'tag-client')
    ) AS t(integ, day_offset, hour, state, content, tag)
  LOOP
    grp := gen_random_uuid()::text;
    INSERT INTO "Post"
      (id, state, "publishDate", "organizationId", "integrationId", content, "group",
       settings, "createdAt", "updatedAt")
    VALUES
      (grp, ch.state::"State", base + (ch.day_offset || ' days')::interval + (ch.hour || ' hours')::interval,
       org_id, ch.integ, '<p>' || ch.content || '</p>', grp,
       '{}', now(), now());
    INSERT INTO "TagsPosts" ("postId", "tagId", "createdAt", "updatedAt")
    VALUES (grp, ch.tag, now(), now());
  END LOOP;

  RAISE NOTICE 'Seeded org %', org_id;
END $$;
