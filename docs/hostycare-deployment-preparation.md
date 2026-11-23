# HostyCare deployment preparation

This checklist accompanies the release implementation in
[`hostycare-production-runbook.md`](./hostycare-production-runbook.md). The
GitHub Actions release workflow is manual and disabled by default; it is not
verified against the HostyCare account and must not be enabled until the
remaining hosting and production prerequisites are confirmed.

## HostyCare confirmations required

- Node.js 22.x for a persistent Next.js 16 Node server, and the configured
  interpreter path.
- SSH reachability, port, deploy user, host-key fingerprint, symlink support,
  the application root, and the documented restart/process-manager behavior.
- Whether the cPanel Node application can run from the `current` symlink and
  use the bundled `start-cpanel.js` startup file.
- Reverse-proxy and HTTPS routing for the domain and `/api/health`.
- MySQL/MariaDB version, private or outbound connectivity, available CLI tools,
  schema-scoped credentials, and backup/restore facilities.
- A writable persistent media location outside release directories and its
  retention/backup policy.

Do not infer these capabilities from generic shared-hosting SSH access. The
workflow intentionally uses a pinned SSH host key and refuses deployment until
the exact connection metadata, protected Environment, readiness marker,
database migration history, and rollback release are in place.

## Persistent media layout

Set `MEDIA_STORAGE_DIR` to an absolute location outside every release and
outside the public web root. The application requires these subdirectories:

```text
$MEDIA_STORAGE_DIR/
  products/
  categories/
  hero-videos/
  story-videos/
```

After HostyCare confirms the path, create directories as the cPanel application
user without removing or replacing existing files. Example for the supplied
account (confirm this path with HostyCare first):

```sh
MEDIA_ROOT=/home/srikalah/srikalahasti-media
mkdir -p "$MEDIA_ROOT"/{products,categories,hero-videos,story-videos}
chmod 750 "$MEDIA_ROOT" "$MEDIA_ROOT"/{products,categories,hero-videos,story-videos}
test -w "$MEDIA_ROOT" && test -w "$MEDIA_ROOT/products" \
  && test -w "$MEDIA_ROOT/categories" && test -w "$MEDIA_ROOT/hero-videos" \
  && test -w "$MEDIA_ROOT/story-videos"
```

Set that path in the private server-side environment file and back up media
independently. Do not include local `public/uploads/` or mounted media in Git.

## Release safety

The build runs on GitHub's Ubuntu runner and packages a strict allowlist from
standalone output. Application/database/payment/email secrets remain on the
server. The remote release script stages by commit SHA, checks migration
history, creates a private database backup, swaps `current` atomically, and
requests the documented Passenger restart marker. It does not run migrations,
seed data, call Razorpay, or enable refunds. It requires a known-good rollback
release and refuses first activation until one exists.

See the runbook for the fresh-schema baseline procedure, GitHub settings,
environment requirements, and owner actions. No production deployment, DNS
change, database initialization, or payment activation is authorized by these
preparation files.
