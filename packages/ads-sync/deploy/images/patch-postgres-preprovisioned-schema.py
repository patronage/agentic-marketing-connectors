"""Exact-match patch: turn the destination's CREATE SCHEMA into a no-op.

The pinned airbyte/destination-postgres 3.0.13 runs
``CREATE SCHEMA IF NOT EXISTS <schema>;`` on every write. PostgreSQL checks
database-level CREATE before it checks whether the schema exists, so a
schema-scoped writer role fails. This patch rewrites only that one string
constant inside the connector jar. Table DDL is untouched.

Usage: python3 patch-postgres-preprovisioned-schema.py [<connector.jar>]

The script exits non-zero, and so fails the image build, when the pinned
constant does not match exactly once. Select it with the Dockerfile.postgres
build argument ``POSTGRES_SCHEMA_MODE=preprovisioned``. The default build
keeps Airbyte-owned schema DDL, which is the single-tenant mode.
"""

from pathlib import Path
import struct
import sys
import tempfile
import zipfile

DEFAULT_JAR = Path(
    "/airbyte/lib/io.airbyte.airbyte-integrations.connectors-destination-postgres.jar"
)
CLASS = (
    "io/airbyte/integrations/destination/postgres/sql/"
    "PostgresDirectLoadSqlGenerator.class"
)
NEEDLE = b"CREATE SCHEMA IF NOT EXISTS \x01;"
REPLACEMENT = b"SELECT 1 /* preprovisioned \x01 */;"


def patch_class(class_bytes: bytes) -> bytes:
    """Return the patched class bytes or raise SystemExit on drift."""
    offset = class_bytes.find(NEEDLE)
    if offset < 2 or class_bytes.find(NEEDLE, offset + 1) != -1:
        raise SystemExit(
            "patch-postgres-preprovisioned-schema: pinned namespace SQL did "
            "not match exactly once; upstream connector drifted"
        )
    if class_bytes[offset - 2 : offset] != struct.pack(">H", len(NEEDLE)):
        raise SystemExit(
            "patch-postgres-preprovisioned-schema: pinned namespace SQL "
            "constant length mismatch; upstream connector drifted"
        )
    return (
        class_bytes[: offset - 2]
        + struct.pack(">H", len(REPLACEMENT))
        + REPLACEMENT
        + class_bytes[offset + len(NEEDLE) :]
    )


def patch_jar(jar: Path) -> None:
    with zipfile.ZipFile(jar, "r") as source:
        if CLASS not in source.namelist():
            raise SystemExit(
                f"patch-postgres-preprovisioned-schema: {CLASS} missing from "
                "jar; upstream connector drifted"
            )
        patched_class = patch_class(source.read(CLASS))
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jar") as handle:
            replacement_jar = Path(handle.name)
        with zipfile.ZipFile(replacement_jar, "w") as target:
            for entry in source.infolist():
                target.writestr(
                    entry,
                    patched_class
                    if entry.filename == CLASS
                    else source.read(entry.filename),
                )
    replacement_jar.replace(jar)


def main(argv: list[str]) -> None:
    if len(argv) > 2:
        raise SystemExit(
            "usage: patch-postgres-preprovisioned-schema.py [<connector.jar>]"
        )
    jar = Path(argv[1]) if len(argv) == 2 else DEFAULT_JAR
    patch_jar(jar)
    print(f"patch-postgres-preprovisioned-schema: patched {jar}")


if __name__ == "__main__":
    main(sys.argv)
