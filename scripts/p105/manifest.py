#!/usr/bin/env python3
"""Generate and verify deterministic SHA-256 inventories for P1-05 synthetic data."""
import argparse
import hashlib
import json
import os
from pathlib import Path

MANIFEST_NAME = "manifest.json"
MARKER = ".p105-synthetic-only"


def calculate(root: Path) -> list[dict]:
    entries = []
    for folder, dirs, files in os.walk(root, followlinks=False):
        folder_path = Path(folder)
        for d in dirs:
            if (folder_path / d).is_symlink():
                raise ValueError(f"Symlink directory forbidden: {d}")
        for name in files:
            path = folder_path / name
            if path.is_symlink() or not path.is_file():
                raise ValueError(f"Non-regular file forbidden: {path}")
            relative = path.relative_to(root).as_posix()
            if relative == MANIFEST_NAME:
                continue
            digest = hashlib.sha256()
            with path.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
            entries.append(
                {"path": relative, "bytes": path.stat().st_size, "sha256": digest.hexdigest()}
            )
    return sorted(entries, key=lambda entry: entry["path"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("generate", "verify"))
    parser.add_argument("payload", type=Path)
    args = parser.parse_args()
    root = args.payload.resolve(strict=True)
    if not root.is_dir() or not (root / MARKER).is_file():
        raise SystemExit("Missing P1-05 synthetic fixture marker; refusing.")
    actual = calculate(root)
    if args.mode == "generate":
        manifest = {"schemaVersion": 1, "environment": "synthetic", "files": actual}
        (root / MANIFEST_NAME).write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(f"manifest generated: {len(actual)} synthetic files")
        return

    manifest = json.loads((root / MANIFEST_NAME).read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1 or manifest.get("environment") != "synthetic":
        raise SystemExit("Unexpected backup manifest identity.")
    if actual != manifest.get("files"):
        raise SystemExit("Backup checksum mismatch, missing, or extra files detected.")
    print(f"manifest verified: {len(actual)} synthetic files")


if __name__ == "__main__":
    main()
