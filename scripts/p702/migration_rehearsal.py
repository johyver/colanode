#!/usr/bin/env python3
"""P7-02 synthetic-only migration rehearsal.

This harness deliberately has no Notion client, network input, or import path.
It creates fabricated source records and attachments, maps them into a target
shape, reconciles IDs/relations/hashes, and simulates rollback in a disposable
workspace. It is safe to run repeatedly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path


MARKER = "P7-02-SYNTHETIC-ONLY"
SCHEMA_VERSION = 1


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def generate_source(root: Path) -> dict[str, object]:
    source = root / "source"
    attachments = source / "attachments"
    attachments.mkdir(parents=True, exist_ok=True)
    (source / "SYNTHETIC-ONLY.txt").write_text(MARKER + "\n", encoding="utf-8")

    records = [
        {
            "id": "src-page-001",
            "type": "page",
            "title": "Synthetic Home",
            "parent_id": None,
            "relations": ["src-page-002"],
        },
        {
            "id": "src-page-002",
            "type": "page",
            "title": "Synthetic Project",
            "parent_id": "src-page-001",
            "relations": ["src-task-001", "src-blog-001"],
        },
        {
            "id": "src-task-001",
            "type": "database_row",
            "title": "Synthetic migration checklist",
            "parent_id": "src-page-002",
            "relations": ["src-blog-001"],
            "properties": {"status": "In Progress", "priority": "P1"},
        },
        {
            "id": "src-blog-001",
            "type": "database_row",
            "title": "Synthetic release note",
            "parent_id": "src-page-002",
            "relations": ["src-task-001"],
            "properties": {"status": "Draft", "category": "Testing"},
        },
    ]
    attachment_values = {
        "src-attachment-001.txt": b"P7-02 synthetic attachment A\n",
        "src-attachment-002.txt": b"P7-02 synthetic attachment B\n",
    }
    attachments_by_record: dict[str, list[str]] = {}
    for index, (name, value) in enumerate(attachment_values.items(), start=1):
        path = attachments / name
        path.write_bytes(value)
        attachments_by_record.setdefault(records[index % 2]["id"], []).append(name)

    for record in records:
        record["attachments"] = attachments_by_record.get(record["id"], [])

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "marker": MARKER,
        "source_system": "synthetic-fixture",
        "records": records,
        "attachment_hashes": {name: sha256(attachments / name) for name in attachment_values},
    }
    write_json(source / "source-manifest.json", manifest)
    return manifest


def assert_synthetic_manifest(manifest: dict[str, object]) -> None:
    if manifest.get("marker") != MARKER:
        raise RuntimeError("refusing to process a non-synthetic manifest")
    if manifest.get("source_system") != "synthetic-fixture":
        raise RuntimeError("refusing a manifest from an external source")


def migrate(root: Path, source_manifest: dict[str, object]) -> dict[str, object]:
    assert_synthetic_manifest(source_manifest)
    source = root / "source"
    target = root / "target"
    target_attachments = target / "attachments"
    target_attachments.mkdir(parents=True, exist_ok=True)

    records = source_manifest["records"]
    assert isinstance(records, list)
    id_map = {record["id"]: f"dst-{record['id'][4:]}" for record in records}
    target_records = []
    for record in records:
        target_record = dict(record)
        target_record["id"] = id_map[record["id"]]
        target_record["source_id"] = record["id"]
        target_record["parent_id"] = id_map.get(record["parent_id"])
        target_record["relations"] = [id_map[relation] for relation in record["relations"]]
        target_records.append(target_record)

    for name in source_manifest["attachment_hashes"]:
        shutil.copy2(source / "attachments" / name, target_attachments / name)

    target_manifest = {
        "schema_version": SCHEMA_VERSION,
        "marker": MARKER,
        "source_system": "synthetic-fixture",
        "target_system": "colanode-staging-rehearsal",
        "records": target_records,
        "id_map": id_map,
        "attachment_hashes": {
            name: sha256(target_attachments / name) for name in source_manifest["attachment_hashes"]
        },
    }
    write_json(target / "target-manifest.json", target_manifest)
    write_json(root / "id-map.json", id_map)
    return target_manifest


def reconcile(root: Path, source_manifest: dict[str, object], target_manifest: dict[str, object]) -> dict[str, object]:
    assert_synthetic_manifest(source_manifest)
    assert_synthetic_manifest(target_manifest)
    source_records = source_manifest["records"]
    target_records = target_manifest["records"]
    id_map = target_manifest["id_map"]
    if len(source_records) != len(target_records):
        raise AssertionError("record count mismatch")
    if len(set(id_map.values())) != len(id_map):
        raise AssertionError("target IDs are not unique")

    target_by_id = {record["id"]: record for record in target_records}
    for source_record in source_records:
        target_id = id_map[source_record["id"]]
        target_record = target_by_id.get(target_id)
        if not target_record or target_record["source_id"] != source_record["id"]:
            raise AssertionError(f"missing ID mapping for {source_record['id']}")
        expected_parent = id_map.get(source_record["parent_id"])
        if target_record["parent_id"] != expected_parent:
            raise AssertionError(f"parent relation mismatch for {source_record['id']}")
        if target_record["relations"] != [id_map[item] for item in source_record["relations"]]:
            raise AssertionError(f"relation mismatch for {source_record['id']}")

    source_hashes = source_manifest["attachment_hashes"]
    target_hashes = target_manifest["attachment_hashes"]
    if source_hashes != target_hashes:
        raise AssertionError("attachment hash mismatch")
    for name, expected_hash in target_hashes.items():
        if sha256(root / "target" / "attachments" / name) != expected_hash:
            raise AssertionError(f"attachment bytes changed for {name}")

    return {
        "record_count": len(source_records),
        "relation_count": sum(len(record["relations"]) for record in source_records),
        "attachment_count": len(source_hashes),
        "id_mapping_count": len(id_map),
        "attachment_hashes_match": True,
    }


def rollback(root: Path, target_manifest: dict[str, object]) -> dict[str, object]:
    target = root / "target"
    snapshot = root / "rollback-snapshot"
    shutil.copytree(target, snapshot)
    shutil.rmtree(target)
    if target.exists():
        raise AssertionError("rollback simulation did not remove target")
    shutil.copytree(snapshot, target)
    restored = read_json(target / "target-manifest.json")
    if restored != target_manifest:
        raise AssertionError("rollback restore manifest mismatch")
    return {"target_removed": True, "target_restored": True}


def write_report(root: Path, reconciliation: dict[str, object], rollback_result: dict[str, object]) -> Path:
    report = {
        "schema_version": SCHEMA_VERSION,
        "marker": MARKER,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_data_accessed": False,
        "notion_api_used": False,
        "real_records_transferred": False,
        "checks": {
            "synthetic_fixture_gate": True,
            "source_target_counts_reconciled": True,
            "ids_and_relations_reconciled": True,
            "attachment_hashes_reconciled": reconciliation["attachment_hashes_match"],
            "rollback_simulation": rollback_result,
        },
        "readiness": "PREPARED_FOR_FUTURE_REVIEW_ONLY",
    }
    json_path = root / "readiness-report.json"
    write_json(json_path, report)
    markdown = root / "readiness-report.md"
    markdown.write_text(
        "# P7-02 synthetic migration rehearsal\n\n"
        f"- Marker: `{MARKER}`\n"
        f"- Records reconciled: {reconciliation['record_count']}\n"
        f"- Relations reconciled: {reconciliation['relation_count']}\n"
        f"- Attachments hash-verified: {reconciliation['attachment_count']}\n"
        "- Rollback simulation: target removed and restored from disposable snapshot\n"
        "- Production Notion data accessed: **no**\n"
        "- Readiness: **PREPARED FOR FUTURE REVIEW ONLY**\n\n"
        "This artifact is not migration approval and contains no real Notion data.\n",
        encoding="utf-8",
    )
    return json_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Optional output directory; it must not contain an existing target or source.",
    )
    args = parser.parse_args()
    owned_temp = args.output_dir is None
    root = args.output_dir or Path(tempfile.mkdtemp(prefix="colanode-p702-rehearsal-"))
    root.mkdir(parents=True, exist_ok=True)
    if any((root / name).exists() for name in ("source", "target", "rollback-snapshot")):
        raise SystemExit(f"Refusing to overwrite existing rehearsal data in {root}")
    try:
        source_manifest = generate_source(root)
        target_manifest = migrate(root, source_manifest)
        reconciliation = reconcile(root, source_manifest, target_manifest)
        rollback_result = rollback(root, target_manifest)
        report = write_report(root, reconciliation, rollback_result)
        print(f"P7-02 synthetic migration rehearsal PASS: {report}")
        print(json.dumps({"reconciliation": reconciliation, "rollback": rollback_result}, sort_keys=True))
        if owned_temp:
            print(f"Disposable rehearsal directory: {root}")
        return 0
    finally:
        if owned_temp:
            # Keep the artifact path for inspection; the caller can remove this
            # disposable directory after reviewing it.
            pass


if __name__ == "__main__":
    raise SystemExit(main())
