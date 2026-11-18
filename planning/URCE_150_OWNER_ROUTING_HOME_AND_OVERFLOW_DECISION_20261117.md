# URCE-ADR-002 — Item homes, Bulk Storage, and true Wildcard overflow

**Decision owner:** Hart Logistics owner, November 17, 2026.  
**Status:** **Owner clarified / accepted routing intent; planning contract only**, not a runtime or release implementation.  
**Applies to:** Explicitly governed URCE networks. Existing standalone Hopper→Sorter networks preserve 1.4.2 Filter → seeded Auto → Wildcard behavior, even when they are upgraded to the 1.5 add-on without joining a governed network.  
**Supersedes:** The historical blanket policy "Wildcard only after all usable Bulk is full" **for genuinely unclaimed identities**, and the misleading interpretation "always run Filter → Auto → Wildcard → Bulk". Prior general Bulk-before-Wildcard rules remain applicable to identities already claimed by Filter/Auto or held in Bulk.

## 2026-11-18 physical bank and controller follow-up (policy unchanged)

The owner intends the **last transport bank to contain many Wildcard Sorters**, serving genuinely unclaimed identities and the existing **verified-full Bulk exception**. This is a destination-placement intention, **not** permission to divert claimed items to Wildcard before checking authoritative Bulk space or to treat an unloaded bank as full.

There is a distinct **Bulk Storage** block, **not a Bulk Sorter**. Previously, the first Bulk Storage placed in a bank became the Bulk Controller and controllers negotiated which items to pass onward. Those were historical implementations, **not product requirements**; neither one controller per bank nor a named routing **region** is owner-mandated. Engineering may prove a controller-free design or another authority arrangement. Keep all existing ownership, capacity, HOLD and native-custody obligations. See the [OSI-inspired multi-bank research and new-chat takeover](URCE_150_OSI_MULTIBANK_ROUTING_HANDOFF_20261118.md).

## Owner's actual clarification

> If there is already an item in Bulk Storage, it should not go to Wildcard storage. If an item that's filtered or Auto-sorted has a full chest, and no other valid Sorters can claim it, it should only go to Bulk Storage. Wildcard is reserved for something that legitimately has no other home. The only exception is if the Bulk Storage bank is full, then it should overflow into Wildcard.

## Terms that matter

- **Claim:** A configured matching Filter or an eligible, **live-seeded Auto** Sorter recognizes the incoming item's routing identity. A Sorter can claim an identity **even if its destination is physically full**. Bypass or an invalid Filter is not a claim.
- **Existing Bulk home:** The applicable governed bank/region's **authoritative ordinary-item account already holds a positive balance of the same proven lossless identity**, even if local Filter/Auto is presently blocked. This must not be inferred from stale, unloaded, disputed or merely local display counters.
- **Accepting destination:** A claimed Filter/Auto endpoint that also passes live block, redstone, source, native exact-item and capacity checks, including real partial stacks. Claims are not proofs of free space.
- **Bank confirmed full:** All eligible ordinary Bulk capacity for the applicable bank/region is verified exhausted under current ownership/epoch rules. **Unloaded/unknown capacity is not full.**
- **Unclaimed item:** No valid Filter or live-seeded Auto claims the item, and no confirmed existing Bulk home for its identity. This is the normal Wildcard class.
- **Metadata-rich item:** Not bucketizable merely because it has a typeId; its original native ItemStack must remain under proven MR custody and backpressure. Do not interpret ordinary Bulk capacity as space for MR.

## Governed ordinary-item routing decision

1. **Try valid matching Filter destinations**, then **valid live-seeded Auto destinations**, retaining established local bottom-to-top ordering and allowing all eligible destinations to participate after a full/blocked earlier choice.
2. **If a Filter/Auto accepted the item, the transfer is complete only for the moved quantity.** Continue routing the remaining quantity as the baseline's budgets and custody rules permit.
3. If **no Filter/Auto accepts the remaining quantity**, ask whether it has an established home: (a) is it **claimed** by an eligible Filter/Auto but all relevant destinations are blocked/full, **or** (b) does the applicable authoritative **Bulk bank already contain that same ordinary identity**?
   - **Yes:** send the remainder to **Bulk Storage** if verified capacity exists; **do not use Wildcard merely because it can accept the item**.
   - **Applicable Bulk bank authoritatively full:** the exception permits **Wildcard overflow**, subject to normal Wildcard live capacity and custody checks.
   - **Bulk authority, route, or capacity unknown:** **HOLD** the item safely and reconcile; never label unknown as full to enable Wildcard.
4. If **neither a Filter/Auto claim nor an established Bulk home exists**, the item is legitimately **unclaimed**; route to a valid **Wildcard** candidate without first requiring Bulk to fill.
5. If the selected outlet is absent, unavailable or full and no permitted fallback exists, leave the item in safe custody. Do not introduce a hidden forced Bulk/wildcard conversion.

**This is a conditional home-and-overflow rule, not an unconditional four-step priority list.**

## Truth table for source-only and later native tests

| Filter or Auto claim? | Accepting Filter/Auto? | Same identity already in authoritative Bulk? | Applicable Bulk status | Expected next decision |
| --- | --- | --- | --- | --- |
| Yes | Yes | Either | Any | Filter/Auto native destination |
| Yes | No, all blocked/full | Either | Verified room | Bulk Storage |
| Yes | No | Either | **Verified full** | Wildcard overflow if it accepts |
| Yes | No | Either | Unknown/unloaded | HOLD, not Wildcard |
| No | No | **Yes** | Verified room | Continue existing Bulk home |
| No | No | **Yes** | Verified full | Wildcard overflow |
| No | No | **Yes** | Unknown/unloaded | HOLD |
| No | No | **No** | Any | Legitimately unclaimed → Wildcard if valid |
| No | No | Unknown/disputed | Unknown | HOLD while identity/account ownership is reconciled |

A matching Filter/Auto that is powered, unloaded, missing, or unavailable requires clear eligibility/failure semantics before it is used to prove that the item has **no other home**. Do not silently treat an unknown remote claim as proven absent when that could break governed routing or custody.

### Examples

- **Cobblestone Filter chest full:** another matching Filter/Auto is attempted first; if none accepts, store cobblestone in Bulk. Do **not** send it to Wildcard while usable Bulk capacity exists.
- **Cobblestone already in Bulk, no accepting Filter/Auto:** keep adding the same ordinary identity to Bulk rather than Wildcard.
- **New identity not recognized by any Filter/Auto and not in Bulk:** it is legitimately unclaimed and may go to Wildcard even if Bulk has free room.
- **Cobblestone eligible for Bulk but all applicable Bulk storage is verified full:** Wildcard may accept it as the explicit exception.
- **Bulk bank unloaded or conflicting:** never infer exhausted space; retain cargo safely for reconciliation.

## Early-exit/performance implication

- The cheap **claim** check is based on configured Filter or live Auto-seed policy, not a 54-slot capacity ledger. Try eligible player-facing Sorters first; a failed admission can still establish that the identity is claimed.
- Only after no Filter/Auto has accepted the remainder should URCE query the applicable **authoritative Bulk balance/capacity** or decide Wildcard eligibility.
- **Unclaimed** identities with verified absence of Filter/Auto claims and existing Bulk homes need no Bulk **capacity scan** before Wildcard; however proving absence of an existing Bulk home may still require authoritative controller lookup. Do not turn this into speculative local cache truth.
- Preserve exact ItemStack and native live admissions; a routing claim never authorizes physical mutation, serialization, queue commit or custody transfer.

## Compatibility and unresolved implementation questions

- Do not change 1.4.2's local fallback, its Q4 journals, output Hopper path or vanilla Hopper behavior.
- The **scope of the authoritative Bulk home** (one bank versus network-wide item balance) and handling temporarily unavailable **remote** Filter/Auto claims require a separate governance specification. Until proven, unresolved route ownership HOLDs rather than guessing.
- Native MR items stay in native custody and should not be forced through ordinary Bulk buckets or an unsafe Wildcard ItemStack reconstruction; the exact native MR outlet awaits its independent endpoint proof.
- Retain deterministic controller election, verified region membership and split/merge recovery, but do not implement a new worldwide scan or stale item-type cache solely for Wildcard classification.
- No Q5 intermediate queue, no direct Transporter-to-chest output and no existing saved-world migration is authorized by this decision.

**Implementation gate:** Differential source-only cases must prove Filter/Auto claim **independent of capacity**, existing Bulk-item precedence over Wildcard, genuine unclaimed Wildcard, proven-full Bulk exception, unknown/unloaded HOLD, partial stacks, and preservation of local legacy routing before any URCE gameplay integration.
