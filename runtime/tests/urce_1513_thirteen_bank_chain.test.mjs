import test from "node:test";
import assert from "node:assert/strict";
import {inspectVerifiedBankFilterHome}
  from "../../addon/behavior_pack/scripts/urce_1513_verified_bank_filter.js";
// Synthetic 13 individual visual bank runs connected by 12 directed
// Collector->Receiver links. No workbook coordinate is a live BDS locator.
const D="minecraft:overworld",PIPE="hartsorter:transporter";
const k=p=>[p.x,p.y,p.z].join(",");
const plain=(typeId,p,contents)=>({
  typeId,location:{...p},dimension:{id:D},
  permutation:{getState:n=>n==="toggle_bit"?false:0},
  getComponent:n=>n==="minecraft:inventory"&&contents
    ?{container:contents}:undefined
});
const chest=()=>({isValid:true,size:27,
  firstItem(){return undefined;},getItem(){return undefined;}});
const fixtures=(n,{loop=false,missing=false,unknown=false,full=false}={})=>{
  const blocks=new Map(),receivers=[],collectors=[],columns=[];
  const set=(type,p,inventory)=>blocks.set(k(p),plain(type,p,inventory));
  const recv=i=>({id:"R"+i,d:D,x:i*20,y:5,z:0});
  for(let i=0;i<n;i++){
    const r=recv(i);receivers.push(r);
    set("hartsorter:receiver",r);
    set("minecraft:hopper",{x:r.x,y:4,z:0},chest());
    for(let j=1;j<=3;j++) {
      const p={x:r.x+j,y:4,z:0};
      if(!(missing&&i===7&&j===2))set(PIPE,p);
    }
    if(i<n-1) {
      const c={id:"C"+i,d:D,x:r.x+4,y:4,z:0,link:"R"+(i+1)};
      collectors.push(c);set("hartsorter:collector",c);
    }
    if(i===n-1){
      const src={x:r.x+3,y:4,z:-1};
      const entry={d:D,x:src.x,y:3,z:-1,m:"filter",
        f:"minecraft:cobblestone"};
      set("minecraft:hopper",src,chest());
      set("hartsorter:sorter",entry);
      set("minecraft:chest",{x:src.x+1,y:3,z:-1},chest());
      set("minecraft:stone",{x:src.x+1,y:2,z:-1});
      columns.push({d:D,x:src.x,z:-1,source:src,sorters:[entry]});
    }
  }
  if(loop){
    const last=recv(n-1);
    const c={id:"C-loop",d:D,x:last.x+4,y:4,z:0,link:"R0"};
    collectors.push(c);set("hartsorter:collector",c);
  }
  if(unknown)set("minecraft:hopper",{x:7*20+2,y:4,z:1},chest());
  const original=receivers[0];
  const item={typeId:"minecraft:cobblestone",maxAmount:64,amount:4};
  const proof={receiver:original,item,collectors,receivers,columns,
    read:(d,p)=>{if(d!==D)throw Error("unloaded");
      return blocks.get(k(p))??plain("minecraft:air",p);},
    modeOf:e=>e.m,matches:(s,f)=>s.typeId===f,
    powered:()=>false,
    destination:(e)=>({kind:"storage",block:blocks.get(k({x:e.x+1,y:e.y,z:e.z}))}),
    inventory:block=>block.getComponent("minecraft:inventory")?.container,
    admit:()=>full?undefined:{slot:0,room:64},
    maxPipes:256,maxReads:1400,maxBanks:16
  };
  return {proof,receivers,collectors,columns,blocks};
};
test("THIRTEEN-01 owner-shaped 13 banks 12 directed links discovers last Filter home",()=>{
  const f=fixtures(13),r=inspectVerifiedBankFilterHome(f.proof);
  assert.equal(f.collectors.length,12);
  assert.equal(r.status,"FILTER_HOME",JSON.stringify(r));
  assert.equal(r.banks,13);
  assert.equal(r.pipeVisits,39);
  assert.equal(r.chosen.bankReceiverId,"R12");
  assert.equal(r.chosen.links,12);
  assert.ok(r.reads<=1400,"13 bank bounded reads "+r.reads);
  assert.equal(r.executePermitted,false);
  assert.equal(r.mayAuthorizeCargo,false);
});
test("THIRTEEN-02 returning final-bank Collector creates known cycle",()=>{
  const r=inspectVerifiedBankFilterHome(fixtures(13,{loop:true}).proof);
  assert.equal(r.status,"HOLD",JSON.stringify(r));
});
test("THIRTEEN-03 missing middle bank segment cannot prove final Filter",()=>{
  const r=inspectVerifiedBankFilterHome(fixtures(13,{missing:true}).proof);
  assert.equal(r.status,"NO_FILTER_HOME",JSON.stringify(r));
  assert.equal(r.mayAuthorizeCargo,false);
});
test("THIRTEEN-04 unknown native Hopper branch in middle bank HOLDS",()=>{
  assert.equal(inspectVerifiedBankFilterHome(fixtures(13,{unknown:true}).proof).status,"HOLD");
});
test("THIRTEEN-05 full last Filter remains claimed, no inferred Wildcard or Bulk",()=>{
  assert.equal(inspectVerifiedBankFilterHome(fixtures(13,{full:true}).proof).status,"NO_FILTER_HOME");
});
test("THIRTEEN-06 13-bank bounded scans fail closed at lower budgets",()=>{
  const f=fixtures(13);
  for(const over of [{maxBanks:12},{maxReads:150},{maxPipes:30}]){
    const v=inspectVerifiedBankFilterHome({...f.proof,...over});
    assert.equal(v.status,"HOLD",JSON.stringify({over,v}));
  }
});
