/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {sourceReachability} from "./urce_152_route_model.js";
import {evaluateSourceScopedShadow} from "./urce_source_scoped_shadow.js";

/**
 * U1-F — audit completeness of SOURCE-RELEVANT item-claim observations.
 *
 * This is an offline/read-only PROOF CONTRACT, not a live enumerator.
 * U1-E's Hopper/Transporter snapshot cannot supply a closed-world witness:
 * its sourceClaimCoverage remains UNKNOWN even when its graph is OBSERVED.
 *
 * A FUTURE independent observer must produce enumeration and live
 * item-specific observations for every reachable claimant. In particular
 * there is NO claim of coverage from a Collector/Receiver registry alone.
 * Output COMPLETE_FOR_SHADOW is conditional on the supplied enumeration
 * evidence and NEVER authorizes custody, Q4 admission, fallback, or native
 * movement. No Bedrock import, native read, durable cache or writer.
 */

const claimKinds=new Set(["sorter","bulk","terminal"]);
const tiers=new Set(["filter","auto","wildcard","bulk","terminal"]);
const claimStates=new Set(["yes","no","unknown"]);
const evidenceForTier={
    filter:"filter_config",
    auto:"native_auto_seed",
    wildcard:"wildcard_config",
    bulk:"authoritative_bulk_account",
    terminal:"terminal_config"
};
const CLOSED=["networkBoundary","sorterDiscovery","destinationDiscovery",
    "externalNativeBoundary","itemIdentity"];
const fail=(reason,extra={})=>({
    status:"HOLD",reason,coverage:"UNKNOWN",claimResolution:"UNKNOWN",
    offers:[],unresolvedOwners:[],
    executePermitted:false,persistPermitted:false,
    mayAuthorizeCargo:false,...extra
});
function distinctStrings(values) {
    return Array.isArray(values) &&
        values.every(s=>typeof s==="string"&&s.length>0) &&
        new Set(values).size===values.length;
}

/**
 * projection: U1-E detached same-tick source graph. It is ALWAYS
 * nonauthoritative and does not itself include Sorters/other claimants.
 *
 * enumeration: separately witnessed, source-closed owner census. Its
 * closure flags and timestamp are caller-supplied facts, not validated
 * against Bedrock here; the current live runtime produces NONE.
 *
 * observations: exactly one live claim decision per required owner for
 * the specific item identity. Unseeded Auto must remain unknown.
 */
export function auditSourceClaimCoverage({
    projection,source,currentTick,enumeration,observations,itemClass="ordinary"
}) {
    if (!projection || projection.executePermitted!==false ||
        projection.sourceClaimCoverage!=="UNKNOWN" ||
        !projection.graph || projection.status!=="OBSERVED" ||
        !Number.isSafeInteger(currentTick) ||
        (itemClass!=="ordinary"&&itemClass!=="mr") ||
        typeof source!=="string" || !source.length) {
        return fail("source_graph_or_scope_unavailable");
    }
    const graph=projection.graph;
    if (graph.status!=="OK" || !graph.byId?.has(source)) {
        return fail("unknown_graph_source");
    }
    const reachable=sourceReachability(graph,source);
    if (reachable.status!=="OK" || reachable.unknown) {
        return fail("source_reachable_graph_incomplete");
    }
    // This is stronger than a filled-in registry array. No source in
    // the 1.5.8 live build can currently certify these closure flags.
    if (!enumeration || enumeration.source!==source ||
        enumeration.observedTick!==currentTick ||
        enumeration.kind!=="independent_item_claim_census" ||
        enumeration.status!=="CLOSED" ||
        !CLOSED.every(key=>enumeration.closure?.[key]===true)) {
        return fail("independent_enumeration_not_proven");
    }
    if (!distinctStrings(enumeration.claimantNodeIds) ||
        !Array.isArray(observations) ||
        observations.length!==enumeration.claimantNodeIds.length) {
        return fail("claimant_set_incomplete_or_duplicate");
    }
    const needed=[...reachable.reached.keys()].filter(id=>
        claimKinds.has(graph.byId.get(id).kind));
    const declared=new Set(enumeration.claimantNodeIds);
    if (declared.size!==needed.length ||
        needed.some(id=>!declared.has(id))) {
        return fail("claimant_membership_mismatch",{
            missingOwners:needed.filter(id=>!declared.has(id)),
            unexpectedOwners:[...declared].filter(id=>!needed.includes(id))
        });
    }
    const byId=new Map(),unresolved=[];
    for (const o of observations) {
        if (!o || typeof o.nodeId!=="string" || byId.has(o.nodeId) ||
            !declared.has(o.nodeId) || !tiers.has(o.tier) ||
            !claimStates.has(o.claim) ||
            o.observedTick!==currentTick) {
            return fail("claim_observation_missing_stale_or_invalid");
        }
        const node=graph.byId.get(o.nodeId);
        const acceptedTiers=node?.kind==="sorter"
            ?["filter","auto","wildcard"]
            :node?.kind==="bulk"?["bulk"]:["terminal"];
        if (!acceptedTiers.includes(o.tier) || node.loaded!==true ||
            !Number.isSafeInteger(o.bottomUp) || o.bottomUp<0 ||
            typeof o.columnId!=="string" || !o.columnId) {
            return fail("claim_owner_identity_invalid");
        }
        // An Auto NO is a live native seed rejection, never inferred from
        // a cached empty/full chest. Bulk has a separate authority source.
        if (o.claim!=="unknown" &&
            o.evidenceKind!==evidenceForTier[o.tier]) {
            return fail("claim_evidence_kind_unverified");
        }
        byId.set(o.nodeId,o);
        if (o.claim==="unknown")unresolved.push(o.nodeId);
    }
    if (byId.size!==needed.length) {
        return fail("missing_reachable_claim_observation");
    }
    const offers=needed.map(id=>{
        const o=byId.get(id);
        return {nodeId:id,tier:o.tier,claim:o.claim,
            columnId:o.columnId,bottomUp:o.bottomUp,
            // A matching fully verified graph path is still not native
            // admission. The source candidate planner remains shadow-only.
            verified:o.claim!=="unknown",
            liveAdmissionRequired:true};
    });
    return {
        status:"COMPLETE_FOR_SHADOW",
        reason:unresolved.length?"claim_values_still_unknown":
            "caller_supplied_closed_source_census",
        // COMPLETE is meaningful ONLY for this caller-supplied closed
        // enumerated graph, never as native world truth or write authority.
        coverage:"COMPLETE",
        claimResolution:unresolved.length?"UNKNOWN":"OBSERVED",
        offers,unresolvedOwners:unresolved,
        claimantCount:needed.length,
        executePermitted:false,persistPermitted:false,
        mayAuthorizeCargo:false
    };
}


/**
 * U1-F guarded bridge into U1-D's read-only route policy.
 * U1-D's raw coverage parameter is NOT evidence; only this separate
 * source-specific ledger can conditionally supply COMPLETE for a CLOSED
 * caller-provided model. All results remain NONEXECUTING.
 *
 * This function is not called by the main gameplay runtime.
 */
export function evaluateAuditedGovernedShadow({
    projection,source,currentTick,enumeration,observations,frame,
    itemClass="ordinary",existingBulkHome="unknown",
    applicableBulkState="unknown"
}) {
    const audit=auditSourceClaimCoverage({
        projection,source,currentTick,enumeration,observations,itemClass
    });
    if (audit.status!=="COMPLETE_FOR_SHADOW") {
        return {decision:"SHADOW_HOLD",reason:audit.reason,
            audit,executePermitted:false,persistPermitted:false};
    }
    if (frame?.captured!==true || !Array.isArray(frame.offers)) {
        return {decision:"SHADOW_HOLD",reason:"local_frame_not_verified",
            audit,executePermitted:false,persistPermitted:false};
    }
    const audited=new Map(audit.offers.map(o=>[o.nodeId,o]));
    const localIds=new Set();
    for (const local of frame.offers) {
        const proof=audited.get(local?.nodeId);
        if (!proof || localIds.has(local.nodeId) ||
            proof.tier!==local.tier ||
            (local.claim==="yes" && proof.claim==="no")) {
            return {decision:"SHADOW_HOLD",
                reason:"local_offer_not_reconciled",
                audit,executePermitted:false,persistPermitted:false};
        }
        localIds.add(local.nodeId);
    }
    const remote=audit.offers.filter(o=>!localIds.has(o.nodeId));
    const verifiedNodes=audit.offers.filter(o=>o.verified)
        .map(o=>o.nodeId);
    const shadow=evaluateSourceScopedShadow({
        scope:"GOVERNED_SOURCE",frame,graph:projection.graph,
        source,itemClass,coverage:audit.coverage,externalOffers:remote,
        verifiedNodes,existingBulkHome,applicableBulkState
    });
    return {...shadow,audit,executePermitted:false,
        persistPermitted:false};
}
