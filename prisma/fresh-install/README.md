# Fresh MySQL install baseline

`baseline.sql` is generated from the current Prisma datamodel with Prisma 7's
`migrate diff --from-empty` command. The three `HeroSlide` TEXT defaults use
parenthesized expressions for MySQL 9.3. `baseline.prisma` records the
`dbgenerated` form that Prisma introspects after MySQL normalizes those defaults
with its UTF-8 character-set introducer. A Prisma diff between the applied
baseline and this schema snapshot reports no differences.

This baseline is for a **new, empty schema only**. Never execute it against the
project database or the existing `srikalahasti_auth_step494_test` database. It
does not drop or alter existing tables.

## Why this baseline exists

The historical migration chain has one ordering defect: migration
`20261117082146_add_razorpay_payment_fields` alters `Order` before
`20261117133000_add_orders` creates it. A dependency scan of all 34 local
migrations found no other table creation/alter/foreign-key ordering issue.
The historical directory remains unchanged by this strategy. A fresh database
is created directly from the current Prisma schema, then Prisma is told that
the existing migration set is represented by that baseline. Future migrations
remain forward-only in `prisma/migrations` and are applied with `migrate deploy`.

The generated baseline includes customer/authentication tables, orders and
items, Razorpay attempts and webhook linkage, rate limits, inventory movement,
products/variants, coupons, and current store settings. The 50 theme palettes are
application data in source; the published theme setting is `StoreSettings.themeId`.
The obsolete `StoreThemeState` table and `HeroSlideSeedMarker` table are absent
from the current Prisma model. This baseline is for a new store and does not
copy any current production theme value or customer data.

## One-time bootstrap for a new schema

Do not run this until the user has approved creating the disposable schema and
the local MySQL administrator has granted schema-scoped permissions. The
existing local application account is `sk_app@localhost`; do not grant global
privileges and do not reuse either existing database.

From an already authorized local MySQL administrator session, the exact setup
commands for a separately named disposable schema are:

```sql
CREATE DATABASE `srikalahasti_step503_fresh_baseline_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `srikalahasti_step503_fresh_baseline_test`.*
  TO 'sk_app'@'localhost';
```

In a **new shell**, point only that shell's Prisma commands at the new schema.
This derives the existing local connection settings without displaying the URL
or changing `.env`:

```sh
export DATABASE_URL="$(node -e 'require("dotenv").config({quiet:true}); const u=new URL(process.env.DATABASE_URL); u.pathname="/srikalahasti_step503_fresh_baseline_test"; process.stdout.write(u.toString())')"
npx prisma db execute --config prisma7.config.ts --file prisma/fresh-install/baseline.sql

for migration_dir in prisma/migrations/2026*/; do
  migration_name=${migration_dir%/}
  migration_name=${migration_name##*/}
  [[ "$migration_name" < "20261126120000_global_media_cleanup" ]] || continue
  npx prisma migrate resolve --config prisma7.config.ts --applied "$migration_name" || exit 1
done

npx prisma migrate deploy --config prisma7.config.ts

npx prisma migrate status --config prisma7.config.ts
```

Confirm `DATABASE_URL` still targets only the disposable schema before each
command. The baseline and all matching `migrate resolve` commands must run in
the same shell. Once bootstrapped, use normal forward-only migration SQL and
`npx prisma migrate deploy`; do not regenerate or edit prior migration files.

Prisma's normal `migrate dev` shadow replay is not a safe migration-generation
path until the legacy ordering defect is addressed in a separately reviewed
history strategy. Keep `baseline.prisma` immutable. For each later schema
change, retain a new schema snapshot named for its migration and generate the
forward SQL from the latest snapshot to the changed schema. Review the SQL for
MySQL 9.3 compatibility, and test it on an approved disposable schema before
adding it to the shared migration directory. Existing databases use
`migrate deploy` to apply those same forward migrations; no old migration is
rewritten.

## Validation status

The baseline was applied to the newly approved
`srikalahasti_step503_fresh_baseline_test` schema after confirming its identity
and that it had zero tables and views. MySQL 9.3 metadata checks found all
required tables, indexes, foreign keys, and the three HeroSlide TEXT defaults.
Prisma reports no schema diff and all 34 migration directories are represented
as applied. No fixtures were inserted. The existing
`srikalahasti_auth_step494_test` and project database were not modified.
