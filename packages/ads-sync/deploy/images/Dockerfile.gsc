# Google Search Console source image for Ads Sync.
# Build: see build-images.sh (one command builds and optionally pushes all images).
FROM airbyte/source-google-search-console:2.1.9@sha256:3ee78d227a25ec01a31b9f131b1b8d80afd6e3aaf0c0c2f1b09c7973190465b3

# GSC_AUTH_MODE selects the manifest authenticator:
#   refresh_token (default) keeps the upstream OAuth refresh-token flow. This
#     is the single-tenant mode: the operator owns the refresh token.
#   access_token applies the exact-match manifest patch so the connector
#     consumes only a short-lived bearer token (friction #17). The build fails
#     when the pinned manifest text drifts.
ARG GSC_AUTH_MODE=refresh_token

USER root
WORKDIR /airbyte/integration_code

COPY airbyte-source-server.py /app/airbyte-source-server.py
COPY patch-gsc-manifest-auth.py /app/patch-gsc-manifest-auth.py

RUN case "$GSC_AUTH_MODE" in \
      refresh_token) echo "GSC_AUTH_MODE=refresh_token: upstream manifest kept" ;; \
      access_token) python /app/patch-gsc-manifest-auth.py /airbyte/integration_code/manifest.yaml ;; \
      *) echo "GSC_AUTH_MODE must be refresh_token or access_token" >&2; exit 1 ;; \
    esac

ENV AIRBYTE_CONNECTOR_COMMAND="python /airbyte/integration_code/main.py"
ENV AIRBYTE_CONNECTOR_IMAGE="airbyte/source-google-search-console:2.1.9@sha256:3ee78d227a25ec01a31b9f131b1b8d80afd6e3aaf0c0c2f1b09c7973190465b3"
ENV AIRBYTE_CONNECTOR_SERVICE="airbyte-google-search-console-source"
ENV AIRBYTE_IMAGE_BUILD_OPTIONS="gsc_auth_mode=$GSC_AUTH_MODE"

EXPOSE 8080
ENTRYPOINT ["python", "/app/airbyte-source-server.py"]
