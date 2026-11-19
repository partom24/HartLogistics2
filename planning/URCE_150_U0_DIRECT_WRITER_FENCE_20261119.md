# URCE U0 — direct runtime mutation callsite fence (2026-11-19)

**Source-only audit; not a completed U0 writer/recursion/callback census.** This is a maintenance regression gate against accidentally adding native or persisted writers while developing the URCE bank graph. No real LAB/world changes.

The machine-readable registry at planning/URCE_150_U0_DIRECT_WRITER_FENCE.json captures the current 1.5.1 behavior-pack scripts' direct calls to setItem, addItem, remove, kill, setDynamicProperty, setPermutation, setType, spawnItem, spawnEntity, runCommand, setLore, setCanDestroy, setCanPlaceOn, and addEnchantments. It records **49 direct calls in the protected original main.js and one visual permutation in the preview script**, with source-line signatures, counts and nine reviewer-assigned categories.

The companion Node tests require an explicit source-script inventory and exact callsite matching before CI can succeed. Introducing a new physical write, changing a Q4 recovery callsite or adding a new Bedrock JavaScript file now requires conscious U0 review. The original unguarded useReceiver() remains explicitly visible and remains blocking issue #86 until a separately versioned link-cycle runtime guard is integrated.

**Limits:** A lexical method-count/source-line signature guard is not a sound JavaScript AST analysis, callback reachability proof, native Hopper/foreign writer lock, source admission check, dynamic property ownership proof or restart receipt test. Indirect aliases, computed property calls and API mutation methods not in the approved method list require further census. The transitive caller graph still needs auditing before moving writers into URCE.

**Owner LAB correction:** Storage structures for all 13 banks exist, but no Transporters, Receivers or Collectors are placed in the 13-bank array. Workbook positions, including R19, are intended layout, not observed Bedrock links. The earlier two-bank loop was a distinct prior test configuration. No gameplay BP/RP, installed pack, world or production environment was altered by this source audit.

## 2026-11-19 1.5.2 live control-plane integration checkpoint

The source-level mutation ledger has been revalidated after adding the five read-only `urce_152_*.js` modules and the guarded link UI/ingress checks in `main.js`. There remain **49 direct mutating calls** in `main.js`, the original **one** visual preview `setPermutation`, and **zero** registered native mutation method calls in the five U1 modules. The source tests also compare the seven protected 1.4.2 physical/Q4 writer function bodies against an exact prior candidate commit. A new 1.5.2 guarded gameplay control-plane **does** exist on the development branch, but has not been installed or BDS-observed in the owner's copied LAB. Thus direct callsite safety does not certify routing correctness, throughput, foreign writers or crash durability.

This updates the earlier note that no 1.5.2 gameplay source had changed, without rewriting the earlier provenance.
