import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReadOnlyGraph, checkManagedLink, sourceReachability,
  planReadOnlyCandidates
} from "../src/urce_u1_route_model.mjs";

/*
 * HL-E-URCE151-LINK-CYCLE-004 / GitHub #86 — owner-reported two-bank supply loop.
 * Source-only proof obligation, NOT an installed-Bedrock link fix.
 *
 * Receiver 1 -> Collector 1 -> Receiver 2 -> Collector 2 -> Receiver 1.
 * Receiver-output -> Collector-input legs represent the owner's stated
 * supply path; these edges need actual native Hopper/Sorter verification
 * at the live integration boundary. Visual pipe adjacency is NOT proof.
 */
const node = (id,kind)=>({id,kind,loaded:true});
const link = (from,to,kind="hopper",extra={})=>
  ({from,to,kind,verified:true,loaded:true,...extra});

function ownerLoop(prefix="bank") {
  const R1=prefix+"-receiver-1", C1=prefix+"-collector-1";
  const R2=prefix+"-receiver-2", C2=prefix+"-collector-2";
  const nodes=[node(R1,"receiver"),node(C1,"collector"),
    node(R2,"receiver"),node(C2,"collector")];
  return {R1,C1,R2,C2,nodes};
}

test("LOOP-01 reject last Collector->Receiver link closing exact owner two-bank circuit",()=>{
  for(const p of ["north","shifted(-827,44,120)","turned-east"]) {
    const {R1,C1,R2,C2,nodes}=ownerLoop(p);
    const g=buildReadOnlyGraph(nodes,[
      link(R1,C1),link(C1,R2,"collector_receiver"),link(R2,C2)
    ]);
    assert.equal(g.status,"OK");
    assert.deepEqual(sourceReachability(g,R1).reached.get(C2).path,[R1,C1,R2,C2]);
    assert.deepEqual(checkManagedLink(g,C2,R1),
      {decision:"REJECT",reason:"cycle"});
    const unsafe=buildReadOnlyGraph(nodes,[
      link(R1,C1),link(C1,R2,"collector_receiver"),
      link(R2,C2),link(C2,R1,"collector_receiver")
    ]);
    assert.equal(unsafe.status,"CYCLE");
    assert.equal(planReadOnlyCandidates({graph:unsafe,source:R1,
      itemClass:"ordinary",offers:[],
      existingBulkHome:"no",applicableBulkState:"open"}).status,"INVALID");
  }
});

test("LOOP-02 reject regardless of which bank establishes its link last",()=>{
  const {R1,C1,R2,C2,nodes}=ownerLoop();
  const graph=buildReadOnlyGraph(nodes,[
    link(R1,C1),link(R2,C2),link(C2,R1,"collector_receiver")
  ]);
  assert.equal(graph.status,"OK");
  assert.deepEqual(checkManagedLink(graph,C1,R2),
    {decision:"REJECT",reason:"cycle"});
});

test("LOOP-03 unknown physical supply return must HOLD, not silently pass",()=>{
  const {R1,C1,R2,C2,nodes}=ownerLoop();
  const graph=buildReadOnlyGraph(nodes,[
    link(R1,C1),link(C1,R2,"collector_receiver"),
    link(R2,C2,"hopper",{verified:false})
  ]);
  assert.equal(graph.status,"OK");
  assert.deepEqual(checkManagedLink(graph,C2,R1),
    {decision:"HOLD",reason:"unverified_reverse_reachability"});
});

test("LOOP-04 legitimate acyclic branch and merge remain allowed",()=>{
  const nodes=["source","c1","r1","c2","r2","storage"].map(x=>
    node(x,x.startsWith("c")?"collector":x.startsWith("r")?"receiver":"source"));
  const g=buildReadOnlyGraph(nodes,[
    link("source","c1"),link("source","c2"),
    link("c1","r1","collector_receiver"),link("c2","r2","collector_receiver"),
    link("r1","storage")
  ]);
  assert.equal(g.status,"OK");
  assert.deepEqual(checkManagedLink(g,"r2","storage"),
    {decision:"ALLOW",reason:"no_verified_reverse_path"});
});

test("LOOP-05 source-only graph never grants authority to mutate existing Q4 links",()=>{
  const {R1,C1,R2,C2,nodes}=ownerLoop();
  const historicalLinks=[
    link(R1,C1),link(C1,R2,"collector_receiver"),
    link(R2,C2),link(C2,R1,"collector_receiver")
  ];
  const before=JSON.stringify(historicalLinks);
  assert.equal(buildReadOnlyGraph(nodes,historicalLinks).status,"CYCLE");
  assert.equal(JSON.stringify(historicalLinks),before,
    "Detection must not delete/relink persisted Q4 world state");
});
