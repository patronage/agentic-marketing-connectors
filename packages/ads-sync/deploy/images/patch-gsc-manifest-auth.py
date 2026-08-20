"""Exact-match patch: make the pinned GSC manifest consume an access token.

The pinned airbyte/source-google-search-console 2.1.9 spec advertises
``access_token``, but its manifest always selects refresh-token OAuth. This
patch rewrites only that authenticator block to a BearerAuthenticator that
reads ``authorization.access_token``.

Usage: python patch-gsc-manifest-auth.py <manifest.yaml>

The script exits non-zero, and so fails the image build, when the pinned
manifest text does not match exactly once. Select it with the Dockerfile.gsc
build argument ``GSC_AUTH_MODE=access_token``. The default build keeps the
upstream refresh-token flow.
"""

from pathlib import Path
import sys

REQUIRED_FIELDS_OLD = """          - client_id
          - client_secret
          - refresh_token
"""
REQUIRED_FIELDS_NEW = """          - access_token
"""
AUTHENTICATOR_OLD = """  oauth_authenticator:
    type: OAuthAuthenticator
    client_id: "{{ config.get('authorization', {}).get('client_id') }}"
    client_secret: "{{ config.get('authorization', {}).get('client_secret') }}"
    refresh_token: "{{ config.get('authorization', {}).get('refresh_token') }}"
    token_refresh_endpoint: "https://oauth2.googleapis.com/token"
"""
AUTHENTICATOR_NEW = """  oauth_authenticator:
    type: BearerAuthenticator
    api_token: "{{ config.get('authorization', {}).get('access_token') }}"
"""


def patch_manifest(manifest: str) -> str:
    """Return the patched manifest or raise SystemExit on drift."""
    if manifest.count(REQUIRED_FIELDS_OLD) != 1:
        raise SystemExit(
            "patch-gsc-manifest-auth: expected exactly one pinned OAuth "
            "required-fields block; upstream manifest drifted"
        )
    if manifest.count(AUTHENTICATOR_OLD) != 1:
        raise SystemExit(
            "patch-gsc-manifest-auth: expected exactly one pinned OAuth "
            "authenticator block; upstream manifest drifted"
        )
    return manifest.replace(REQUIRED_FIELDS_OLD, REQUIRED_FIELDS_NEW).replace(
        AUTHENTICATOR_OLD, AUTHENTICATOR_NEW
    )


def main(argv: list[str]) -> None:
    if len(argv) != 2:
        raise SystemExit("usage: patch-gsc-manifest-auth.py <manifest.yaml>")
    path = Path(argv[1])
    path.write_text(patch_manifest(path.read_text()))
    print(f"patch-gsc-manifest-auth: patched {path}")


if __name__ == "__main__":
    main(sys.argv)
