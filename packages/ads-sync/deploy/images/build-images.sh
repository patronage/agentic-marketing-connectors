#!/usr/bin/env bash
# Build every Ads Sync connector image from this directory.
#
# Usage:
#   IMAGE_REGISTRY=registry.example.com/ads-sync bash build-images.sh          # build + load locally
#   IMAGE_REGISTRY=registry.example.com/ads-sync bash build-images.sh --push   # build + push to your registry
#
# Environment:
#   IMAGE_REGISTRY   required; repository prefix in the consumer's own registry
#   IMAGE_TAG        optional; default "0.3.0"
#   IMAGE_PLATFORM   optional; default "linux/amd64" (Cloudflare Containers)
#   GSC_AUTH_MODE    optional; refresh_token (default) or access_token
#   POSTGRES_SCHEMA_MODE optional; airbyte_owned (default) or preprovisioned
#   IMAGES           optional; space-separated subset of: google-ads gsc meta postgres
#
# Nothing in this repository publishes a built image. The consumer runs this
# script and pushes into a registry they own.
set -euo pipefail

cd "$(dirname "$0")"

: "${IMAGE_REGISTRY:?IMAGE_REGISTRY is required (example: registry.example.com/ads-sync)}"
IMAGE_TAG="${IMAGE_TAG:-0.3.0}"
IMAGE_PLATFORM="${IMAGE_PLATFORM:-linux/amd64}"
GSC_AUTH_MODE="${GSC_AUTH_MODE:-refresh_token}"
POSTGRES_SCHEMA_MODE="${POSTGRES_SCHEMA_MODE:-airbyte_owned}"
IMAGES="${IMAGES:-google-ads gsc meta postgres}"

output_flag="--load"
if [ "${1:-}" = "--push" ]; then
  output_flag="--push"
elif [ -n "${1:-}" ]; then
  echo "unknown argument: $1 (only --push is accepted)" >&2
  exit 2
fi

dockerfile_for() {
  case "$1" in
    google-ads) echo "Dockerfile" ;;
    gsc) echo "Dockerfile.gsc" ;;
    meta) echo "Dockerfile.meta" ;;
    postgres) echo "Dockerfile.postgres" ;;
    *) echo "unknown image: $1" >&2; exit 2 ;;
  esac
}

for image in $IMAGES; do
  dockerfile="$(dockerfile_for "$image")"
  tag="${IMAGE_REGISTRY}/ads-sync-${image}:${IMAGE_TAG}"
  echo "==> building ${tag} from ${dockerfile} (${IMAGE_PLATFORM})"
  docker buildx build \
    --platform "$IMAGE_PLATFORM" \
    --file "$dockerfile" \
    --build-arg "GSC_AUTH_MODE=${GSC_AUTH_MODE}" \
    --build-arg "POSTGRES_SCHEMA_MODE=${POSTGRES_SCHEMA_MODE}" \
    --tag "$tag" \
    "$output_flag" \
    .
done

echo "==> base image digests pinned in this directory"
grep -h '^FROM ' Dockerfile Dockerfile.gsc Dockerfile.meta Dockerfile.postgres
