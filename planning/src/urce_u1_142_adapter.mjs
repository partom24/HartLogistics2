/**
 * URCE U1 read-only bridge for a source-specific 1.4.2 Sorter registry snapshot.
 * No Bedrock imports. Native stack/filter semantics are injected from the
 * *actual* baseline matchesFilter function by the differential tests.
 *
 * Snapshot authority is deliberately limited: mode/filter/route hints from an
 * observed registry are NOT live Sorter/block/chest capacity or custody proofs.
 */
import {sourceReachability, planReadOnlyCandidates} from "./urce_u1_route_model.mjs";

const MODES = new Set(["filter", "auto", "wildcard", "bypass"]);

export function projectObservedSorterCandidates({
  graph, source, stack, columns, filterMatches, autoSeedClaim,
  itemClass, existingBulkHome, applicableBulkState, extras = []
}) {
  if (typeof filterMatches !== "function" || typeof autoSeedClaim !== "function" ||
      !Array.isArray(columns) || !Array.isArray(extras) ||
      !stack || typeof stack.typeId !== "string") {
    return {status:"INVALID",reason:"invalid_snapshot",stages:[]};
  }
  const reached=sourceReachability(graph,source);
  if(reached.status!=="OK") {
    return {status:"INVALID",reason:"unknown_source",stages:[]};
  }
  const offers=[];
  let examinedColumns=0, skippedUnreachableColumns=0, examinedEntries=0;
  for(const column of columns) {
    if(!column || typeof column.id!=="string" ||
       !Array.isArray(column.sorters)) {
      return {status:"INVALID",reason:"invalid_column",stages:[]};
    }
    // The source-specific graph is a cheap conservative gate. No native
    // destination inspection, Auto seed read or item movement happens here.
    const connected=column.sorters.some(e=>e && reached.reached.has(e.nodeId));
    if(!connected){skippedUnreachableColumns++;continue;}
    examinedColumns++;
    for(let index=0;index<column.sorters.length;index++) {
      const e=column.sorters[index];
      if(!e || typeof e.nodeId!=="string" || !MODES.has(e.mode))
        return {status:"INVALID",reason:"invalid_sorter_entry",stages:[]};
      if(!reached.reached.has(e.nodeId) || e.mode==="bypass")continue;
      examinedEntries++;
      if(e.mode==="filter") {
        // Reuse 1.4.2 matchesFilter when called from the current-source test.
        if(!filterMatches(stack,e.filter))continue;
        offers.push({nodeId:e.nodeId,tier:"filter",claim:"yes",
          verified:e.verified===true,columnId:column.id,bottomUp:index,
          estimatedCost:column.estimatedCost});
      } else if(e.mode==="auto") {
        // This is EXPLICIT untrusted proof from a caller's live observation.
        // Do not synthesize "yes" from a stale item type/mode or guess that
        // some chest in an unloaded bank must be empty/seeded.
        const seed=autoSeedClaim(e,stack);
        if(!["yes","no","unknown"].includes(seed))
          return {status:"INVALID",reason:"invalid_auto_seed_claim",stages:[]};
        offers.push({nodeId:e.nodeId,tier:"auto",claim:seed,
          verified:e.verified===true,columnId:column.id,bottomUp:index,
          estimatedCost:column.estimatedCost});
      } else {
        offers.push({nodeId:e.nodeId,tier:"wildcard",
          verified:e.verified===true,columnId:column.id,bottomUp:index,
          estimatedCost:column.estimatedCost});
      }
    }
  }
  const result=planReadOnlyCandidates({graph,source,itemClass,
    offers:[...offers,...extras],existingBulkHome,applicableBulkState});
  return {...result,inspection:{examinedColumns,skippedUnreachableColumns,
    examinedEntries,emittedOffers:offers.length}};
}
