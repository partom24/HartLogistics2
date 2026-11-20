/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Strict source-local positive outlet for the FIRST governed gameplay lane.
 *
 * A Receiver discharges only into its verified downward-facing native Hopper,
 * which is also the live source immediately above one complete registered
 * vertical Sorter column, and every non-Bypass Sorter outputs to native storage.
 * Native directional flow is decisive; merely adjacent passive storage,
 * parallel registered columns, or native Hoppers do not imply an outgoing edge.
 * This is an exclusively CLOSED local native outlet, NOT a generic network
 * discovery algorithm. Unknown side routes, foreign inventory or incomplete
 * registry/Bedrock observations HOLD. No global claim absence is inferred from
 * the Collector/Receiver graph.
 *
 * All readers are synchronous per-attempt injections. No Bedrock imports,
 * durable snapshots, inventory mutation, Q4 state, new journal or writers.
 * A positive result is never a custody receipt. Only the original Q4 dequeue
 * and original physical Sorter writer can move the item.
 */
const HOPPER="minecraft:hopper", RECEIVER="hartsorter:receiver";
const SORTER="hartsorter:sorter";
const HART_SIDE=new Set(["hartsorter:transporter","hartsorter:collector",
  "hartsorter:receiver","hartsorter:bulk_storage",SORTER,HOPPER]);
const OFFSETS=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}];
const valid=e=>!!e&&typeof e.d==="string"&&e.d.length>0&&
  [e.x,e.y,e.z].every(Number.isSafeInteger);
const fail=(reason,extra={})=>({status:"HOLD",reason,executePermitted:false,
  persistPermitted:false,mayAuthorizeCargo:false,...extra});
function observed(reader,d,p) {
  try {
    const b=reader(d,p);
    return b&&typeof b.typeId==="string"?b:undefined;
  } catch (_) { return undefined; }
}
function safeState(block,state) {
  try { return block?.permutation?.getState(state); }
  catch (_) { return undefined; }
}

/** Only a full live, exact, local physical run permits a directed terminal
 * interpretation. Both the physical Sorters and local registry must agree.
 * This does NOT prove arbitrary external addons cannot mutate inventories.
 */
export function inspectDirectSorterOutlet({receiver,readBlock,columns,
  modeOf,observeDestination,maxHeight=64}) {
  if(!valid(receiver)||typeof readBlock!=="function"||
     !Array.isArray(columns)||typeof modeOf!=="function"||
     typeof observeDestination!=="function"||
     !Number.isSafeInteger(maxHeight)||maxHeight<1||maxHeight>128)
    return fail("invalid_direct_outlet_request");
  const d=receiver.d,{x,y,z}=receiver;
  const r=observed(readBlock,d,{x,y,z});
  if(r?.typeId!==RECEIVER)return fail("receiver_unavailable");
  const hopper=observed(readBlock,d,{x,y:y-1,z});
  if(hopper?.typeId!==HOPPER)return fail("output_hopper_unavailable");
  const direction=safeState(hopper,"facing_direction");
  if(direction!==0&&direction!==1)return fail("output_hopper_not_downward");
  const locked=safeState(hopper,"toggle_bit");
  if(locked!==false&&locked!==0)return fail("output_hopper_locked_or_unknown");

  // Observe ADJACENT blocks for unknown side extraction, not for mere
  // proximity. A downward Hopper has exactly one native output: (x,y-2,z).
  // A vanilla chest/barrel beside that Hopper cannot steal its cargo; a
  // second Hopper next to it also cannot pull horizontally from it. These
  // are valid tightly packed player storage layouts and adjacent columns.
  // Side Hoppers with observable direction may supply items INTO this bus,
  // but cannot turn its downward output into a sideward route. The existing
  // Q4 discharge checks its Hopper is empty before credit and rechecks the
  // live home each time. Unknown third-party inventories with potentially
  // active side extraction still HOLD; no claim of arbitrary mod compatibility.
  for(const h of [y,y-1])for(const side of OFFSETS) {
    const near=observed(readBlock,d,{x:x+side.x,y:h,z:z+side.z});
    if(!near)return fail("side_block_unavailable");
    if(near.typeId===HOPPER) {
      const nativeDirection=safeState(near,"facing_direction");
      if(![0,1,2,3,4,5].includes(nativeDirection))
        return fail("adjacent_hopper_direction_unknown");
      continue;
    }
    if(HART_SIDE.has(near.typeId))continue;
    try {
      const container=near.getComponent?.("minecraft:inventory")?.container;
      // Vanilla side inventories are passive relative to a downward Hopper.
      // Unknown foreign inventory side effects cannot be ruled out.
      if(container&&!near.typeId.startsWith("minecraft:"))
        return fail("foreign_side_inventory_boundary");
    } catch (_) {return fail("side_inventory_unverified");}
  }
  const matches=columns.filter(col=>col?.d===d&&
    col?.source?.x===x&&col?.source?.y===y-1&&col?.source?.z===z);
  if(matches.length!==1)return fail("source_column_not_unique");
  const column=matches[0],sorters=column.sorters;
  if(!Array.isArray(sorters)||!sorters.length||sorters.length>maxHeight)
    return fail("source_column_unbounded");
  const top=sorters[sorters.length-1];
  if(top.y!==y-2)return fail("sorter_not_directly_below_hopper");
  const owners=[];
  for(let i=0;i<sorters.length;i++) {
    const e=sorters[i];
    if(!valid(e)||e.d!==d||e.x!==x||e.z!==z||
       (i&&e.y!==sorters[i-1].y+1))
      return fail("sorter_registry_column_inconsistent");
    const block=observed(readBlock,d,{x,y:e.y,z});
    if(block?.typeId!==SORTER)return fail("sorter_block_not_verified");
    let mode;
    try {mode=modeOf(e);}catch(_){return fail("sorter_mode_unavailable");}
    if(!["filter","auto","wildcard","bypass"].includes(mode))
      return fail("unknown_sorter_mode");
    if(mode==="bypass")continue;
    let dest;
    try {dest=observeDestination(e,block);}
    catch(_){return fail("sorter_output_unavailable");}
    if(dest?.kind!=="storage"||!dest.block)
      return fail("sorter_output_not_native_storage");
    // Native Hoppers below a destination chest can extract items AFTER the
    // Sorter's legitimate credit and feed another bank. Without inspecting
    // the destination's extraction side, this is not a closed local home.
    const targetPos=dest.block.location;
    if(!targetPos||![targetPos.x,targetPos.y,targetPos.z].every(Number.isSafeInteger))
      return fail("sorter_storage_location_unverified");
    const underStorage=observed(readBlock,d,{
      x:targetPos.x,y:targetPos.y-1,z:targetPos.z
    });
    if(!underStorage)return fail("storage_extraction_boundary_unknown");
    if(underStorage.typeId===HOPPER)
      return fail("storage_hopper_extractor_present");
    owners.push({entry:e,block,destination:dest.block,mode,
      bottomUp:i});
  }
  // A hidden, unregistered Sorter below the declared run invalidates its
  // item-claim closure; a non-Sorter block below is not an output from Hopper.
  const below=observed(readBlock,d,{x,y:sorters[0].y-1,z});
  if(!below||below.typeId===SORTER)return fail("sorter_run_boundary_unknown");
  if(!owners.length)return fail("no_active_storage_claimants");
  return {status:"CLOSED_DIRECT_OUTLET",receiverId:receiver.id,
    outputBlock:hopper,owners,sourceColumn:column,
    executePermitted:false,persistPermitted:false,mayAuthorizeCargo:false};
}

/**
 * A live Q4 head item can be offered to already physically witnessed storage.
 * The home is a positive Filter/Auto claim with current native admission, OR
 * an unclaimed Wildcard; claimed/full without proved Bulk exhaustion HOLDS.
 * An unknown live Auto seed must never be normalized to "no".
 *
 * The caller must separately prove Receiver Q4 head, native Hopper capacity,
 * durable journal preconditions, and exact source identity inside its writer.
 */
export function inspectDirectItemHome({outlet,item,modeOf,matches,
  powered,inventory,autoSeed,admit}) {
  if(outlet?.status!=="CLOSED_DIRECT_OUTLET"||!item||
     typeof matches!=="function"||typeof powered!=="function"||
     typeof inventory!=="function"||typeof autoSeed!=="function"||
     typeof admit!=="function")
    return fail("unverified_direct_home_input");
  // Metadata-rich native carriers are NOT enabled by a count-only Q4 route.
  if(!Number.isInteger(item.maxAmount)||item.maxAmount<=1)
    return fail("native_metadata_custody_required");
  const owners=outlet.owners;
  const filters=[],autos=[],wildcards=[];
  let claimed=false,uncertain=false;
  for(const owner of owners) {
    if(owner.mode==="filter") {
      let hit;
      try {hit=!!(owner.entry.f&&matches(item,owner.entry.f));}
      catch (_) {return fail("filter_identity_unavailable");}
      if(hit){claimed=true;filters.push(owner);}
    } else if(owner.mode==="auto") autos.push(owner);
    else if(owner.mode==="wildcard")wildcards.push(owner);
  }
  function currentAdmission(owner,seedRequired=false) {
    let c;
    try {
      if(powered(owner.block))return {status:"BLOCKED"};
      c=inventory(owner.destination);
      if(!c?.isValid)return {status:"UNKNOWN"};
      if(seedRequired){
        const s=autoSeed(c,item);
        if(s===undefined)return {status:"UNKNOWN"};
        if(s===false)return {status:"NO_SEED"};
      }
      const slot=admit(c,item,seedRequired);
      return slot ? {status:"ADMIT",slot} : {status:"NO_SPACE"};
    } catch (_) {return {status:"UNKNOWN"};}
  }
  for(const f of filters) {
    const a=currentAdmission(f);
    if(a.status==="ADMIT")return {status:"HOME_OBSERVED",
      tier:"filter",owner:f.entry,slot:a.slot,executePermitted:false,
      mayAuthorizeCargo:false};
    if(a.status==="UNKNOWN")uncertain=true;
  }
  // An Auto claim exists from live seed independently of native capacity.
  // Probe every Auto before considering a claimed-item fallback.
  for(const a of autos) {
    const found=currentAdmission(a,true);
    if(found.status==="ADMIT")return {status:"HOME_OBSERVED",
      tier:"auto",owner:a.entry,slot:found.slot,executePermitted:false,
      mayAuthorizeCargo:false};
    if(found.status==="UNKNOWN")uncertain=true;
    if(found.status==="NO_SPACE"||found.status==="BLOCKED") {
      // A powered Sorter still has a configured Auto claim; its native seed
      // could not be independently cleared by lack of current capacity.
      claimed=true;
    }
  }
  if(uncertain)return fail("claim_or_native_capacity_unknown");
  if(claimed)return fail("claimed_home_full_bulk_authority_unknown");
  // The physically exclusive local path cannot reach Bulk or terminal.
  // No Filter/Auto claim exists here; a native Wildcard is legitimate.
  for(const w of wildcards) {
    const a=currentAdmission(w);
    if(a.status==="ADMIT")return {status:"HOME_OBSERVED",
      tier:"wildcard",owner:w.entry,slot:a.slot,executePermitted:false,
      mayAuthorizeCargo:false};
    if(a.status==="UNKNOWN")return fail("wildcard_capacity_unknown");
  }
  return fail("no_eligible_direct_native_home");
}
