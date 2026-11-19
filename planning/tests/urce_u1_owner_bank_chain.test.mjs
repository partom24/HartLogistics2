import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReadOnlyGraph, sourceReachability, checkReadOnlyRouteLease, checkManagedLink
} from "../src/urce_u1_route_model.mjs";

/*
 * Owner Storage Array.xlsx, Sheet1 — 2026-11-19.
 * This is a symbolic approximation of the 13 illustrated gray supply runs.
 * Each bank has a directed local entry->exit; adjacent banks are joined
 * by a Collector->Receiver logical edge, not fused into one "bank".
 * R19 is EXPLICITLY part of the bank-4 to bank-5 linkage (owner correction).
 * No live Bedrock topology, item custody or physical direction is asserted.
 */
const runs = [
  ["D36","T36","bottom horizontal"],
  ["V34","V20","lower V"],
  ["V16","V2","upper V"],
  ["R2","R16","upper R"],
  ["R20","R34","lower R"],
  ["O34","O20","lower O"],
  ["O16","O2","upper O"],
  ["I2","I16","upper I"],
  ["I20","I34","lower I"],
  ["F34","F20","lower F"],
  ["F16","F2","upper F"],
  ["B2","B16","upper B"],
  ["B20","B34","lower B"]
];
const joins = [
  "U36:V36,V35", "V17:V19", "S2:U2", "R17:R19",
  "P34:Q34", "O17:O19", "J2:N2", "I17:I19",
  "G34:H34", "F17:F19", "C2:E2", "B17:B19"
];

function fixture(options={}) {
  const nodes=[], links=[], endpoint={};
  for(let i=0;i<runs.length;i++){
    const [entry,exit]=runs[i];
    const n=i+1;
    const left=`bank-${n}-entry`,right=`bank-${n}-exit`;
    endpoint[n]={entry:left,exit:right,entryCell:entry,exitCell:exit};
    nodes.push({id:left,kind:n===1?"source":"receiver",loaded:true});
    nodes.push({id:right,kind:n===13?"terminal":"collector",loaded:true});
    links.push({from:left,to:right,kind:"local",loaded:true,verified:true});
    if(i>0) {
      const before=endpoint[i].exit, after=left;
      if(options.omitJoin!==i) links.push({
        from:before,to:after,kind:"collector_receiver",
        loaded:true,verified:options.unknownJoin===i?false:true,
        worksheetCells:joins[i-1]
      });
    }
  }
  return {nodes,links,endpoint};
}

test("BANK-01 13 distinct gray Transport Banks form one open 12-link chain",()=>{
  assert.equal(runs.length,13);
  assert.equal(joins.length,12);
  const f=fixture(), g=buildReadOnlyGraph(f.nodes,f.links);
  assert.equal(g.status,"OK");
  assert.equal(f.links.filter(e=>e.kind==="local").length,13);
  assert.equal(f.links.filter(e=>e.kind==="collector_receiver").length,12);
  const reach=sourceReachability(g,f.endpoint[1].entry);
  assert.equal(reach.unknown,false);
  const path=reach.reached.get(f.endpoint[13].exit)?.path;
  assert.equal(path?.length,26);
  assert.equal(new Set(path).size,26);
  assert.equal(path[0],f.endpoint[1].entry);
  assert.equal(path.at(-1),f.endpoint[13].exit);
});

test("BANK-02 owner's missed R19 cell belongs to continuous R16->R20 linkage",()=>{
  assert.equal(joins[3],"R17:R19");
  assert.equal(runs[3][1],"R16");
  assert.equal(runs[4][0],"R20");
  const f=fixture(),g=buildReadOnlyGraph(f.nodes,f.links);
  assert.equal(g.status,"OK");
  assert.equal(g.outgoing.get(f.endpoint[4].exit).find(e=>
    e.to===f.endpoint[5].entry)?.worksheetCells,"R17:R19");
});

test("BANK-03 only a real link deletion splits a chain and invalidates read-only path",()=>{
  const f=fixture(),g=buildReadOnlyGraph(f.nodes,f.links);
  const original=sourceReachability(g,f.endpoint[1].entry)
    .reached.get(f.endpoint[13].exit)?.path;
  const broken=fixture({omitJoin:4});
  const disconnected=buildReadOnlyGraph(broken.nodes,broken.links);
  assert.equal(disconnected.status,"OK");
  assert.equal(sourceReachability(disconnected,broken.endpoint[1].entry)
    .reached.has(broken.endpoint[13].exit),false);
  assert.deepEqual(checkReadOnlyRouteLease({graph:disconnected,
    source:broken.endpoint[1].entry,path:original,
    plannedRevision:"rev-1",currentRevision:"rev-1"}),{
      decision:"HOLD",reason:"path_edge_unverified",executePermitted:false
    });
});

test("BANK-04 unverified R19-path linkage is not a safe delivery route",()=>{
  const f=fixture({unknownJoin:4});
  const g=buildReadOnlyGraph(f.nodes,f.links);
  assert.equal(g.status,"OK");
  assert.equal(sourceReachability(g,f.endpoint[1].entry).unknown,true);
  assert.equal(sourceReachability(g,f.endpoint[1].entry)
    .reached.has(f.endpoint[13].exit),false);
});

test("BANK-05 return link from terminal downstream endpoint is cyclic, not another bank",()=>{
  const f=fixture(),g=buildReadOnlyGraph(f.nodes,f.links);
  assert.equal(g.status,"OK");
  assert.deepEqual(checkManagedLink(g,f.endpoint[13].exit,f.endpoint[1].entry),
    {decision:"REJECT",reason:"cycle"});
  const cyclic=buildReadOnlyGraph(f.nodes,[
    ...f.links,{from:f.endpoint[13].exit,to:f.endpoint[1].entry,
      kind:"collector_receiver",verified:true,loaded:true}
  ]);
  assert.equal(cyclic.status,"CYCLE");
});
