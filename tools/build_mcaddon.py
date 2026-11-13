#!/usr/bin/env python3
"""Package an explicitly selected Hart Logistics source tree (stdlib only).

The protected 1.4.1 baseline is never confused with an unapproved HL2 UCE
candidate. This tool builds archives; it never installs or activates them.
"""
from __future__ import annotations

import argparse
import importlib.util
import io
import json
import tempfile
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "addon"
UCE_COMPILER = ROOT / "candidates/uce/prepare_candidate.py"
UNAPPROVED = "NOT_APPROVED_FOR_INSTALL.txt"
FORBIDDEN_UCE_MARKERS = (
    "TEMP_TEST:", "hartlogistics:pg42_spawn", "hartlogistics:pg42_audit",
    "UCE_PG40_FORENSIC_FREEZE", "PG40 FORENSIC HOLD",
)


def pack_data(folder: Path) -> bytes:
    """Package a real pack without following injected links."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(folder.rglob("*")):
            if file.is_symlink():
                raise ValueError(f"Pack contains forbidden symbolic link: {file}")
            if file.is_file():
                archive.write(file, file.relative_to(folder).as_posix())
    return buffer.getvalue()


def validate_pair(source: Path, *, is_uce: bool) -> tuple[str, Path, Path]:
    bp, rp = source / "behavior_pack", source / "resource_pack"
    for folder in (bp, rp):
        if folder.is_symlink() or not (folder / "manifest.json").is_file():
            raise ValueError(f"Required ordinary pack folder/manifest missing: {folder}")
    b = json.loads((bp / "manifest.json").read_text(encoding="utf-8"))
    r = json.loads((rp / "manifest.json").read_text(encoding="utf-8"))
    bv, rv = b["header"]["version"], r["header"]["version"]
    if bv != rv:
        raise ValueError(f"BP/RP version mismatch: {bv} vs {rv}")
    if not any(dep.get("uuid") == r["header"]["uuid"] and
               dep.get("version") == rv for dep in b.get("dependencies", [])):
        raise ValueError("BP does not depend on matching RP UUID/version")
    for kind, new in (("behavior_pack", b), ("resource_pack", r)):
        old = json.loads((BASELINE / kind / "manifest.json").read_text(encoding="utf-8"))
        if new["header"]["uuid"] != old["header"]["uuid"]:
            raise ValueError(f"Original {kind} pack identity changed")
    if is_uce:
        if bv != [1, 5, 16] or not (source / UNAPPROVED).is_file():
            raise ValueError("UCE must be an explicitly unapproved 1.5.16 build")
        main = (bp / "scripts/main.js").read_text(encoding="utf-8")
        if 'const VERSION = "1.5.16-DEV-UCE";' not in main:
            raise ValueError("Not the integrated HL2 UCE runtime")
        for marker in FORBIDDEN_UCE_MARKERS:
            if marker in main:
                raise ValueError(f"Temporary LAB diagnostic reached UCE product: {marker}")
        # A source-only build may not silently become a release.
        version = "1.5.16_UNAPPROVED_SOURCE_ONLY"
    else:
        if source.resolve() != BASELINE.resolve() or bv != [1, 4, 1]:
            raise ValueError("Baseline packaging requires protected original 1.4.1")
        version = "1.4.1_BASELINE_REFERENCE"
    return version, bp, rp


def write_archive(source: Path, output: Path, *, is_uce: bool) -> Path:
    version, bp, rp = validate_pair(source, is_uce=is_uce)
    if output.is_symlink():
        raise ValueError("Archive output must not be a symlink")
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise FileExistsError(f"Refusing to replace existing archive: {output}")
    # Build and validate the inner archives before creating the output.
    contents = [(f"HartMods_HartLogistics_{version}_{part}.mcpack", pack_data(folder))
                for part, folder in (("BP", bp), ("RP", rp))]
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, payload in contents:
            archive.writestr(name, payload)
        if is_uce:
            archive.writestr(UNAPPROVED, (source / UNAPPROVED).read_text(encoding="utf-8"))
    return output


def prepare_uce(source: Path) -> None:
    spec = importlib.util.spec_from_file_location("hl2_package_uce", UCE_COMPILER)
    if spec is None or spec.loader is None:
        raise ValueError("UCE builder could not load")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.prepare(source)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, choices=("baseline", "hl2-uce"),
                        help="Explicitly choose immutable 1.4.1 or unapproved HL2 source")
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--acknowledge-unapproved-source", action="store_true",
                        help="Allow source-only HL2 archive, NOT a LAB/production install")
    args = parser.parse_args(argv)
    if args.acknowledge_unapproved_source != (args.source == "hl2-uce"):
        parser.error("--acknowledge-unapproved-source is required only for hl2-uce")
    with tempfile.TemporaryDirectory(prefix="hart-source-packaging-") as temp:
        is_uce = args.source == "hl2-uce"
        source = Path(temp) / "uce" if is_uce else BASELINE
        if is_uce:
            prepare_uce(source)
        version, _, _ = validate_pair(source, is_uce=is_uce)
        output = args.output or ROOT / "dist" / f"HartMods_HartLogistics_{version}.mcaddon"
        try:
            write_archive(source, output, is_uce=is_uce)
        except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
            parser.error(str(exc))
        print(f"Built {output}")
        if is_uce:
            print("SOURCE-ONLY UCE archive. NOT approved for manual installation, BDS or release.")
        else:
            print("PROTECTED 1.4.1 REFERENCE archive; NOT HartLogistics2.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
