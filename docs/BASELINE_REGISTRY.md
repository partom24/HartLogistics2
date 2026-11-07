# Baseline Registry

Immutable history must be **declared**; it is not inferred merely from a version number or directory name.

**Current blueprint:** no frozen source references or released binaries.

For each project baseline, record:
- path and exact 40-character **Git tree SHA** in `project-blueprint.json → source.frozen_references`;
- origin commit/tag and why that source was frozen;
- whether it was source reviewed, offline tested, observed in runtime, integrated, or release approved;
- immutable distributable SHA-256 if an actual package was built;
- unresolved mismatch between source snapshot, installer output, and installed runtime, if any.

A Git tree SHA verifies a directory in the commit's repository tree. It is **not** the SHA-256 of a zip/executable or proof the running server has those bytes. The validator compares each declared frozen path to its pinned Git tree in the current HEAD. Adding a new baseline requires an explicit approved transition; never repin a changed baseline to disguise mutation.
