#!/usr/bin/env python3
"""Read-only summary of actual Bedrock client Content Log geometry errors.

The presence of a geometry definition in the Git/source pack is NOT proof the
Minecraft client successfully registered it. Do not infer cache or RP delivery
state solely from an unresolved identifier. No server/world interaction.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import re

TIMESTAMP = re.compile(r"^\d\d:\d\d:\d\d")
ERROR = re.compile(r"\[(?P<area>[^]]+)\]\[(?P<severity>error|warning)\]")
BLOCK = re.compile(r"Block name = '([^']+)'")
GEOMETRY = re.compile(
    r"(?:Missing referenced asset|cannot find)\s+(geometry\.[A-Za-z0-9_.:-]+)", re.I
)

def summarize(lines: list[str]) -> dict:
    blocks = defaultdict(lambda: defaultdict(lambda: {"count": 0, "times": set()}))
    area_counts = Counter()
    geometry_counts = Counter()
    other_errors = Counter()
    for line in lines:
        match = ERROR.search(line)
        if not match:
            continue
        area = match.group("area")
        area_counts[area] += 1
        if area == "Blocks":
            block = BLOCK.search(line)
            model = GEOMETRY.search(line)
            if block and model:
                identifier = model.group(1).rstrip(".")
                record = blocks[block.group(1)][identifier]
                record["count"] += 1
                stamp = TIMESTAMP.search(line)
                if stamp:
                    record["times"].add(stamp.group())
                geometry_counts[identifier] += 1
                continue
        other_errors[line.split("]-", 1)[-1].strip()] += 1

    return {
        "severity_counts": dict(sorted(area_counts.items())),
        "geometry_lookup_error_lines": sum(geometry_counts.values()),
        "geometry": {
            block: {
                identifier: {"count": record["count"], "times": sorted(record["times"])}
                for identifier, record in sorted(models.items())
            }
            for block, models in sorted(blocks.items())
        },
        "other_error_counts": dict(other_errors.most_common(12)),
        "classification": "client runtime geometry lookup failure, not proof a source model file is absent"
    }

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("log", type=Path, help="Minecraft CLIENT ContentLog text file")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    data = summarize(args.log.read_text(encoding="utf-8-sig", errors="replace").splitlines())
    if args.json:
        print(json.dumps(data, indent=2))
    else:
        print("Client Content Log errors:", data["severity_counts"])
        print("Block geometry lookup error lines:", data["geometry_lookup_error_lines"])
        for block, models in data["geometry"].items():
            print(block)
            for identifier, record in models.items():
                print(" ", identifier, "x" + str(record["count"]),
                      "at", ", ".join(record["times"]))
        print("NOTE:", data["classification"])
        print("NOTE: Client pack activation and source-file omission remain unproven.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
