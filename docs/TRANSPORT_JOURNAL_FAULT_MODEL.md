# Ordinary Transporter — fault-injected journal prototype

**2026-11-07 status: OFFLINE SIMULATOR PASS only.** This prototype is deliberately **Node-only** and does not run on Minecraft Bedrock, modify the protected original add-on, or read/write any server, world, or pack. It extends the [ordinary routing/Bulk safety core](TRANSPORTER_BULK_OFFLINE_CORE.md), without implying actual item custody, Bedrock compatibility or production readiness.

## What has been implemented

- [`ordinary_journal.node.mjs`](../candidates/transport/ordinary_journal.node.mjs): an append-only **offline filesystem journal simulator**, with a monotonically numbered SHA-256 record chain, explicit network/epoch/bank identities, newline-completeness check, synchronous file writes/`fsync`, exclusive single-writer create lock and head-hash revision fence. Corrupt/torn/out-of-order logs **fail closed**; there is no automatic truncation or repair.
- [`test_transport_journal.node.mjs`](../tests/test_transport_journal.node.mjs): **25 Node tests** on ephemeral GitHub runners covering crashes before/during/after append and fsync, restart/replay, idempotent reservation/receipt, duplicate/conflicting transaction IDs, bank capacity, stale writer, lock retention, receipt mismatch, corrupted or truncated records and repeated sequential simulated transfers.
- Each Bulk member is capped at **200,000 ordinary item counts** in a fresh, initially empty **synthetic** bank set. These balances are *only* journal-model accounting; real preexisting inventories cannot be inferred from an empty genesis file.

## Proposed append-order protocol

| Journal phase | Legal successor | Recovery interpretation | What is never automatic |
| --- | --- | --- | --- |
| No record | `RESERVE` | No proven reservation; source authority still needs external verification | Starting a physical move |
| `RESERVE` durably written | `HANDOFF_INTENT` or source/destination-verified `ABORT` | `HOLD_PRE_HANDOFF` | Assuming source has/not moved without checking |
| `HANDOFF_INTENT` durably written, before any permitted physical write | `SETTLE` only with authoritative exact physical debit **and** credit evidence; otherwise **HOLD** | `HOLD_AMBIGUOUS_HANDOFF` | Repeating extraction, refunding counts, releasing space, guessing which block owns items |
| `SETTLE` durably written | No new transfer action for same transaction | `JOURNAL_SETTLED_NO_REPLAY` | Adding the same quantity again; replayed ACK is nonexecutable |
| `ABORT` durably written before intent | No future handoff for same transaction | `ABORTED_NO_MOVE` | Executing a previously canceled transfer |
| Missing, torn, tampered, reordered record; stale writer, unknown epoch or unresolved lock | **REFUSE/HOLD** | No trusted item/capacity reconstruction | Silent recovery, last-good truncation, auto-stealing locks |

A successful return from `HANDOFF_INTENT` is **only an offline precondition** for a future external adapter to attempt a physical move. After restart, an already-written intent *never* grants another physical-move permission. A simulated `SETTLE` requires matching transaction, receipt, network, epoch, source, destination, item ID, quantity, and true `sourceDebited`/`destinationCredited` flags.

## What the tests do *not* establish

**Crucial:** Receipt flags, source ownership proofs and original controller identity are **inputs supplied by the test**. The simulator does not authenticate them or touch an ItemStack. The SHA-256 chain detects accidental alteration, not an adversarial writer that can recompute the hashes. `fsync` on a local test file is **not** a transaction that spans Minecraft's inventory mutation and Bedrock's world save.

In particular, this is **not a proven exactly-once inventory transfer**. A crash between physically debiting one inventory and crediting another has no safe automatic resolution without separately verifiable custody evidence. The correct modeled outcome is quarantine/HOLD pending reconciliation; a transfer must not be retried or rolled back on assumptions. Intent replay cannot tell whether the physical move occurred.

The Node modules `node:fs`/`node:crypto` **are not available in the Minecraft Script API**. The `.lock` file mechanism is an offline single-process simulation; after a simulated process death the lock is intentionally left behind. Synthetic tests delete such orphan markers only after the process is known dead. No in-world lock, lease or operator repair command exists.

## Remaining gates before a playable candidate

1. Design a **Bedrock-supported durable journal** with tested write visibility/durability across BDS stop, chunk unload and crash boundaries, including checksummed world-data snapshot/record reconciliation and namespace/size limits.
2. Specify and test authenticated controller election, region/epoch leases and the destination-attachment topology; reject stale split/merge claims.
3. Define an authoritative, repeatable **source-debit/destination-credit receipt** based on actual server-side item inventories, including unknown/unloaded participants, and strict MR exclusion. A boolean from UI or arbitrary script code cannot be treated as proof.
4. Build a bounded recovery and quarantine protocol for ambiguous handoffs, with auditable reconciliation and no double count or loss. **If no safe reconciliation exists, do not implement the physical transfer yet.**
5. Only then review original dedicated Transporter/Bulk block art and adapter design, run offline tests, and ask for separate **LAB-only** install authorization. The old Hopper, Sorter, Collector, Receiver and safe direct MR route must remain intact.

**This milestone needs no new owner action, PG-08 rerun, additional server startup or experiment toggle.** The owner-confirmed PG-08 UI LAB GO and rollback `lab-5af88e18cff3` remain separate.
