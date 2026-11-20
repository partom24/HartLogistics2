# 0.1.0 → 0.2.0
- Original 1.4.1 visual assets untouched, original LAB identifiers and UUIDs preserved.
- New addressed Hopper movement, native inventory transfers, FILTER/WILDCARD/AUTO/BYPASS destination selection, Collector/Receiver physical lane integration.
- No legacy routing scheduler, custody system, or serialized inventory queue.
- `hartlab:setup_io` creates non-destructive dedicated input fixtures for the pre-existing 10×4 bank and four-sorter branch.
- `hartlab:status` / `hartlab:refresh` for testing.
- New LAB-only source upgrade script with backups and executable-path process isolation.
- Two independent physical lanes, one shipment at a time per lane.
