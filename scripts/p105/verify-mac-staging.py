#!/usr/bin/env python3
"""Fail-closed static checks for P1-05 Mac-only, synthetic staging Compose."""
from pathlib import Path

stage = Path("hosting/environments/mac-staging.compose.yaml").read_text()
required = (
    "P105_PROJECT:?", "P105_SOURCE_CONTAINER:?", "P105_VALKEY_CONTAINER:?",
    "P105_SECRET_DIR:?", "profiles: [synthetic-staging]", "internal: true",
    "pgvector/pgvector:pg17", "valkey/valkey:8.1",
    "POSTGRES_PASSWORD_FILE", "no-new-privileges:true",
    "pg_data:/var/lib/postgresql/data", "uploads:/synthetic-uploads",
    "mem_limit: 512m", "mem_limit: 128m",
)
for value in required:
    assert value in stage, "Missing Mac synthetic boundary: " + value
assert stage.count("profiles: [synthetic-staging]") == 2
assert stage.count('restart: "no"') == 2
assert "ports:" not in stage
assert "127.0.0.1:" not in stage
assert "registry.example.invalid" not in stage
assert "Synology" not in stage
print("Mac staging blueprint synthetic-only boundary check PASS")
