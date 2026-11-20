/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {buildReadOnlyGraph} from "./urce_152_route_model.js";

/**
 * U1-E: project an EXISTING, same-tick, source-observed Hopper/Transporter
 * link snapshot into a detached, read-only, endpoint-level shadow graph.
 *
 * No native getBlock, extra graph observation, registry update, queue read,
 * storage admission, Q4/journal writes or custody permission.
 *
 * CRITICAL: observed native/visual graph "coverageComplete" is false.
 * This projection CANNOT prove complete item claims or global topology.
 * A caller must independently verify source-specific item-claim coverage
 * before U1-D candidate planning; even then both remain NONEXECUTING.
 */
const refuse=(reason,extra={})=>({
    status:"HOLD",reason,graph:undefined,
    sourceClaimCoverage:"UNKNOWN",worldCoverage:"UNKNOWN",
    mayAuthorizeCargo:false,executePermitted:false,persistPermitted:false,
    ...extra
});
export function projectObservedShadowGraph(observation) {
    if (!observation || observation.status!=="OBSERVED") {
        return refuse("snapshot_not_available");
    }
    const {native,visual,normalized}=observation;
    if (!native?.graph || !visual ||
        !Array.isArray(native.edges) || !Array.isArray(native.unknown) ||
        !Array.isArray(visual.components) || !Array.isArray(visual.unresolved)) {
        return refuse("incomplete_snapshot_shapes");
    }
    if (native.status==="CYCLE" || native.graph.status==="CYCLE") {
        return refuse("verified_native_cycle",{status:"CYCLE"});
    }
    if (native.graph.status!=="OK" || visual.status==="INVALID") {
        return refuse("invalid_native_or_visual_observation");
    }
    if (!native.graph.byId || !(native.graph.byId instanceof Map)) {
        return refuse("invalid_native_graph");
    }
    // Never give a caller mutable references to the live guard's own
    // observation; a diagnostic caller could otherwise contaminate later
    // safety decisions within this same tick.
    const nodes=[...native.graph.byId.values()].map(n=>({...n}));
    const links=native.edges.map(e=>({...e}));
    const uncertain=[];
    if (Array.isArray(normalized?.conflicts) && normalized.conflicts.length) {
        uncertain.push("endpoint_registry_conflict");
    }
    if (native.unknown.length)uncertain.push("native_boundary_unknown");
    if (visual.status==="INCOMPLETE" || visual.unresolved.length) {
        uncertain.push("visual_boundary_unknown");
    }

    for (const component of visual.components) {
        if (!Array.isArray(component.receiverIds) ||
            !Array.isArray(component.collectorIds)) {
            return refuse("invalid_component_endpoints");
        }
        if (component.classification==="CANDIDATE_SINGLE_BANK" &&
            component.unknown!==true && component.branching!==true &&
            component.receiverIds.length===1 &&
            component.collectorIds.length===1) {
            // Exactly the same logical direction used by the active link
            // gate. This is a bank-intent observation, NOT physical custody.
            links.push({
                from:component.receiverIds[0],to:component.collectorIds[0],
                kind:"local",verified:true,loaded:true,
                provenance:"managed_bank_intent_shadow"
            });
        } else {
            // Unclassified/ambiguous branches cannot be promoted into
            // verified positive paths or negative "no claim" conclusions.
            if (component.receiverIds.length && component.collectorIds.length) {
                uncertain.push("ambiguous_bank_component");
            }
            for (const receiver of component.receiverIds) {
                for (const collector of component.collectorIds) {
                    links.push({from:receiver,to:collector,kind:"local",
                        verified:false,loaded:false,
                        provenance:"unverified_bank_shadow"});
                }
            }
        }
    }
    const graph=buildReadOnlyGraph(nodes,links);
    if (graph.status==="CYCLE") {
        return refuse("verified_composed_cycle",{status:"CYCLE"});
    }
    if (graph.status!=="OK") {
        return refuse("invalid_composed_graph");
    }
    return {
        status:uncertain.length ? "PARTIAL" : "OBSERVED",
        reason:uncertain.length ? "observer_coverage_incomplete" :
            "observed_endpoint_graph_only",
        graph,issues:[...new Set(uncertain)],
        // Even a clean, fully loaded endpoint graph does not cover every
        // possible Sorter, chest, native/foreign or unobserved item claim.
        sourceClaimCoverage:"UNKNOWN",worldCoverage:"UNKNOWN",
        mayAuthorizeCargo:false,executePermitted:false,
        persistPermitted:false
    };
}
