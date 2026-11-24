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

verified_release_dir() {
  local target="$1"
  [[ "$target" == "$APP_ROOT"/* && -d "$target" ]] || return 1
  local relative="${target#"$APP_ROOT"/}"
  case "$relative" in
    shared|shared/*|incoming|incoming/*|current|previous|releases) return 1 ;;
  esac
  [[ -f "$target/server.js" && -f "$target/start-cpanel.js" && -d "$target/.next/server" && -d "$target/node_modules" && -f "$target/prisma/schema.prisma" ]] || return 1
  if [[ -f "$target/RELEASE_SHA" ]]; then
    local recorded_sha
    recorded_sha=$(cat "$target/RELEASE_SHA")
    [[ "$recorded_sha" =~ ^[a-f0-9]{40}$ ]] || return 1
    if [[ "$relative" == releases/* ]]; then
      [[ "${relative#releases/}" == "$recorded_sha" ]] || return 1
    fi
  fi
  return 0
}

case "$MODE" in
  prepare)
    mkdir -p "$RELEASES" "$INCOMING"
    ARCHIVE="$INCOMING/srikalahasti-release-$SHA.tar.gz"
    CHECKSUM="$ARCHIVE.sha256"
    [[ -f "$ARCHIVE" && -f "$CHECKSUM" ]] || fail "uploaded package or checksum is missing"
    (cd "$INCOMING" && sha256sum -c "$(basename "$CHECKSUM")" >/dev/null) || fail "uploaded release checksum did not verify"
    [[ ! -e "$RELEASE" ]] || fail "release already exists; refusing to overwrite it"

    tar -tzf "$ARCHIVE" | while IFS= read -r entry; do
      case "$entry" in
        /*|../*|*/../*|*/..|..|./../*) exit 1 ;;
      esac
    done || fail "release archive is unreadable or contains an unsafe path"

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
    verified_release_dir "$CURRENT_TARGET" || fail "current does not point to a verified application release under the confirmed application root"
    NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)
    [[ "$NODE_MAJOR" == "22" ]] || fail "the cPanel shell does not select the configured Node.js 22 runtime"
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
    ln -s "$CURRENT_TARGET" "$TEMP_PREVIOUS"
    mv -Tf "$TEMP_PREVIOUS" "$PREVIOUS"
    ln -s "$RELEASE" "$TEMP_CURRENT"
    mv -Tf "$TEMP_CURRENT" "$CURRENT"
    mkdir -p "$CURRENT/tmp"
    touch "$CURRENT/tmp/restart.txt"
    printf '%s\n' "Release activated: $SHA"
    ;;

  rollback)
    [[ -L "$PREVIOUS" ]] || fail "no previous release is available for rollback"
    PREVIOUS_TARGET=$(realpath "$PREVIOUS")
    verified_release_dir "$PREVIOUS_TARGET" || fail "previous target is not a verified application release under the confirmed application root"
    TEMP_CURRENT="$APP_ROOT/.current-rollback-$SHA-$$"
    ln -s "$PREVIOUS_TARGET" "$TEMP_CURRENT"
    mv -Tf "$TEMP_CURRENT" "$CURRENT"
    mkdir -p "$CURRENT/tmp"
    touch "$CURRENT/tmp/restart.txt"
    printf '%s\n' "Previous release restored."
    ;;

  *)
    fail "operation must be prepare, activate, or rollback"
    ;;
esac
