# HostyCare media cleanup cron setup

This configures the bounded media cleanup worker through the app's authenticated
`POST /api/cron/media-cleanup` endpoint. It does not run database migrations,
change payment settings, or touch media outside the app's configured storage.
Apply these steps only after an authorized release is running and HostyCare has
confirmed the account's cron feature and outbound HTTPS access.

## Confirm account support

HostyCare publicly advertises cPanel hosting, but that does not prove that this
specific account exposes cPanel Cron Jobs or permits outbound HTTPS from cron.
Check cPanel **Advanced → Cron Jobs** or ask HostyCare support to enable/confirm
it. Confirm that the site has working HTTPS and that the scheduled shell runs as
the same cPanel user that owns the app. cPanel documents that the host can
disable the Cron Jobs feature. See [HostyCare hosting](https://www.hostycare.com/hosting/)
and [cPanel Cron Jobs](https://docs.cpanel.net/cpanel/advanced/cron-jobs/).

## Configure the shared secret

Generate a unique secret with at least 32 characters on a trusted workstation or
in the account's private terminal:

```sh
openssl rand -hex 32
```

Set `MEDIA_CLEANUP_CRON_SECRET` to that exact 64-character value in the
production Node.js application's environment settings. Restart the app using
the account's documented process manager so the new environment is loaded.
Do not put the secret in Git, a URL, a public directory, or a cron command line.

Create a private curl config file outside the web root. Replace the placeholder
with the generated secret, preserving the quotes:

```sh
mkdir -p "$HOME/.config/srikalahasti"
chmod 700 "$HOME/.config" "$HOME/.config/srikalahasti"
cat > "$HOME/.config/srikalahasti/media-cleanup-curl.conf" <<'EOF'
header = "Authorization: Bearer REPLACE_WITH_GENERATED_SECRET"
EOF
chmod 600 "$HOME/.config/srikalahasti/media-cleanup-curl.conf"
```

Keep the raw value in the Node app setting and the `Authorization: Bearer ...`
form only in this mode-600 file. Do not print the file or commit it.

## Install the cron helper

Find the account's curl path with `command -v curl`. Use that absolute path in
the script below if it is not `/usr/bin/curl`. Replace `YOUR_DOMAIN` with the
site's canonical HTTPS hostname. The app route processes a bounded batch, so a
five-minute interval leaves ample time between invocations.

```sh
mkdir -p "$HOME/bin"
cat > "$HOME/bin/srikalahasti-media-cleanup-cron.sh" <<'EOF'
#!/bin/sh
set -eu
exec /usr/bin/curl \
  --config "$HOME/.config/srikalahasti/media-cleanup-curl.conf" \
  --fail --silent --show-error --max-time 20 \
  --request POST \
  "https://YOUR_DOMAIN/api/cron/media-cleanup" \
  --output /dev/null
EOF
chmod 700 "$HOME/bin/srikalahasti-media-cleanup-cron.sh"
```

Run the helper once manually. A successful request returns HTTP 200; an absent
or incorrect secret returns HTTP 401. Keep curl errors visible so cPanel cron
mail can report failures. Do not test by sending any payment request.

## Add the cPanel schedule

In cPanel **Advanced → Cron Jobs**, set:

| Field | Value |
| --- | --- |
| Minute | `*/5` |
| Hour | `*` |
| Day | `*` |
| Month | `*` |
| Weekday | `*` |
| Command | `/home/CPANEL_USER/bin/srikalahasti-media-cleanup-cron.sh` |

Replace `CPANEL_USER` with the account's actual home directory name. Leave
cPanel's cron notification email enabled for the account or set a monitored
address in its cron interface. Verify the first scheduled run from its
timestamp/output and the admin media deletion-job status page. If the host uses
a different scheduler, ask support to install the same five-minute POST under
the app account with the secret read from the private config file.

## Operational notes

- The route requires `POST` and `Authorization: Bearer <secret>`; its secret
  must be at least 32 characters. It returns `401` when authentication fails.
- The worker claims due jobs with leases, retries transient errors with bounded
  backoff, and marks exhausted jobs dead. It refuses unsafe references and
  storage paths; inspect the admin media cleanup status/audit before manual
  intervention.
- Rotate the secret by updating both the private curl config and app environment
  to the same new value, then restart the app and verify one authorized call.
- cPanel's schedule is account-specific. The public HostyCare materials do not
  establish that this account has Cron Jobs enabled, the absolute curl path, or
  cron outbound HTTPS permission; confirm those details with HostyCare before
  enabling the schedule.
