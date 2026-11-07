#!/usr/bin/env python3
"""Portable, dependency-free structural checks for a project blueprint.

These are repository guards, NOT runtime acceptance or release authorization.
"""
from __future__ import annotations

import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

# Specialized policies are optional reference files in a compact adoption.
# Referenced roadmap, inbox, current-state and evidence paths are checked below.
REQUIRED_DOCS = ("README.md", "AGENTS.md")
HEX40 = re.compile(r"^[0-9a-fA-F]{40}$")
HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")
PROFILE_NAMES = {"generic", "minecraft-bedrock", "arma", "godot", "python", "discord"}


def safe_path(root: Path, value: object, errors: list[str], label: str, *, allow_root: bool = False) -> Path | None:
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{label}: expected nonempty repository-relative path")
        return None
    normalized = value.replace("\\", "/")
    parts = PurePosixPath(normalized).parts
    if (normalized.startswith("/") or re.match(r"^[A-Za-z]:", normalized)
            or any(x in (".", "..") for x in parts) or "\x00" in normalized):
        errors.append(f"{label}: unsafe path {value!r}")
        return None
    root = root.resolve()
    path = (root / normalized).resolve()
    if path != root and root not in path.parents:
        errors.append(f"{label}: path escapes repository")
        return None
    if path == root and not (allow_root and normalized == "."):
        errors.append(f"{label}: must identify a directory within repository")
        return None
    return path



def within(path: Path, directory: Path) -> bool:
    return path == directory or directory in path.parents


# Only comment-line markers count; quoted test fixture strings are not instrumentation.
TEMP_TAG_COMMENT = re.compile(
    r"(?m)^[ \t]*(?://|#|/\*+|\*|;|--|<!--)[^\r\n]*?\b(TEMP_(?:TEST|DEBUG):[A-Z][A-Z0-9-]*)\b"
)
IGNORED_SCAN_DIRS = {
    ".git", ".venv", "venv", ".tox", ".mypy_cache", ".pytest_cache",
    "node_modules", "__pycache__", "dist", "build",
}
IGNORED_SCAN_SUFFIXES = {".md", ".rst", ".txt", ".csv", ".json", ".jsonl", ".lock"}


def temporary_tags(path: Path) -> set[str]:
    try:
        if path.stat().st_size > 2_000_000 or path.suffix.lower() in IGNORED_SCAN_SUFFIXES:
            return set()
        return set(TEMP_TAG_COMMENT.findall(path.read_text(encoding="utf-8")))
    except (OSError, UnicodeError):
        return set()


def check_temporary_code(root: Path, active: Path | None,
                         test_roots: list[Path], excluded: list[Path],
                         entries: object, release_gate: bool, errors: list[str]) -> None:
    """Check comment tags in active code and declared test-only roots, not runtime safety."""
    if not isinstance(entries, list):
        errors.append("temporary_instrumentation must be an array")
        return
    if release_gate and entries:
        errors.append("release candidate cannot retain temporary instrumentation")
    tracked: set[tuple[str, str]] = set()
    allowed = ([active] if active is not None and active.is_dir() else []) + test_roots
    for i, entry in enumerate(entries):
        label = f"temporary_instrumentation[{i}]"
        if not isinstance(entry, dict):
            errors.append(f"{label}: expected object")
            continue
        ident, kind, task, status = (entry.get(k) for k in ("id", "kind", "task", "status"))
        if not isinstance(ident, str) or not re.fullmatch(r"[A-Z][A-Z0-9-]{2,63}", ident):
            errors.append(f"{label}: invalid ID")
            continue
        if kind not in ("test", "debug") or not isinstance(task, str) or not task.strip():
            errors.append(f"{label}: kind and task required")
            continue
        if status != "active":
            errors.append(f"{label}: completed/accepted task instrumentation must be removed")
        path = safe_path(root, entry.get("path"), errors, f"{label}.path")
        if path is None:
            continue
        if not any(within(path, directory) for directory in allowed) or any(
            within(path, directory) for directory in excluded
        ):
            errors.append(f"{label}: outside active source and declared test roots")
            continue
        if not path.is_file():
            errors.append(f"{label}: file does not exist")
            continue
        marker = f"TEMP_{kind.upper()}:{ident}"
        if (str(path), marker) in tracked:
            errors.append(f"{label}: duplicate instrumentation entry")
        tracked.add((str(path), marker))
        if marker not in temporary_tags(path):
            errors.append(f"{label}: missing tag {marker}")

    scanned: set[Path] = set()
    for directory in allowed:
        for walk_root, dirs, names in os.walk(directory):
            base = Path(walk_root)
            dirs[:] = [name for name in dirs if name not in IGNORED_SCAN_DIRS
                       and not any(within(base / name, skip) for skip in excluded)]
            for name in names:
                path = base / name
                if path in scanned or any(within(path, skip) for skip in excluded):
                    continue
                scanned.add(path)
                for marker in temporary_tags(path):
                    if (str(path.resolve()), marker) in tracked:
                        continue
                    # A standalone, non-runtime TEMP_TEST probe under a declared test root
                    # needs no per-file registry during development. It still must be
                    # removed before task acceptance or a new release candidate.
                    if marker.startswith("TEMP_TEST:") and any(
                        within(path, test_root) for test_root in test_roots
                    ):
                        if release_gate:
                            errors.append(
                                f"release candidate retains disposable test probe {marker} "
                                f"in {path.relative_to(root)}"
                            )
                        continue
                    errors.append(f"unregistered temporary tag {marker} in {path.relative_to(root)}")


ROADMAP_SECTIONS = ("Outcome", "Completed", "Now", "Next", "Later", "Decisions and blockers")
MILESTONE_ID = re.compile(r"^[A-Z][A-Z0-9-]{2,63}$")


def check_planning(root: Path, planning: object, errors: list[str]) -> None:
    """Validate roadmap structure and declared current milestone, not human approval."""
    if not isinstance(planning, dict):
        errors.append("planning must be an object with roadmap, inbox and current_milestone")
        return
    paths: dict[str, Path] = {}
    for key in ("roadmap", "inbox"):
        path = safe_path(root, planning.get(key), errors, f"planning.{key}")
        if path is None:
            continue
        if not path.is_file():
            errors.append(f"planning.{key}: target file not found")
        else:
            paths[key] = path
    if "current_milestone" not in planning:
        errors.append("planning.current_milestone must be present (ID or null)")
        return
    current = planning["current_milestone"]
    if current is not None and (
        not isinstance(current, str) or not MILESTONE_ID.fullmatch(current)
    ):
        errors.append("planning.current_milestone must be an uppercase milestone ID or null")
        return
    roadmap = paths.get("roadmap")
    if roadmap is None:
        return
    try:
        content = roadmap.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        errors.append("planning.roadmap: unable to read UTF-8")
        return
    headings = list(re.finditer(r"(?m)^## (.+?)\s*$", content))
    sections: dict[str, str] = {}
    for i, match in enumerate(headings):
        label = match.group(1).strip()
        if label in sections:
            errors.append(f"planning.roadmap: duplicate section {label}")
        end = headings[i + 1].start() if i + 1 < len(headings) else len(content)
        sections[label] = content[match.end():end]
    for label in ROADMAP_SECTIONS:
        if label not in sections:
            errors.append(f"planning.roadmap: missing section {label}")
    now = sections.get("Now")
    if now is None:
        return
    if current is None:
        if "No active milestone" not in now:
            errors.append("planning.roadmap: Now must say 'No active milestone' when current_milestone is null")
    elif not re.search(r"(?<![A-Z0-9-])" + re.escape(current) + r"(?![A-Z0-9-])", now):
        errors.append("planning.roadmap: declared current_milestone is not in Now section")


def validate(root: Path, *, release_gate: bool = False) -> list[str]:
    root = root.resolve()
    errors: list[str] = []
    for rel in REQUIRED_DOCS:
        if not (root / rel).is_file():
            errors.append(f"missing mandatory document: {rel}")
    contract = root / "project-blueprint.json"
    if not contract.is_file():
        return errors + ["missing project-blueprint.json"]
    try:
        data = json.loads(contract.read_text(encoding="utf-8"))
    except (ValueError, OSError) as exc:
        return errors + [f"invalid project-blueprint.json: {exc}"]
    if not isinstance(data, dict):
        return errors + ["project-blueprint.json: expected JSON object"]
    if data.get("schema_version") != 1:
        errors.append("schema_version must be 1")
    if not isinstance(data.get("standard_version"), str) or not re.fullmatch(r"\d+\.\d+\.\d+", data["standard_version"]):
        errors.append("standard_version must be a major.minor.patch string")

    project = data.get("project")
    if not isinstance(project, dict):
        project = {}
        errors.append("project must be an object")
    name = project.get("name")
    if not isinstance(name, str) or not name.strip():
        errors.append("project.name is required")
    gh_repo = os.getenv("GITHUB_REPOSITORY", "")
    if gh_repo and isinstance(name, str) and gh_repo.split("/")[-1].lower() != name.lower():
        errors.append("project.name must match GitHub repository name; customize the template")
    if not isinstance(project.get("kind"), str) or not project["kind"].strip():
        errors.append("project.kind is required")
    profiles = project.get("platform_profiles")
    if not isinstance(profiles, list) or not profiles or any(not isinstance(p, str) or p not in PROFILE_NAMES for p in profiles):
        errors.append(f"platform_profiles must contain known names: {', '.join(sorted(PROFILE_NAMES))}")
    elif len(profiles) != len(set(profiles)):
        errors.append("platform_profiles has duplicates")

    source = data.get("source")
    if not isinstance(source, dict):
        source = {}
        errors.append("source must be an object")
    active = safe_path(root, source.get("active"), errors, "source.active", allow_root=True)
    if active is not None and not active.is_dir():
        errors.append(f"active source is not a directory: {source.get('active')}")
    frozen = source.get("frozen_references")
    archives = source.get("archives")
    if not isinstance(frozen, list):
        errors.append("source.frozen_references must be an array")
        frozen = []
    if not isinstance(archives, list):
        errors.append("source.archives must be an array")
        archives = []
    other_paths: list[tuple[str, Path]] = []
    for idx, item in enumerate(frozen):
        label = f"source.frozen_references[{idx}]"
        if not isinstance(item, dict):
            errors.append(f"{label} must be an object")
            continue
        path = safe_path(root, item.get("path"), errors, label)
        sha = item.get("git_tree_sha")
        if not isinstance(sha, str) or not HEX40.fullmatch(sha):
            errors.append(f"{label}.git_tree_sha must be a 40-digit Git tree hash")
        if path is None:
            continue
        other_paths.append((label, path))
        if not path.is_dir():
            errors.append(f"{label}: frozen directory absent")
        elif isinstance(sha, str) and HEX40.fullmatch(sha):
            rel = path.relative_to(root).as_posix()
            try:
                actual = subprocess.run(
                    ["git", "-C", str(root), "rev-parse", f"HEAD:{rel}"],
                    check=True, capture_output=True, text=True,
                ).stdout.strip()
                if actual.lower() != sha.lower():
                    errors.append(f"{label}: frozen Git tree changed (expected {sha}, got {actual})")
            except (OSError, subprocess.CalledProcessError):
                errors.append(f"{label}: cannot verify frozen Git tree at HEAD:{rel}")
    for idx, raw in enumerate(archives):
        label = f"source.archives[{idx}]"
        path = safe_path(root, raw, errors, label)
        if path is None:
            continue
        other_paths.append((label, path))
        if not path.is_dir():
            errors.append(f"{label}: archive directory absent")
    # A root-level implementation may coexist with explicitly excluded historical trees.
    all_paths = [("source.active", active)] if active is not None else []
    all_paths += other_paths
    for i in range(len(all_paths)):
        for j in range(i + 1, len(all_paths)):
            a_label, a = all_paths[i]
            b_label, b = all_paths[j]
            if a_label == "source.active" and a == root:
                continue
            if a == b or a in b.parents or b in a.parents:
                errors.append(f"source authority overlaps: {a_label} and {b_label}")

    # Optional test-only directories are not extra product implementation roots.
    test_roots: list[Path] = []
    raw_test_roots = source.get("test_roots", [])
    if not isinstance(raw_test_roots, list):
        errors.append("source.test_roots must be an array")
    else:
        for idx, raw in enumerate(raw_test_roots):
            label = f"source.test_roots[{idx}]"
            path = safe_path(root, raw, errors, label)
            if path is None:
                continue
            if not path.is_dir():
                errors.append(f"{label}: test directory absent")
            if path in test_roots:
                errors.append(f"{label}: duplicate test root")
            if any(within(path, old) or within(old, path) for _, old in other_paths):
                errors.append(f"{label}: test root overlaps frozen/archive source")
            test_roots.append(path)


    state = data.get("state")
    if not isinstance(state, dict):
        state = {}
        errors.append("state must be an object")
    if not isinstance(state.get("lifecycle"), str) or not state["lifecycle"].strip():
        errors.append("state.lifecycle required")
    for key in ("current_state", "evidence"):
        path = safe_path(root, state.get(key), errors, f"state.{key}")
        if path is not None and not path.is_file():
            errors.append(f"state.{key} target is not a file")

    release = data.get("release")
    if not isinstance(release, dict):
        release = {}
        errors.append("release must be an object")
    if not isinstance(release.get("approved"), bool):
        errors.append("release.approved must be a boolean")
    elif release["approved"]:
        if not isinstance(release.get("commit"), str) or not HEX40.fullmatch(release["commit"]):
            errors.append("approved release needs exact 40-character source commit")
        if not isinstance(release.get("artifact_sha256"), str) or not HEX64.fullmatch(release["artifact_sha256"]):
            errors.append("approved release needs actual 64-character artifact SHA-256")
        for key in ("approval_reference", "evidence_reference"):
            if not isinstance(release.get(key), str) or not release[key].strip():
                errors.append(f"approved release requires {key}")
    check_planning(root, data.get('planning'), errors)
    check_temporary_code(root, active, test_roots, [p for _, p in other_paths],
                         data.get('temporary_instrumentation'), release_gate, errors)
    return errors


def main() -> int:
    if len(sys.argv) > 2 or (len(sys.argv) == 2 and sys.argv[1] != "--release-gate"):
        print("usage: validate_blueprint.py [--release-gate]")
        return 2
    release_gate = len(sys.argv) == 2
    root = Path(__file__).resolve().parent.parent
    errors = validate(root, release_gate=release_gate)
    if errors:
        print("BLUEPRINT RELEASE GATE FAIL" if release_gate else "BLUEPRINT CONTRACT FAIL")
        for error in errors:
            print(f" - {error}")
        return 1
    if release_gate:
        print("BLUEPRINT RELEASE STRUCTURAL GATE PASS (not runtime or owner approval)")
    else:
        print("BLUEPRINT STRUCTURAL CONTRACT PASS (not runtime or release approval)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
