# HostyCare production release runbook

This runbook prepares a secure release; it does not authorize production activation. The HostyCare deployment workflow has a manual dispatch, a disabled-by-default repository variable, and a protected GitHub Environment. Do not enable that variable or approve the Environment until every prerequisite below is confirmed.

## Verified repository state

- Branch: `feature/50-palettes-v2`.
- Source commit: `3df5b88372cbc8b92833f9588cd2d0a4711d12e8`.
- GitHub Actions `production-build.yml` succeeded for that exact commit (run `45236977850`).
- CI builds on Ubuntu with Node.js 22 and Next.js standalone output. The build-only dummy `DATABASE_URL` is scoped to the build step and is never copied into the release as runtime configuration.
- The branch has no tracked modifications, but the local checkout has hundreds of untracked items, mostly old snapshots/backups. They are not included in the CI checkout or release artifact. Do not run broad Git clean/add commands.
- The current MySQL Prisma chain has 34 directories and a known ordering defect: `20261117082146_add_razorpay_payment_fields` alters `Order` before `20261117133000_add_orders` creates it. The fresh-install baseline is the safe path for a new empty production schema. Do not run the historical chain from empty and do not run `migrate reset`.
- Prisma validation passes and a schema diff between `prisma/fresh-install/baseline.prisma` and `prisma/schema.prisma` reports no difference.

## HostyCare capability boundary

HostyCare's public hosting page advertises cPanel, Node.js, SSH/Git, MySQL/MariaDB and SSL. That does not confirm this account's Node application type, incoming SSH reachability, filesystem permissions, process manager, or persistent storage. The cPanel Node.js setup tool can use Passenger and a `tmp/restart.txt` marker, but confirm the actual account before relying on it. See [HostyCare hosting](https://www.hostycare.com/hosting/), [cPanel Node.js deployment docs](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/), and [cPanel restart instructions](https://support.cpanel.net/hc/en-us/articles/1500002443862-How-to-restart-an-application-that-s-using-cPanel-s-Application-Manager).

In this workspace, SSH hostname lookup failed for the supplied server name, and the GitHub CLI credentials are invalid. No server or GitHub mutation was attempted. The workflow is prepared but cannot be pushed or tested against HostyCare until access is repaired.

## Release contents and deployment flow

`production-build.yml` builds on Ubuntu 24.04 / Node 22, runs TypeScript and packager checks, then creates a seven-day GitHub artifact. The packager allowlists only the standalone server, Next server/static output, tracked public assets, generated Prisma client, current schema, 34 migrations, fresh-install baseline, and cPanel runtime helpers. It does not copy `.env`, `.git`, untracked `public/uploads`, backups, logs, tests, or the rest of the checkout. The archive is checksummed and contains its source SHA.

`hostycare-deploy.yml` can only run by manual dispatch on `feature/50-palettes-v2`. It verifies the source run and immutable SHA, checks the archive checksum/path contents, requires the `hostycare-production` Environment approval, and stays disabled unless `HOSTYCARE_DEPLOY_ENABLED=true` is configured. It uses SSH with a pinned host key; it never runs `ssh-keyscan` and does not put app/database/payment/email secrets in GitHub. The remote script stages a new release, verifies Node 22, checks migration history, writes a private MySQL dump, then atomically swaps `current` and requests a Passenger restart. It refuses to activate without an existing known-good `current` release and a server-side `DEPLOYMENT_READY` marker. A failed health or route check requests a rollback.

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

## Fresh production database initialization

No production database is currently configured. Do not point the app at the build placeholder. In cPanel MySQL Databases, create a new schema and a dedicated application user with privileges on that schema only. Set `DEPLOY_DATABASE_NAME` to the exact cPanel-prefixed schema name and ensure it matches the database component of `DATABASE_URL`.

Before initialization, use cPanel's database interface to verify the selected schema has zero tables and views. If it is not empty, stop and take a separate backup/review; do not apply the baseline. For the confirmed empty schema only:

1. Apply `prisma/fresh-install/baseline.sql` once. It creates the current schema and does not include customer/product/order data.
2. Run `prisma migrate resolve --applied <migration-directory-name>` once for each of the 34 directories under `prisma/migrations`.
3. Run `prisma migrate status` and verify the current schema against `prisma/schema.prisma`.
4. Never run `migrate deploy` against this fresh schema before the baseline/resolution sequence; the historical order is broken. For later releases, the workflow refuses activation if the release's migration set and database history differ. Apply any new forward migration only after isolated validation, backup, and explicit owner approval.

The supplied `baseline.sql` is the safe initialization file. Preserve it and the historical migrations unchanged. An empty baseline contains no products, categories, admin user, or customer/order data. Import only the approved Kalamkari catalog, and create the first admin through a separately reviewed account-creation procedure. Do not copy customer/order/payment data from a different site or database.

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
4. Create the production DB and run the guarded fresh-baseline procedure; prepare catalog and first admin through approved routes.
5. Configure server-side secrets, email delivery, media directories, HTTPS, and the server-side readiness marker.
6. Run the protected manual deployment workflow only after the owner approves production activation. Verify homepage, product/category pages, admin/customer login, cart/checkout, upload, email, SSL, responsive layouts, themes, and payment/webhook readiness manually. Do not make a real payment as a deployment test.
