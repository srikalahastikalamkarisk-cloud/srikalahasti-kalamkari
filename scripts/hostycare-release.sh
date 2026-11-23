#!/usr/bin/env bash
set -euo pipefail
umask 077

MODE=${1:-}
SHA=${2:-}
APP_ROOT=${3:-}
EXPECTED_APP_ROOT=/home/srikalah/srikalahasti-app

fail() {
  printf '%s\n' "HostyCare release operation stopped: $1" >&2
  exit 1
}

[[ "$APP_ROOT" == "$EXPECTED_APP_ROOT" ]] || fail "application root does not match the confirmed cPanel path"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail "release identifier is invalid"
[[ -d "$APP_ROOT" ]] || fail "application root is unavailable"

RELEASES="$APP_ROOT/releases"
INCOMING="$APP_ROOT/incoming"
SHARED="$APP_ROOT/shared"
CURRENT="$APP_ROOT/current"
PREVIOUS="$APP_ROOT/previous"
RELEASE="$RELEASES/$SHA"

case "$MODE" in
  prepare)
    mkdir -p "$RELEASES" "$INCOMING"
    ARCHIVE="$INCOMING/srikalahasti-release-$SHA.tar.gz"
    CHECKSUM="$ARCHIVE.sha256"
    [[ -f "$ARCHIVE" && -f "$CHECKSUM" ]] || fail "uploaded package or checksum is missing"
    (cd "$INCOMING" && sha256sum -c "$(basename "$CHECKSUM")" >/dev/null) || fail "uploaded release checksum did not verify"
    [[ ! -e "$RELEASE" ]] || fail "release already exists; refusing to overwrite it"

    while IFS= read -r entry; do
      case "$entry" in
        /*|../*|*/../*|*/..|..|./../*) fail "release archive contains an unsafe path" ;;
      esac
    done < <(tar -tzf "$ARCHIVE")

    STAGING=$(mktemp -d "$RELEASES/.staging-$SHA.XXXXXX")
    trap 'if [[ -n "${STAGING:-}" && -d "$STAGING" ]]; then rm -rf -- "$STAGING"; fi' EXIT
    tar --no-same-owner --no-same-permissions -xzf "$ARCHIVE" -C "$STAGING"
    [[ "$(cat "$STAGING/RELEASE_SHA" 2>/dev/null || true)" == "$SHA" ]] || fail "release metadata does not match the requested commit"
    [[ -f "$STAGING/server.js" && -f "$STAGING/start-cpanel.js" && -d "$STAGING/.next/server" && -d "$STAGING/node_modules" && -f "$STAGING/prisma/schema.prisma" ]] || fail "release package is incomplete"
    mkdir -p "$STAGING/tmp"
    chmod 0750 "$STAGING/tmp"
    mv -- "$STAGING" "$RELEASE"
    STAGING=
    trap - EXIT
    rm -- "$ARCHIVE" "$CHECKSUM"
    printf '%s\n' "Release staged: $SHA"
    ;;

  activate)
    [[ -f "$SHARED/DEPLOYMENT_READY" ]] || fail "owner readiness marker is missing; finish database, environment, storage, and cPanel setup first"
    [[ -L "$CURRENT" ]] || fail "current must already point to a known-good rollback release"
    [[ -d "$RELEASE" ]] || fail "staged release is missing"
    CURRENT_TARGET=$(realpath "$CURRENT")
    [[ "$CURRENT_TARGET" == "$RELEASES"/* && -d "$CURRENT_TARGET" ]] || fail "current does not point to a release directory"
    NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)
    [[ "$NODE_MAJOR" == "22" ]] || fail "the SSH shell does not select the configured Node.js 22 runtime"
    ENV_FILE="$SHARED/production.env"
    ENV_MODE=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || true)
    [[ -f "$ENV_FILE" && "$ENV_MODE" == "600" ]] || fail "server-side production.env must exist with mode 0600"
    mkdir -p "$SHARED/db-backups"
    chmod 0700 "$SHARED/db-backups"
    (
      cd "$RELEASE"
      node ./hostycare-preflight.mjs "$ENV_FILE" "$SHARED/db-backups" "$SHA"
    ) || fail "database, migration, media, or backup preflight failed; release was not activated"

    TEMP_PREVIOUS="$APP_ROOT/.previous-$SHA-$$"
    TEMP_CURRENT="$APP_ROOT/.current-$SHA-$$"
    ln -s "releases/$(basename "$CURRENT_TARGET")" "$TEMP_PREVIOUS"
    mv -Tf "$TEMP_PREVIOUS" "$PREVIOUS"
    ln -s "releases/$SHA" "$TEMP_CURRENT"
    mv -Tf "$TEMP_CURRENT" "$CURRENT"
    touch "$CURRENT/tmp/restart.txt"
    printf '%s\n' "Release activated: $SHA"
    ;;

  rollback)
    [[ -L "$PREVIOUS" ]] || fail "no previous release is available for rollback"
    PREVIOUS_TARGET=$(realpath "$PREVIOUS")
    [[ "$PREVIOUS_TARGET" == "$RELEASES"/* && -d "$PREVIOUS_TARGET" ]] || fail "previous release target is invalid"
    TEMP_CURRENT="$APP_ROOT/.current-rollback-$SHA-$$"
    ln -s "releases/$(basename "$PREVIOUS_TARGET")" "$TEMP_CURRENT"
    mv -Tf "$TEMP_CURRENT" "$CURRENT"
    touch "$CURRENT/tmp/restart.txt"
    printf '%s\n' "Previous release restored."
    ;;

  *)
    fail "operation must be prepare, activate, or rollback"
    ;;
esac
