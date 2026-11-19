import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReadOnlyGraph, sourceReachability, checkManagedLink, checkReadOnlyRouteLease,
  planReadOnlyCandidates
} from "../src/urce_u1_route_model.mjs";

// Every test is pure. IDs, shapes, origins and items are arbitrary fixture data,
// not permitted gameplay item/coordinate allowlists.
const n=(id, kind="transporter", loaded=true)=>({id,kind,loaded});
const e=(from,to,kind="transporter",extra={})=>({from,to,kind,verified:true,loaded:true,...extra});
const o=(nodeId,tier,opts={})=>({nodeId,tier,verified:true, ...opts});
const plan=(nodes,links,source,offers,opts={})=>
  planReadOnlyCandidates({graph:buildReadOnlyGraph(nodes,links),source,
    itemClass:"ordinary",offers,existingBulkHome:"no",applicableBulkState:"open",...opts});

test("U1-01 a Transporter network is graph-only and directed",()=>{
  const graph=buildReadOnlyGraph([n("in","source"),n("pipe"),n("out","sorter")],
    [e("in","pipe"),e("pipe","out")]);
  assert.deepEqual(sourceReachability(graph,"in").reached.get("out").path,["in","pipe","out"]);
  assert.equal(sourceReachability(graph,"out").reached.has("in"),false);
  assert.equal(graph.byId.get("pipe").inventory,undefined);
});

test("U1-02 accept branches and merges, reject proposed directed cycle",()=>{
  const g=buildReadOnlyGraph(["A","B","C","D"].map(id=>n(id)),
    [e("A","B"),e("A","C"),e("B","D"),e("C","D")]);
  assert.equal(checkManagedLink(g,"D","A").decision,"REJECT");
  assert.equal(checkManagedLink(g,"A","D").decision,"ALLOW");
  assert.equal(sourceReachability(g,"A").reached.size,4);
});

test("U1-03 unknown reverse reachability HOLDS before managed link",()=>{
  const g=buildReadOnlyGraph([n("A"),n("B"),n("C", "transporter",false)],
    [e("B","C"),e("C","A")]);
  assert.deepEqual(checkManagedLink(g,"A","B"),{
    decision:"HOLD",reason:"unverified_reverse_reachability"});
});

test("U1-04 Filter beats Auto/Wildcard; within a column bottom-to-top beats cost",()=>{
  const nodes=["src","a","b","c","w"].map(id=>n(id));
  const offers=[o("b","filter",{claim:"yes",columnId:"col",bottomUp:1,estimatedCost:0}),
    o("a","filter",{claim:"yes",columnId:"col",bottomUp:0,estimatedCost:99}),
    o("c","auto",{claim:"yes",estimatedCost:0}),o("w","wildcard")];
  const x=plan(nodes,[e("src","a"),e("src","b"),e("src","c"),e("src","w")],"src",offers);
  assert.deepEqual(x.stages.map(s=>s.tier),["filter","auto"]);
  assert.deepEqual(x.stages[0].candidates.map(c=>c.nodeId),["a","b"]);
  assert.equal(x.stages[0].candidates[0].liveAdmissionRequired,true);
});

test("U1-05 lowest estimated transactional cost across eligible columns",()=>{
  const nodes=["src","near","far"].map(id=>n(id));
  const x=plan(nodes,[e("src","near"),e("src","far")],"src",
    [o("near","filter",{claim:"yes",columnId:"north",estimatedCost:7}),
     o("far","filter",{claim:"yes",columnId:"south",estimatedCost:2})]);
  assert.deepEqual(x.stages[0].candidates.map(c=>c.nodeId),["far","near"]);
});

test("U1-06 claimed ordinary item uses Bulk before Wildcard",()=>{
  const nodes=["src","f","bulk","wild"].map(id=>n(id));
  const links=["f","bulk","wild"].map(to=>e("src",to));
  const offers=[o("f","filter",{claim:"yes"}),o("bulk","bulk"),o("wild","wildcard")];
  assert.deepEqual(plan(nodes,links,"src",offers).stages.map(s=>s.tier),["filter","bulk"]);
  assert.deepEqual(plan(nodes,links,"src",offers,{applicableBulkState:"full"}).stages.map(s=>s.tier),["filter","wildcard"]);
  assert.deepEqual(plan(nodes,links,"src",offers,{applicableBulkState:"unknown"}).stages.map(s=>s.tier),["filter"]);
});

test("U1-07 unclaimed ordinary Wildcard terminal then Bulk; terminal optional",()=>{
  const ns=["src","wild","terminal","bulk"].map(id=>n(id));
  const links=["wild","terminal","bulk"].map(to=>e("src",to));
  assert.deepEqual(plan(ns,links,"src",
    [o("wild","wildcard"),o("terminal","terminal"),o("bulk","bulk")]).stages.map(s=>s.tier),
    ["wildcard","terminal","bulk"]);
  assert.equal(plan([n("src","source")],[],"src",[]).status,"HOLD");
});

test("U1-08 unloaded/unknown route cannot be used to infer unclaimed status",()=>{
  const ns=[n("src","source"),n("missing","transporter",false),n("wild","sorter")];
  const x=plan(ns,[e("src","missing"),e("src","wild")],"src",[o("wild","wildcard")]);
  assert.equal(x.status,"HOLD");
  assert.equal(x.reason,"claim_or_topology_unknown");
});

test("U1-09 remote unreachable Sorter is never eligible",()=>{
  const ns=["left","right","filter"].map(id=>n(id));
  const x=plan(ns,[e("right","filter")],"left",[o("filter","filter",{claim:"yes"})]);
  assert.equal(x.status,"HOLD");
  assert.equal(x.stages.length,0);
});

test("U1-10 MR cannot use ordinary Bulk and retains native-only fallback",()=>{
  const ns=["src","wild","bulk"].map(id=>n(id));
  const x=plan(ns,[e("src","wild"),e("src","bulk")],"src",
    [o("wild","wildcard"),o("bulk","bulk")],{itemClass:"mr"});
  assert.deepEqual(x.stages.map(s=>s.tier),["wildcard"]);
  assert.equal(x.stages[0].candidates[0].liveAdmissionRequired,true);
});

test("U1-11 any unknown claim prevents speculative Wildcard routing",()=>{
  const ns=["src","filter","wild"].map(id=>n(id));
  const x=plan(ns,[e("src","filter"),e("src","wild")],"src",
    [o("filter","filter",{claim:"unknown"}),o("wild","wildcard")]);
  assert.equal(x.status,"HOLD");
});

test("U1-12 malformed edges and duplicate nodes fail closed",()=>{
  assert.equal(buildReadOnlyGraph([n("x"),n("x")],[]).status,"INVALID");
  assert.equal(buildReadOnlyGraph([n("x")],[e("x","y")]).status,"INVALID");
});

test("U1-13 translation/rotation/name changes do not affect relative route",()=>{
  for(let i=0;i<64;i++){
    const names=["src","entry","south"].map(s=>s+"@"+i);
    const ns=names.map(x=>n(x));
    const g=buildReadOnlyGraph(ns,[e(names[0],names[1]),e(names[1],names[2])]);
    assert.deepEqual(sourceReachability(g,names[0]).reached.get(names[2]).path,names);
  }
});

test("U1-14 network with 1,400 sorter endpoints excludes unreachable half",()=>{
  const nodes=[n("src","source"),...Array.from({length:1400},(_,i)=>n("sorter-"+i,"sorter"))];
  const links=Array.from({length:700},(_,i)=>e("src","sorter-"+i));
  const offers=Array.from({length:1400},(_,i)=>
    o("sorter-"+i,"filter",{claim:"yes",columnId:"col-"+Math.floor(i/4),bottomUp:i%4,estimatedCost:i}));
  const x=plan(nodes,links,"src",offers);
  assert.equal(x.stages[0].candidates.length,700);
  assert.equal(x.stages[0].candidates.every(c=>c.nodeId!=="sorter-1399"),true);
});

test("U1-15 source-only module never imports native Bedrock or changes an inventory",()=>{
  const g=buildReadOnlyGraph([n("src","source")],[]);
  assert.equal(typeof g.byId.get("src").setItem,"undefined");
  assert.equal(planReadOnlyCandidates({graph:g,source:"src",itemClass:"ordinary",
    offers:[],existingBulkHome:"no",applicableBulkState:"full"}).status,"HOLD");
});

test("U1-16 a pre-existing directed cycle cannot be trusted for routing",()=>{
  const graph=buildReadOnlyGraph([n("A"),n("B"),n("C")],
    [e("A","B"),e("B","C"),e("C","A")]);
  assert.equal(graph.status,"CYCLE");
  assert.equal(planReadOnlyCandidates({graph,source:"A",itemClass:"ordinary",
    offers:[],existingBulkHome:"no",applicableBulkState:"open"}).status,"INVALID");
});

test("U1-17 columns are ordered by cost while every column stays bottom-to-top",()=>{
  const nodes=["src","a0","a1","b0"].map(id=>n(id));
  const x=plan(nodes,[e("src","a0"),e("src","a1"),e("src","b0")],"src",[
    o("a1","filter",{claim:"yes",columnId:"A",bottomUp:1,estimatedCost:0}),
    o("a0","filter",{claim:"yes",columnId:"A",bottomUp:0,estimatedCost:50}),
    o("b0","filter",{claim:"yes",columnId:"B",bottomUp:0,estimatedCost:5})
  ]);
  assert.deepEqual(x.stages[0].candidates.map(v=>v.nodeId),["a0","a1","b0"]);
});

test("U1-18 unknown ordinary Bulk home cannot block safe native MR Wildcard consideration",()=>{
  const ns=["src","wild","bulk"].map(id=>n(id));
  const x=plan(ns,[e("src","wild"),e("src","bulk")],"src",
    [o("wild","wildcard"),o("bulk","bulk")],{
      itemClass:"mr",existingBulkHome:"unknown",applicableBulkState:"unknown"
    });
  assert.equal(x.status,"CANDIDATES");
  assert.deepEqual(x.stages.map(s=>s.tier),["wildcard"]);
  assert.equal(x.stages[0].candidates[0].liveAdmissionRequired,true);
  assert.equal(plan(ns,[e("src","wild"),e("src","bulk")],"src",
    [o("wild","wildcard")],{
      itemClass:"ordinary",existingBulkHome:"unknown",applicableBulkState:"unknown"
    }).status,"HOLD","Ordinary Bulk home still requires verified absence");
});

test("U1-19 consistent directed route can demand native revalidation, never write authority",()=>{
  const g=buildReadOnlyGraph([n("src","source"),n("p"),n("dst","sorter")],
    [e("src","p"),e("p","dst")]);
  const result=checkReadOnlyRouteLease({graph:g,source:"src",
    path:["src","p","dst"],plannedRevision:"epoch-7",currentRevision:"epoch-7"});
  assert.deepEqual(result,{decision:"REVALIDATE_NATIVE",
    reason:"snapshot_consistent_not_custody_authority",executePermitted:false});
});

test("U1-20 configuration revision drift forces route replanning",()=>{
  const g=buildReadOnlyGraph([n("src","source"),n("dst","sorter")],
    [e("src","dst")]);
  const base={graph:g,source:"src",path:["src","dst"],
    plannedRevision:"before",currentRevision:"after"};
  assert.equal(checkReadOnlyRouteLease(base).decision,"REPLAN");
  assert.equal(checkReadOnlyRouteLease({...base,currentRevision:""}).decision,"REPLAN");
});

test("U1-21 broken or unloaded native-shaped paths cannot be treated as accepted",()=>{
  const nodes=[n("src","source"),n("middle"),n("dst","sorter")];
  const base={source:"src",path:["src","middle","dst"],
    plannedRevision:"epoch",currentRevision:"epoch"};
  const missing=buildReadOnlyGraph(nodes,[e("src","middle")]);
  assert.deepEqual(checkReadOnlyRouteLease({...base,graph:missing}),{
    decision:"HOLD",reason:"path_edge_unverified",executePermitted:false});
  const unloaded=buildReadOnlyGraph([nodes[0],n("middle","transporter",false),nodes[2]],
    [e("src","middle"),e("middle","dst")]);
  assert.equal(checkReadOnlyRouteLease({...base,graph:unloaded}).decision,"HOLD");
  assert.equal(checkReadOnlyRouteLease({...base,graph:missing,path:["src","src","dst"]}).decision,"REPLAN");
});

test("U1-22 unknown source-reachable branch HOLDs without banning unrelated components",()=>{
  const nodes=["src","mid","dst","uncertain","island"].map(id=>n(id));
  const primary=[e("src","mid"),e("mid","dst")];
  const base={source:"src",path:["src","mid","dst"],
    plannedRevision:"r",currentRevision:"r"};
  const unknown=buildReadOnlyGraph(nodes,
    [...primary,e("src","uncertain","transporter",{verified:false})]);
  assert.equal(checkReadOnlyRouteLease({...base,graph:unknown}).reason,
    "source_routes_unverified");
  const unrelated=buildReadOnlyGraph(nodes,
    [...primary,e("island","uncertain","transporter",{verified:false})]);
  assert.equal(checkReadOnlyRouteLease({...base,graph:unrelated}).decision,
    "REVALIDATE_NATIVE");
});
