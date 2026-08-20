"""Shared HTTP wrapper for Airbyte connector containers.

Every Ads Sync connector Dockerfile COPYs this file and configures it with:

- AIRBYTE_CONNECTOR_COMMAND: connector entrypoint (for example "/entrypoint.sh")
- AIRBYTE_CONNECTOR_IMAGE: pinned connector image reference
- AIRBYTE_CONNECTOR_SERVICE: service name reported by /metadata
- AIRBYTE_READ_TIMEOUT_SECONDS: optional /read wall-clock budget (default 1860,
  minimum 60: the 30-second inner margin plus a 30-second connector floor)
- AIRBYTE_WRITE_TIMEOUT_SECONDS: optional /write wall-clock budget (default 1260,
  minimum 90: the 60-second inner margin plus the 30-second floor)
- AIRBYTE_IMAGE_BUILD_OPTIONS: optional build-time option summary reported by
  /metadata as "buildOptions"
- AIRBYTE_JAVA_TRUST_STORE: optional JKS trust store path that /network-check
  verifies (destination image only)
- AIRBYTE_NETWORK_CHECK_PORTS: optional comma-separated allowlist of ports for
  /network-check (default "5432")
- AIRBYTE_WRAPPER_PORT: optional listen port (default 8080)

The wrapper listens on all interfaces with no authentication on any route.
Under Cloudflare Containers the port is reachable only through the Durable
Object binding; that network isolation is the only access control. Never
expose the port on a host or a shared network.

Source containers use /spec, /check, /discover, /read, and /read-artifact.
The destination container uses /check, /write, and /network-check. Unsupported
commands fail inside the connector process, not in this wrapper.

The HTTP contract is documented in the Ads Sync docs under
reference/connector-image-http-contract. Bump WRAPPER_VERSION when the
contract changes; consumers pin it through /metadata exact match.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import shlex
import socket
import subprocess
import tempfile

CONNECTOR_COMMAND = shlex.split(os.environ["AIRBYTE_CONNECTOR_COMMAND"])
CONNECTOR_IMAGE = os.environ["AIRBYTE_CONNECTOR_IMAGE"]
CONNECTOR_SERVICE = os.environ["AIRBYTE_CONNECTOR_SERVICE"]
READ_TIMEOUT_SECONDS = int(os.environ.get("AIRBYTE_READ_TIMEOUT_SECONDS", "1860"))
WRITE_TIMEOUT_SECONDS = int(os.environ.get("AIRBYTE_WRITE_TIMEOUT_SECONDS", "1260"))
IMAGE_BUILD_OPTIONS = os.environ.get("AIRBYTE_IMAGE_BUILD_OPTIONS", "")
JAVA_TRUST_STORE = os.environ.get("AIRBYTE_JAVA_TRUST_STORE", "")
NETWORK_CHECK_PORTS = {
    int(port)
    for port in os.environ.get("AIRBYTE_NETWORK_CHECK_PORTS", "5432").split(",")
    if port.strip()
}
NETWORK_CHECK_TIMEOUT_SECONDS = 10
# The connector process always gets at least this many seconds inside the
# outer HTTP budget. A budget too small for the margin plus this floor is a
# deployment error; the wrapper reports it instead of running an opaque
# `/usr/bin/timeout` with a zero or negative duration.
MIN_INNER_TIMEOUT_SECONDS = 30
WRAPPER_VERSION = "ads-sync-wrapper-v0.3"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/health", "/metadata"):
            self.respond_json({
                "buildOptions": IMAGE_BUILD_OPTIONS,
                "connectorImage": CONNECTOR_IMAGE,
                "service": CONNECTOR_SERVICE,
                "status": "ok",
                "wrapperVersion": WRAPPER_VERSION,
            })
            return
        if self.path == "/spec":
            self.run_airbyte(["spec"], 60)
            return
        self.respond_json({"error": "Not found"}, 404)

    def do_POST(self):
        if self.path in ("/check", "/discover"):
            config = self.read_json_object()
            if config is None:
                return
            config_path = self.write_json(config)
            try:
                self.run_airbyte([self.path[1:], "--config", config_path], 210)
            finally:
                os.unlink(config_path)
            return
        if self.path in ("/read", "/read-artifact"):
            self.run_read(include_output=self.path == "/read-artifact")
            return
        if self.path == "/write":
            self.run_write()
            return
        if self.path == "/network-check":
            self.run_network_check()
            return
        self.respond_json({"error": "Not found"}, 404)

    def log_message(self, _format, *_args):
        return

    def run_read(self, include_output):
        payload = self.read_json_object()
        if payload is None:
            return
        config = payload.get("config")
        catalog = payload.get("catalog")
        state = payload.get("state")
        if not isinstance(config, dict) or not isinstance(catalog, dict):
            self.respond_json(
                {"error": "Request body must include config and catalog objects"},
                400,
            )
            return

        # The config file holds the credential. Enter the cleanup block before
        # the first write so a failed later write can never leave it behind.
        paths = []
        try:
            paths.append(self.write_json(config))
            paths.append(self.write_json(catalog))
            args = ["read", "--config", paths[0], "--catalog", paths[1]]
            if state is not None:
                paths.append(self.write_json(state))
                args.extend(["--state", paths[2]])
            self.run_airbyte(args, READ_TIMEOUT_SECONDS, include_output)
        finally:
            self.unlink_all(paths)

    def run_write(self):
        payload = self.read_json_object()
        if payload is None:
            return
        config = payload.get("config")
        catalog = payload.get("catalog")
        messages = payload.get("messages")
        include_output = payload.get("include_output") is True
        if not isinstance(config, dict) or not isinstance(catalog, dict):
            self.respond_json(
                {"error": "Request body must include config and catalog objects"},
                400,
            )
            return
        if not isinstance(messages, str):
            self.respond_json(
                {"error": "Request body must include messages string"},
                400,
            )
            return

        paths = []
        try:
            paths.append(self.write_json(config))
            paths.append(self.write_json(catalog))
            args = ["write", "--config", paths[0], "--catalog", paths[1]]
            self.run_airbyte(
                args,
                WRITE_TIMEOUT_SECONDS,
                include_output,
                inner_margin_seconds=60,
                stdin_text=messages,
            )
        finally:
            self.unlink_all(paths)

    def run_network_check(self):
        payload = self.read_json_object()
        if payload is None:
            return
        host = payload.get("host")
        port = payload.get("port")
        if not isinstance(host, str) or not host or any(c.isspace() for c in host):
            self.respond_json({"error": "host must be a non-empty hostname"}, 400)
            return
        if not isinstance(port, int) or port not in NETWORK_CHECK_PORTS:
            self.respond_json(
                {"error": "port is not in the AIRBYTE_NETWORK_CHECK_PORTS allowlist"},
                400,
            )
            return
        try:
            with socket.create_connection((host, port), timeout=NETWORK_CHECK_TIMEOUT_SECONDS):
                pass
        except Exception as error:
            self.respond_json(
                {"connected": False, "errorType": type(error).__name__},
                502,
            )
            return
        self.respond_json({"connected": True, "trustStore": self.trust_store_status()})

    def trust_store_status(self):
        if not JAVA_TRUST_STORE:
            return None
        readable = os.path.isfile(JAVA_TRUST_STORE) and os.access(JAVA_TRUST_STORE, os.R_OK)
        keytool_readable = False
        if readable:
            try:
                keytool = subprocess.run(
                    ["keytool", "-list", "-keystore", JAVA_TRUST_STORE, "-storepass", "changeit"],
                    capture_output=True,
                    check=False,
                    timeout=NETWORK_CHECK_TIMEOUT_SECONDS,
                )
                keytool_readable = keytool.returncode == 0
            except Exception:
                keytool_readable = False
        return {
            "destinationOptionsPresent": "javax.net.ssl.trustStore="
            in os.environ.get("DESTINATION_POSTGRES_OPTS", ""),
            "keytoolReadable": keytool_readable,
            "path": JAVA_TRUST_STORE,
            "readable": readable,
        }

    def run_airbyte(
        self,
        args,
        timeout_seconds,
        include_output=False,
        inner_margin_seconds=30,
        stdin_text=None,
    ):
        redacted_args = ["<config>" if arg.endswith(".json") else arg for arg in args]
        inner_timeout_seconds = timeout_seconds - inner_margin_seconds
        if inner_timeout_seconds < MIN_INNER_TIMEOUT_SECONDS:
            self.respond_json(
                {
                    "args": redacted_args,
                    "error": "Connector timeout budget is too small",
                    "minimumTimeoutSeconds": inner_margin_seconds + MIN_INNER_TIMEOUT_SECONDS,
                    "timeoutSeconds": timeout_seconds,
                },
                500,
            )
            return
        inner_timeout = str(inner_timeout_seconds)
        try:
            result = subprocess.run(
                ["/usr/bin/timeout", inner_timeout, *CONNECTOR_COMMAND, *args],
                capture_output=True,
                check=False,
                input=stdin_text,
                text=True,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired:
            self.respond_json({"args": redacted_args, "error": "Connector timed out"}, 504)
            return
        body = {
            "args": redacted_args,
            "exitCode": result.returncode,
            "stderrLength": len(result.stderr),
            "stdoutLength": len(result.stdout),
            "success": result.returncode == 0,
        }
        if include_output:
            body["stderr"] = result.stderr
            body["stdout"] = result.stdout
        self.respond_json(body, 200 if result.returncode == 0 else 502)

    def read_json_object(self):
        length = int(self.headers.get("content-length", "0"))
        if length <= 0:
            self.respond_json({"error": "Request body is required"}, 400)
            return None
        try:
            value = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self.respond_json({"error": "Request body must be JSON"}, 400)
            return None
        if not isinstance(value, dict):
            self.respond_json({"error": "Request body must be a JSON object"}, 400)
            return None
        return value

    def write_json(self, value):
        handle = tempfile.NamedTemporaryFile(delete=False, mode="w", suffix=".json")
        try:
            with handle:
                json.dump(value, handle)
        except BaseException:
            self.unlink_all([handle.name])
            raise
        return handle.name

    @staticmethod
    def unlink_all(paths):
        for path in paths:
            try:
                os.unlink(path)
            except FileNotFoundError:
                pass

    def respond_json(self, body, status=200):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    ThreadingHTTPServer(
        ("0.0.0.0", int(os.environ.get("AIRBYTE_WRAPPER_PORT", "8080"))), Handler
    ).serve_forever()
