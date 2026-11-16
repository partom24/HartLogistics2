#!/usr/bin/env python3
"""Repackage canonical Bedrock source folders into one .mcaddon (stdlib only)."""
from __future__ import annotations
import argparse
import io
import json
from pathlib import Path
import zipfile

BASE = Path(__file__).resolve().parents[1]
ADDON = BASE / "addon"

# Fixed metadata makes builds byte-identical across Windows/Linux, hosts and dates.
ZIP_EPOCH = (1980, 1, 1, 0, 0, 0)

def add_entry(archive: zipfile.ZipFile, name: str, content: bytes) -> None:
    item = zipfile.ZipInfo(name, date_time=ZIP_EPOCH)
    item.compress_type = zipfile.ZIP_DEFLATED
    item.create_system = 3
    item.external_attr = 0o100644 << 16
    archive.writestr(item, content)

def pack_data(folder: Path) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for file in sorted(folder.rglob("*")):
            if file.is_file():
                add_entry(archive, file.relative_to(folder).as_posix(), file.read_bytes())
    return buffer.getvalue()

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    bp = ADDON / "behavior_pack"
    rp = ADDON / "resource_pack"
    for folder in (bp, rp):
        if not (folder / "manifest.json").is_file():
            parser.error(f"Required pack manifest missing: {folder}")
    b = json.loads((bp / "manifest.json").read_text(encoding="utf-8"))
    r = json.loads((rp / "manifest.json").read_text(encoding="utf-8"))
    bv = b["header"]["version"]
    rv = r["header"]["version"]
    if bv != rv:
        parser.error(f"Pack version mismatch: BP {bv}, RP {rv}")
    if not any(dep.get("uuid") == r["header"]["uuid"] and dep.get("version") == rv
               for dep in b.get("dependencies", [])):
        parser.error("Behavior pack does not depend on the matching resource pack UUID/version")
    version = ".".join(map(str, bv))
    output = args.output or (BASE / "dist" / f"HartMods_HartLogistics_{version}.mcaddon")
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w") as archive:
        add_entry(archive, f"HartMods_HartLogistics_{version}_BP.mcpack", pack_data(bp))
        add_entry(archive, f"HartMods_HartLogistics_{version}_RP.mcpack", pack_data(rp))
    print(f"Built {output}")

if __name__ == "__main__":
    main()
