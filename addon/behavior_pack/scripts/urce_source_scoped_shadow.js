/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {planReadOnlyCandidates} from "./urce_152_route_model.js";

/**
 * U1-D: read-only, strictly nonexecuting policy differential boundary.
 *
 * A LOCAL stand-alone nonclaim is native Hopper transit, NOT managed HOLD.
 * Governed planning requires caller-supplied COMPLETE source-claim coverage,
 * a verified graph snapshot, and item-specific offers. The local offer frame
 * cannot itself prove a live route or native admission.
 *
 * This module contains no world API calls, Q4 reads, admission checks, writer,
 * journal, or scheduler. The current gameplay runtime does not call it yet.
 */
const denied=(decision,reason,extra={})=>({
    decision, reason, executePermitted:false, persistPermitted:false, ...extra
});
export function evaluateSourceScopedShadow({
    scope, frame, graph, source, itemClass="ordinary",
    coverage="UNKNOWN", externalOffers=[], verifiedNodes=[],
    existingBulkHome="unknown", applicableBulkState="unknown"
}) {
    if (!frame || frame.status==="UNKNOWN") {
        return denied("SHADOW_HOLD","local_observation_unavailable");
    }
    if (scope==="STANDALONE_LOCAL") {
        if (frame.targets?.length===0) {
            return denied("LOCAL_TRANSIT","no_local_claim");
        }
        if (!Array.isArray(frame.targets)) return denied("SHADOW_HOLD","invalid_local_frame");
        return denied("LOCAL_CANDIDATES","live_admission_still_required",{
            // No second policy; the local candidates are the already selected
            // legacy sequence, not a new source-global home declaration.
            candidateCount:frame.targets.length
        });
    }
    if (scope!=="GOVERNED_SOURCE") return denied("SHADOW_HOLD","unverified_scope");
    if (coverage!=="COMPLETE") return denied("SHADOW_HOLD","source_claim_coverage_unknown");
    if (frame.captured!==true || !Array.isArray(frame.offers)) {
        return denied("SHADOW_HOLD","local_offers_not_captured");
    }
    if (!graph || graph.status!=="OK" || typeof source!=="string" ||
        !Array.isArray(externalOffers) || !Array.isArray(verifiedNodes)) {
        return denied("SHADOW_HOLD","network_evidence_unavailable");
    }
    const verified=new Set(verifiedNodes);
    const local=frame.offers.map(o=>({
        ...o, verified:o.verified===true || verified.has(o.nodeId)
    }));
    // The verifiedNodes list is CALLER-SUPPLIED proof from an independently
    // observed route. It is intentionally not inferred from adjacency.
    // The resulting plan is still only a SHADOW; never give it to a writer.
    const result=planReadOnlyCandidates({
        graph,source,itemClass,
        offers:[...local,...externalOffers],
        existingBulkHome,applicableBulkState
    });
    return denied(
        result.status==="CANDIDATES" ? "SHADOW_CANDIDATES" :
        result.status==="INVALID" ? "SHADOW_INVALID" : "SHADOW_HOLD",
        result.reason,
        {plan:result}
    );
}
