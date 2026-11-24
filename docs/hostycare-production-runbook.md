# HostyCare production release runbook

This runbook prepares a secure release; it does not authorize production activation. The HostyCare deployment workflow has a manual dispatch that defaults to artifact-verification-only, a disabled-by-default repository variable, and a protected GitHub Environment. Contacting HostyCare requires explicitly disabling verify-only, enabling the repository gate, and passing the protected Environment review. Do not do those actions until every prerequisite below is confirmed.

## Verified repository state

- This release candidate is committed on the isolated `fix/production-complete-validation` branch. The exact commit SHA, local HostyCare archive path, and SHA-256 are in the release-preparation handoff; do not use earlier GitHub artifacts from other commits.
- The release archive contains Linux x64 production dependencies and the source SHA in `RELEASE_SHA`.
- Earlier GitHub artifacts listed in repository history belong to different commits and must not be used for this release candidate.
- CI builds on Ubuntu with Node.js 22 and Next.js standalone output. The build-only dummy `DATABASE_URL` is scoped to the build step and is never copied into the release as runtime configuration.
- The local workspace contains hundreds of untracked items, mostly old snapshots/backups. The deployment commit staged only reviewed release files; the untracked items are not included in the CI checkout or release artifact. Do not run broad Git clean/add commands.
- The current MySQL Prisma chain has 34 directories and a known ordering defect: `20261117082146_add_razorpay_payment_fields` alters `Order` before `20261117133000_add_orders` creates it. The fresh-install baseline is for isolated or genuinely new empty schemas only. Do not run it or the historical chain against the existing live production database, and do not run `migrate reset`.
- Prisma validation passes and a schema diff between `prisma/fresh-install/baseline.prisma` and `prisma/schema.prisma` reports no difference.

## HostyCare capability boundary

HostyCare's public hosting page advertises cPanel, Node.js, SSH/Git, MySQL/MariaDB and SSL. That does not confirm this account's Node application type, incoming SSH reachability, filesystem permissions, process manager, or persistent storage. The cPanel Node.js setup tool can use Passenger and a `tmp/restart.txt` marker, but confirm the actual account before relying on it. See [HostyCare hosting](https://www.hostycare.com/hosting/), [cPanel Node.js deployment docs](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/), and [cPanel restart instructions](https://support.cpanel.net/hc/en-us/articles/1500002443862-How-to-restart-an-application-that-s-using-cPanel-s-Application-Manager).

No HostyCare server mutation has been attempted. This workspace has no authorized connection to the live production database or media volume, so compatibility claims for those live resources require the guarded cPanel preflight against the existing database and confirmed persistent media path before activation. HostyCare must confirm SSH reachability, host fingerprint, cPanel runtime/restart support, production database version and credentials, persistent media location, and a known-good rollback release.

## Release contents and deployment flow

`production-build.yml` builds on Ubuntu 24.04 / Node 22, runs TypeScript and packager checks, then creates a seven-day GitHub artifact. The packager allowlists only the standalone server, Next server/static output, tracked public assets, generated Prisma client, current schema, 34 migrations, fresh-install baseline, and cPanel runtime helpers. It does not copy `.env`, `.git`, untracked `public/uploads`, backups, logs, tests, or the rest of the checkout. The archive is checksummed and contains its source SHA.

`hostycare-deploy.yml` can only run by manual dispatch on `feature/50-palettes-v2`. It verifies the source run and immutable SHA, checks the archive checksum/path contents, requires the `hostycare-production` Environment approval, and stays disabled unless `HOSTYCARE_DEPLOY_ENABLED=true` is configured. It uses SSH with a pinned host key; it never runs `ssh-keyscan` and does not put app/database/payment/email secrets in GitHub. The remote script stages a new release, verifies Node 22, checks migration history, writes a private MySQL dump, then atomically swaps `current` and requests a Passenger restart. It refuses to activate without an existing known-good `current` release and a server-side `DEPLOYMENT_READY` marker. A failed health or route check requests a rollback.

### Manual cPanel deployment

A deployment can be staged without SSH or GitHub Actions by using cPanel File Manager and Terminal. This still uses the same checksum, archive validation, database-history gate, private backup, atomic release switch, and Passenger restart flow. It does not bypass the deployment readiness marker or production activation approval.

1. Use the exact release archive and `.sha256` file in the release-preparation handoff for the reviewed commit. Transfer them from the authorized release-preparation workstation; do not rebuild or edit the archive. For future releases, only use the artifact matching that exact reviewed commit.
2. In cPanel File Manager, upload both files to `/home/srikalah/srikalahasti-app/incoming/`. Upload the reviewed `scripts/hostycare-release.sh` to `/home/srikalah/srikalahasti-app/shared/hostycare-release.sh`.
3. In cPanel Terminal, verify the uploaded checksum and stage the archive using the Node.js 22 shell:

   ```sh
   cd /home/srikalah/srikalahasti-app/incoming
   sha256sum -c "srikalahasti-release-<SHA>.tar.gz.sha256"
   bash /home/srikalah/srikalahasti-app/shared/hostycare-release.sh prepare <SHA> /home/srikalah/srikalahasti-app
   ```

4. After the owner has approved activation and confirmed the readiness marker, production environment, database migration history, persistent media directories, and rollback target, activate the staged release:

   ```sh
   bash /home/srikalah/srikalahasti-app/shared/hostycare-release.sh activate <SHA> /home/srikalah/srikalahasti-app
   ```

5. Confirm `/api/health`, the homepage, category/product pages, Admin sign-in, and image uploads in the live site. Roll back using the verified `previous` target if the release fails:

   ```sh
   bash /home/srikalah/srikalahasti-app/shared/hostycare-release.sh rollback <SHA> /home/srikalahasti/srikalahasti-app
   ```

The rollback command changes only the release symlink and Passenger restart marker; it does not roll back database changes. This deployment flow refuses migration-history mismatches and does not apply migrations automatically.

The cPanel application must be configured with:

- Node.js 22 and application root `/home/srikalah/srikalahasti-app/current`.
- Startup file `start-cpanel.js`.
- `SK_ENV_FILE=/home/srikalah/srikalahasti-app/shared/production.env` set in the cPanel application environment.
- A rollback release already installed and selected by the `current` symlink.
- A production environment file owned by `srikalah`, mode `0600`, outside every release.
- The domain and HTTPS certificate routed to that app, with `/api/health` reachable over HTTPS.

The startup file rejects an unprotected environment file, missing production secrets, an invalid media mount, non-Node-22 runtime, and live Razorpay mode without a separate authorization marker plus key and webhook values. Never set `RAZORPAY_LIVE_LAUNCH_APPROVED=YES` before explicit launch authorization.

## Persistent media setup

Use a directory outside `releases` and outside the public web root, owned by the cPanel app user. After confirming the path with HostyCare, run in cPanel Terminal as `srikalah` (do not remove or replace existing files):

```sh
MEDIA_ROOT=/home/srikalah/srikalah-media
mkdir -p "$MEDIA_ROOT"/{products,categories,hero-videos,story-videos}
chmod 750 "$MEDIA_ROOT" "$MEDIA_ROOT"/{products,categories,hero-videos,story-videos}
test -w "$MEDIA_ROOT" && test -w "$MEDIA_ROOT/products" && test -w "$MEDIA_ROOT/categories" && test -w "$MEDIA_ROOT/hero-videos" && test -w "$MEDIA_ROOT/story-videos"
```

Put the same absolute path in `MEDIA_STORAGE_DIR` in `shared/production.env`. Configure independent media backups. Do not copy local `public/uploads` unless a separate review proves any of its files are referenced by production records.

## Existing production database compatibility

The live HostyCare site already has production data. Preserve its existing schema and records. Never create a replacement schema, apply `prisma/fresh-install/baseline.sql`, run `migrate reset`, or import data from another store as part of this release.

This workspace does not contain an authorized production database connection, so it cannot certify the live database's schema or migration history. The release script's `activate` command runs `hostycare-preflight.mjs` against the configured live schema before switching `current`. That compatibility check requires successful `_prisma_migrations` records to match the release migration set exactly, then writes a private SQL backup under `shared/db-backups`. It refuses activation on missing, failed, rolled-back, duplicate, pending, or unexpected migration records. It does not apply migrations.

Before activation, take a separate owner-controlled backup, confirm the exact existing schema and migration history, and run the guarded preflight from cPanel. If the current production schema does not have the expected Prisma history or exact matching schema, stop; do not resolve migration records or modify the schema to make the gate pass. Have the database history/schema reviewed and a forward-only compatibility plan prepared against a restored copy first. The historical migration order includes a known defect and must never be replayed into production. The checked-in `prisma/fresh-install/baseline.sql` is for isolated/new-schema tests only and is not a live-site recovery path.

## Server-side environment file

Create `/home/srikalah/srikalahasti-app/shared/production.env` with mode `0600`; do not commit it, paste it into a workflow, or print it. It must include `NODE_ENV=production`, `DATABASE_URL`, `DEPLOY_DATABASE_NAME`, independent `ADMIN_SESSION_SECRET`, `CUSTOMER_SESSION_SECRET`, and `PAYMENT_RECOVERY_SECRET` values, plus `MEDIA_STORAGE_DIR`, `APP_BASE_URL`, and the selected email provider configuration (`EMAIL_PROVIDER`, `PASSWORD_RESET_EMAIL_FROM`, and the required SMTP or Resend settings). The app and the migration preflight load this file locally on HostyCare; GitHub receives only a dedicated SSH deployment key and pinned host-key entry, not the application, database, email, or payment credentials.

Leave Razorpay keys and `RAZORPAY_MODE` unset until payment and webhook credentials have been verified and live payment activation is explicitly authorized. This deployment pipeline never initiates charges or refunds.

## GitHub Environment settings

Before enabling the workflow, create a protected Environment named `hostycare-production` with required reviewer(s), then set:

- Environment variable `HOSTYCARE_DEPLOY_ENABLED=true` (leave unset until ready).
- Variables `HOSTYCARE_SSH_HOST`, `HOSTYCARE_SSH_USER`, `HOSTYCARE_SSH_PORT`, `HOSTYCARE_APP_ROOT=/home/srikalah/srikalahasti-app`, `HOSTYCARE_KNOWN_HOSTS`, and `HOSTYCARE_HEALTH_URL=https://srikalahastikalamkari.in/api/health`.
- Secret `HOSTYCARE_SSH_PRIVATE_KEY`, a dedicated deploy key restricted to the cPanel account. Keep application secrets and `DATABASE_URL` out of GitHub.

Obtain the server host key through HostyCare support or the authenticated cPanel account, verify its fingerprint out of band, then pin it. Never trust an unverified scan result.

## Remaining prerequisites before any production activation

1. Re-authenticate GitHub CLI, review only the deployment changes, commit them, push the feature branch, and verify the new build artifact workflow run.
2. Have HostyCare confirm the actual cPanel Node app feature (Passenger vs Web Apps), Node 22 interpreter path, startup file support, incoming SSH hostname/IP and fingerprint, `current` symlink support, memory/request limits, MySQL/MariaDB version/client tools, SSL routing, and persistent disk policy.
3. Create and verify a known-good rollback release and configure the cPanel root to the `current` symlink without deleting the existing app directory or Git clone.
4. Confirm the existing production database and run the guarded compatibility/backup preflight; do not initialize or replace it.
5. Configure or verify server-side secrets, email delivery, persistent media directories, HTTPS, and the server-side readiness marker while preserving existing values and media.
6. Run the protected manual deployment workflow only after the owner approves production activation. Verify homepage, product/category pages, admin/customer login, cart/checkout, upload, email, SSL, responsive layouts, themes, and payment/webhook readiness manually. Do not make a real payment as a deployment test.
