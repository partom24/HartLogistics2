/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {orderedLocalSorterCandidates} from "./urce_column_local_decisions.js";

/**
 * U1-C — pure, non-authoritative column-to-route proposal bridge.
 *
 * The live caller always gets the exact previously accepted candidate order.
 * When captureOffers=false (default), optional shadow evidence is NOT
 * constructed. Shadow evidence may be built by tests / future opt-in diagnostics
 * but is never route or custody permission.
 *
 * activeSorters must already be live verified by the old caller, in bottom-up
 * column order. Filter matching is delegated to the existing special-item-aware
 * matcher; no cached/filter-by-type substitute is permitted here.
 */
export function prepareLocalColumnFrame({
    activeSorters, stack, modeOf, matches, columnId, captureOffers=false
}) {
    if (!Array.isArray(activeSorters) || !stack ||
        typeof modeOf !== "function" || typeof matches !== "function") {
        return {status:"UNKNOWN", reason:"invalid_local_observation",
            targets:[], offers:[], executePermitted:false};
    }

    // Keep existing exception behavior at the live call boundary.
    // A matcher failure may not be silently converted to an accepted transit.
    const targets = orderedLocalSorterCandidates(activeSorters, stack, modeOf, matches);

    // Fast live path: do not construct duplicate filter signatures, inventories,
    // ItemStack snapshots or governed graph proof on every cargo observation.
    if (!captureOffers) return {
        status:targets.length ? "LOCAL_CANDIDATES" : "NO_LOCAL_CLAIM",
        targets, offers:[], captured:false, executePermitted:false
    };

    // Diagnostic-only shadow offers; Auto seed is explicitly UNKNOWN until
    // its actual native destination is checked at admission, not guessed here.
    if (typeof columnId !== "string" || !columnId.length) return {
        status:"UNKNOWN", reason:"missing_column_identity",
        targets, offers:[], captured:false, executePermitted:false
    };
    const offers=[];
    for (const e of targets) {
        const ordinal = activeSorters.indexOf(e);
        if (ordinal < 0 || !Number.isSafeInteger(e?.x) ||
            !Number.isSafeInteger(e?.y) || !Number.isSafeInteger(e?.z) ||
            typeof e.d !== "string" || !e.d.length) {
            return {status:"UNKNOWN", reason:"sorter_identity_unverified",
                targets, offers:[], captured:false, executePermitted:false};
        }
        const mode = modeOf(e);
        if (!["filter","auto","wildcard"].includes(mode)) return {
            status:"UNKNOWN",reason:"sorter_mode_changed",
            targets,offers:[],captured:false,executePermitted:false
        };
        offers.push({
            nodeId:e.d+"|"+e.x+"|"+e.y+"|"+e.z,
            columnId, bottomUp:ordinal, tier:mode,
            claim:mode==="filter" ? "yes" : mode==="auto" ? "unknown" : "yes",
            // Reading an adjacent block is NOT graph/link verification.
            verified:false
        });
    }
    return {
        status:targets.length ? "LOCAL_CANDIDATES" : "NO_LOCAL_CLAIM",
        targets,offers,captured:true,executePermitted:false
    };
}
