# Temporary Testing and Debugging Instrumentation Policy

**Mandatory for every project, regardless of platform.**

## Scope

Runtime-connected task-specific test/debug commands, functions, hooks, mocks and diagnostics must be identifiable and recorded. A self-contained experimental test under an explicitly declared non-runtime `source.test_roots` directory is a lighter case: tag it `TEMP_TEST:<ID>`, but it need not be individually registered while the task is open. Never allow either kind to become a required runtime dependency.

## Required lifecycle

1. **Tag:** mark the code where defined with a dedicated language-appropriate comment line containing `TEMP_TEST:<ID>` or `TEMP_DEBUG:<ID>`. The structural scanner recognizes comment-line tags rather than strings or Markdown examples.
2. **Track runtime-connected diagnostics:** add an entry under `temporary_instrumentation` for each affected runtime-connected file (ID, `kind`, `task`, `path`, `status: "active"`). A standalone, non-runtime `TEMP_TEST` probe inside an explicitly declared `source.test_roots` directory does **not** need a registry entry. `TEMP_DEBUG` and temporary code outside declared test-only roots still require registration. Test-only placement is not proof of runtime independence; review import/startup wiring.
3. **Keep non-essential:** normal installation, startup, processing, data custody, interfaces, and production operation must continue correctly without the temporary code. Do not embed a test command or debug class into mandatory execution paths.
4. **Delete on acceptance/completion:** remove every disposable probe and temporary runtime helper, all its wiring, and any registry entries **before** the associated task is accepted or completed. This includes unregistered tagged test-only probes; they may be used during development, not retained after acceptance. Disabling or hiding a helper is not removal. Reverify ordinary operation where relevant.
5. **Never ship it:** run `python scripts/validate_blueprint.py --release-gate` on each new candidate. It rejects nonempty registry entries **and tagged standalone test-only probes left in declared test roots**. Normal checks permit active registered diagnostics or unregistered standalone `TEMP_TEST` probes during development; neither may survive task acceptance. Historical approval never authorizes a new release.

## Registry example (only while a task is open)

```json
{
  "temporary_instrumentation": [
    {
      "id": "QUEUE-42",
      "kind": "debug",
      "task": "Verify queue recovery #42",
      "path": "src/queue_debug.py",
      "status": "active"
    }
  ]
}
```

In that file, label the temporary command/function/class with `# TEMP_DEBUG:QUEUE-42`. When queue recovery is accepted, delete both implementation and entry.

## Distinguish permanent tests

A deliberately maintained unit/integration/regression suite may remain in a **test-only tree outside normal runtime** without TEMP tags: these tests are permanent product-quality assets, not temporary probes. Standalone short-lived experiments in `source.test_roots` need one `TEMP_TEST:<ID>` marker per file but no additional JSON record; delete them on task acceptance, or deliberately convert them to useful permanent regression coverage by removing the temporary marker and stating the reason in the ordinary review. A runtime-connected probe must instead be registered even when its file is in a test directory. An intentionally supported production diagnostic requires its own product contract; don't relabel disposable code to escape cleanup.

## Validation limitations

Normal validation checks registered markers and rejects unregistered `TEMP_DEBUG` markers or `TEMP_TEST` markers outside declared test roots. A tagged standalone `TEMP_TEST` marker inside a declared test root is allowed during development without registry; the release gate rejects it. Neither mode can detect untagged helpers, prove task completion or establish runtime independence. Review and actual acceptance remain necessary.
