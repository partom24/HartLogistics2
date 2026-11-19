/**
 * U1 actual-source differential boundary for 1.4.2.
 * This executes the EXACT baseline matchesFilter and findAcceptSlot bodies in
 * a native-shaped mock environment; U1 remains source-only and never writes.
 *
 * This is a counterfactual source-level *network* measurement, NOT proof that
 * the old local P4e per-column processColumn scanned remote banks.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {buildReadOnlyGraph} from "../src/urce_u1_route_model.mjs";
import {projectObservedSorterCandidates} from "../src/urce_u1_142_adapter.mjs";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SOURCE=fs.readFileSync(path.join(ROOT,"addon/behavior_pack/scripts/main.js"),"utf8");
assert.equal(createHash("sha256").update(SOURCE).digest("hex"),
  "2183cc3de4d60c9895305e41612644a75360b2baba44403c2387e3679cdc4411",
  "Source differential tests must retain exact 1.4.2 P4e engine");
function extract(name) {
  const start=SOURCE.indexOf("function "+name+"(");
  assert.ok(start>=0,"missing baseline "+name);
  const brace=SOURCE.indexOf("{",start);
  let depth=0,quote="",escaped=false,line=false,comment=false;
  for(let i=brace;i<SOURCE.length;i++){
    const c=SOURCE[i],d=SOURCE[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(comment){if(c==="*"&&d==="/"){comment=false;i++;}continue;}
    if(quote){if(escaped){escaped=false;continue;}
      if(c==="\\"){escaped=true;continue;}if(c===quote)quote="";continue;}
    if(c==="/"&&d==="/"){line=true;continue;}
    if(c==="/"&&d==="*"){comment=true;i++;continue;}
    if(c==="'"||c==='"'||c.charCodeAt(0)===96){quote=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0)return SOURCE.slice(start,i+1);
  }
  throw new Error("unclosed "+name);
}
function compile(name,env){
 return vm.runInNewContext(extract(name)+"\n"+name,env,{timeout:3000,filename:"1.4.2:"+name});
}
const match=compile("matchesFilter",{
  POTION_ITEM_IDS:new Set(),potionIdentity:()=>undefined,enchantments:()=>[]
});
const admissions={calls:0,slotReads:0,writes:0};
const admission=compile("findAcceptSlot",{
  enchantments:()=>[],POTION_ITEM_IDS:new Set()
});
function chest(typeId,qty=64,slots=54) {
  let items=Array.from({length:slots},()=>({typeId,amount:qty,maxAmount:64}));
  return {isValid:true,get size(){return items.length;},
    get emptySlotsCount(){return items.filter(v=>!v).length;},
    firstItem(){const i=items.findIndex(Boolean);return i<0?undefined:i;},
    firstEmptySlot(){const i=items.findIndex(v=>!v);return i<0?undefined:i;},
    getSlot(i){admissions.slotReads++;const v=items[i];return {
      hasItem(){return !!v;},get typeId(){return v?.typeId;},
      get amount(){return v?.amount;},get maxAmount(){return v?.maxAmount;},
      getItem(){return v;},isStackableWith(s){return v.typeId===s.typeId&&v.meta===s.meta;}
    };},
    setItem(){admissions.writes++;throw Error("Planner must never perform item writes");}
  };
}
const N=(id,kind="sorter",loaded=true)=>({id,kind,loaded});
const E=(from,to,extra={})=>({from,to,kind:"transporter",verified:true,loaded:true,...extra});
const F=(nodeId,mode,filter,verified=true)=>({nodeId,mode,filter,verified});
function fixture({remote=true,otherUnknown=false}={}) {
 const nodes=[N("src","source"),N("a"),N("b"),N("w")];
 const links=[E("src","a"),E("src","b"),E("src","w")];
 if(remote){nodes.push(N("remote"));links.push(E("remote","remote-absent"));}
 if(otherUnknown){nodes.push(N("u","transporter",false));links.push(E("src","u"));}
 return {nodes,links};
}
function route(nodes,links,columns,extras=[],attrs={}) {
 return projectObservedSorterCandidates({graph:buildReadOnlyGraph(nodes,links),
  source:"src",stack:{typeId:attrs.itemId??"mod:unanticipated_item",amount:16,maxAmount:64},
  columns,filterMatches:match,autoSeedClaim:()=>attrs.autoSeed??"no",
  itemClass:attrs.itemClass??"ordinary",
  existingBulkHome:attrs.existingBulkHome??"no",
  applicableBulkState:attrs.bulkState??"open",extras});
}
test("SRC-01 source is unmodified and two real native source functions execute",()=>{
 assert.match(extract("findAcceptSlot"),/compatible-partial-before-empty/);
 assert.equal(match({typeId:"unusual:tool"},{match:{typeId:"unusual:tool"}}),true);
 assert.equal(match({typeId:"unusual:tool"},{match:{typeId:"unusual:other"}}),false);
 assert.equal(admission(chest("unusual:tool"),{typeId:"unusual:tool",amount:1,maxAmount:64}),undefined);
});
test("SRC-02 reachable Filter and real filter semantics exclude unmatched remote item",()=>{
 const nodes=[N("src","source"),N("filter"),N("wild"),N("far")];
 const links=[E("src","filter"),E("src","wild")];
 const cols=[
   {id:"near",sorters:[F("filter","filter",{match:{typeId:"mod:x"}})]},
   {id:"far",sorters:[F("far","filter",{match:{typeId:"mod:x"}})]},
   {id:"w",sorters:[F("wild","wildcard")]}
 ];
 const r=route(nodes,links,cols,[],{itemId:"mod:x"});
 assert.equal(r.status,"CANDIDATES");
 assert.deepEqual(r.stages.map(s=>s.tier),["filter","bulk"].filter(t=>t!=="bulk"));
 assert.equal(r.inspection.skippedUnreachableColumns,1);
 assert.equal(r.stages[0].candidates[0].nodeId,"filter");
 assert.equal(admissions.writes,0);
});
test("SRC-03 actual native full-chest admission stays live, no planner authority",()=>{
 admissions.calls=0;admissions.slotReads=0;
 const nodes=[N("src","source"),N("f")];
 const r=route(nodes,[E("src","f")],[{id:"col",sorters:[
   F("f","filter",{match:{typeId:"mod:odd_item"}})
 ]}],[],{itemId:"mod:odd_item"});
 assert.equal(r.stages[0].candidates[0].liveAdmissionRequired,true);
 const slot=admission(chest("mod:odd_item"),{typeId:"mod:odd_item",amount:16,maxAmount:64,meta:""});
 assert.equal(slot,undefined);
 assert.ok(admissions.slotReads>0);
 assert.equal(admissions.writes,0);
});
test("SRC-04 real 1.4.2 native admission discovers compatible partial on full chest",()=>{
 admissions.slotReads=0;
 const container=chest("mod:odd_item",64,54);
 const part=chest("mod:odd_item",8,1);
 const item={typeId:"mod:odd_item",amount:16,maxAmount:64};
 const candidate=admission(part,item);
 assert.equal(candidate.room,56);
 assert.equal(candidate.slot,0);
 assert.equal(admissions.writes,0);
});
test("SRC-05 no known Auto seed does not justify Auto or Wildcard speculative routing",()=>{
 const nodes=[N("src","source"),N("auto"),N("wild")];
 const x=route(nodes,[E("src","auto"),E("src","wild")],[
  {id:"auto",sorters:[F("auto","auto")]},
  {id:"wild",sorters:[F("wild","wildcard")]}
 ],[],{autoSeed:"unknown"});
 assert.equal(x.status,"HOLD");
 assert.equal(x.reason,"claim_or_topology_unknown");
});
test("SRC-06 before a verified connected home, no hypothetical remote native admissions",()=>{
 const nodes=[N("src","source"),N("reachable"),...Array.from({length:199},(_,i)=>N("r-"+i))];
 const links=[E("src","reachable")];
 const cols=nodes.filter(x=>x.id!=="src").map((x,i)=>({id:"col-"+i,
  sorters:[F(x.id,"filter",{match:{typeId:"other:chosen"}})]}));
 const x=route(nodes,links,cols,[],{itemId:"other:chosen",bulkState:"full"});
 assert.equal(x.inspection.skippedUnreachableColumns,199);
 assert.equal(x.inspection.examinedColumns,1);
 assert.equal(x.stages[0].candidates.length,1);
 // A hypothetical all-bank planner would incur 199 extra native admission calls.
 // This is NOT a comparison against the 1.4.2 standalone column scheduler.
});
test("SRC-07 layout-independent ordinary Filter matches arbitrary item IDs",()=>{
 for(let i=0;i<60;i++){
   const name="addon:unknown_"+i;
   const nodes=[N("src","source"),N("f")];
   const x=route(nodes,[E("src","f")],[{id:"col",sorters:[
     F("f","filter",{match:{typeId:name}})]}],[],{itemId:name});
   assert.equal(x.stages[0].candidates[0].nodeId,"f");
 }
});
