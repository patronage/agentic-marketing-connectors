# Google Ads source image for Ads Sync.
# Build: see build-images.sh (one command builds and optionally pushes all images).
FROM airbyte/source-google-ads:6.1.0@sha256:dea39deedba0a095f60159d808dfb47fa778e304846396d2ab2f04c951b480ed

USER root
WORKDIR /airbyte/integration_code

COPY airbyte-source-server.py /app/airbyte-source-server.py

ENV AIRBYTE_CONNECTOR_COMMAND="/entrypoint.sh"
ENV AIRBYTE_CONNECTOR_IMAGE="airbyte/source-google-ads:6.1.0@sha256:dea39deedba0a095f60159d808dfb47fa778e304846396d2ab2f04c951b480ed"
ENV AIRBYTE_CONNECTOR_SERVICE="airbyte-google-ads-source"
ENV AIRBYTE_READ_TIMEOUT_SECONDS="330"

EXPOSE 8080
ENTRYPOINT ["python", "/app/airbyte-source-server.py"]
