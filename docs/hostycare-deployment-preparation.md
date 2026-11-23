# HostyCare deployment preparation

This is a release architecture and preflight checklist, not a deployable workflow. HostyCare account access and server capabilities have not been verified, so no workflow is enabled and no SSH or hosting secrets are requested here.

## Required hosting confirmations

Before creating a runnable GitHub Actions workflow, confirm in the HostyCare account or with support:

- Node.js 22.x is supported for a persistent Next.js 16 Node server, and whether the build runs in CI or on the server.
- SSH access, port, deployment user, application root, server host-key fingerprint, and whether the user can create symlinks and restart a user-owned service.
- A persistent process option (systemd user service, PM2, or HostyCare's documented Node process manager) and its restart/logging behavior.
- Reverse-proxy support for the Next.js process, TLS certificate provisioning/renewal, canonical domain, and health-check URL.
- Outbound or private-network MySQL access, TLS requirements, backup/restore facilities, and an account restricted to the application schema.
- A persistent writable media mount outside release directories, capacity/backup policy, and whether it is mounted before application startup.
- Whether server-side builds have the required native/runtime libraries and how secrets are injected into the process environment.

Do not infer these capabilities from generic shared-hosting SSH access.

## Persistent media layout

Set an absolute `MEDIA_STORAGE_DIR` outside every versioned release. The application creates and checks these subdirectories before media operations:

```text
$MEDIA_STORAGE_DIR/
  products/
  categories/
  hero-videos/
  story-videos/
```

Prepare it on the server as the deployment/service owner (replace placeholders after HostyCare confirms the actual paths and account):

```sh
sudo install -d -o APP_USER -g APP_GROUP -m 0750 /persistent/path/srikalahasti-media
for area in products categories hero-videos story-videos; do
  sudo install -d -o APP_USER -g APP_GROUP -m 0750 "/persistent/path/srikalahasti-media/$area"
done
sudo -u APP_USER test -w /persistent/path/srikalahasti-media
for area in products categories hero-videos story-videos; do
  sudo -u APP_USER test -w "/persistent/path/srikalahasti-media/$area"
done
```

Set `MEDIA_STORAGE_DIR=/persistent/path/srikalahasti-media` in the server-side environment. The app requires the root and child directories to be outside the release, owned/writable by the app process, and not group/world writable. Back up the media mount independently of releases. Never include `public/uploads/` or mounted media in Git.

## Release and workflow design after confirmation

Use a GitHub Actions `workflow_dispatch` workflow with a protected GitHub `production` Environment and required reviewer. Pin the SSH server host key in a GitHub secret; do not run `ssh-keyscan` during a deployment. Store only the SSH deploy key, pinned `known_hosts` entry, and non-secret connection metadata in GitHub. Keep `DATABASE_URL`, auth/email secrets, `MEDIA_STORAGE_DIR`, and payment credentials only in HostyCare's server-side environment/secret store, outside release folders.

Build an immutable artifact under a commit SHA and activate releases through an atomic `current` symlink swap. Keep shared media and database backups outside releases. Before activation, require a successful database backup, Prisma migration status preflight, artifact checks, and an explicit human approval for forward-only `prisma migrate deploy`. Never run `migrate reset`, seed, or destructive database commands. Run a bounded HTTPS health check after activation; if it fails, atomically point `current` back to the previous release and restart the service. A code rollback cannot reverse a database migration; schema changes must remain backward compatible or have a documented forward repair.

The eventual workflow must not print environment values, upload secrets with artifacts, invoke Razorpay, create charges/refunds, change DNS, or change maintenance mode. It must use the HostyCare-documented start/restart and reverse-proxy configuration; those commands are intentionally unspecified until the hosting account confirms its supported method.

## Owner actions

1. Confirm the hosting requirements above with HostyCare and provide the supported Node process/restart method and SSH details privately in the hosting/GitHub settings.
2. Create the persistent media mount and app-owned directories using HostyCare-approved paths; configure `MEDIA_STORAGE_DIR` server-side.
3. Configure production environment variables and database backups in HostyCare, not in GitHub or the repository.
4. Approve a protected production workflow only after the deployment script matches HostyCare's documented runtime and a staging deployment has been reviewed.
