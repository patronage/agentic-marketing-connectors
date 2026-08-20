#!/bin/sh
# Exact-match build step: pin a readable JKS trust store for the destination.
#
# The pinned airbyte/destination-postgres 3.0.13 image fails its default JVM
# trust-store lookup inside Cloudflare Containers
# (KeyManagementException: problem accessing trust store). This copies the
# image's own CA bundle to a fixed, non-symlinked, world-readable path. TLS
# verification is not lowered; verify-full stays fail-closed.
#
# Usage: sh pin-postgres-java-cacerts.sh [<source cacerts>] [<target path>]
#
# The script exits non-zero, and so fails the image build, when the source
# trust store is missing or is not a valid JKS keystore.
set -eu

source_store="${1:-/etc/pki/ca-trust/extracted/java/cacerts}"
target_store="${2:-/app/java-cacerts}"

if [ ! -f "$source_store" ]; then
  echo "pin-postgres-java-cacerts: $source_store missing; upstream image drifted" >&2
  exit 1
fi

cp -L "$source_store" "$target_store"
chmod 0444 "$target_store"

if ! keytool -list -keystore "$target_store" -storepass changeit >/dev/null 2>&1; then
  echo "pin-postgres-java-cacerts: $target_store is not a readable JKS keystore" >&2
  exit 1
fi

echo "pin-postgres-java-cacerts: pinned $target_store"
