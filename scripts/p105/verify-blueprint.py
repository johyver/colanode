#!/usr/bin/env python3
"""Static guard for an intentionally non-deployable Synology staging blueprint.

This is not a Docker Compose execution or a substitute for a real NAS
capacity/platform preflight.
"""
from pathlib import Path

compose = Path("hosting/environments/staging.compose.yaml").read_text()
expected = (
    "name: colanode-p105-staging",
    "profiles: [approved-staging-only]",
    "internal: true",
    "no-new-privileges:true",
    "registry.example.invalid",
    "unavailable-requires-separate-approval",
    "POSTGRES_PASSWORD_FILE",
    "staging_valkey_conf",
)
for item in expected:
    assert item in compose, f"Missing staging safety requirement: {item}"
assert "ports:" not in compose, "No staging service may publish host ports"
assert "password: " not in compose.lower(), "No plaintext passwords in blueprint"
assert compose.count("profiles: [approved-staging-only]") == 4
assert compose.count("restart: \"no\"") == 4
for variable in ("postgres_data", "valkey_data", "server_files"):
    assert variable in compose, f"Missing separate staging data volume: {variable}"
print("P1-05 staging blueprint static safety checks passed; no NAS deployment")
