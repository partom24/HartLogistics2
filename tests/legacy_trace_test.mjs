import assert from 'node:assert/strict';
import {traceQueue,traceLegacy} from '../scripts/legacy-census/trace.js';

const key=p=>[p.d,p.x,p.y,p.z].join('|');
function entry(d,x,y,z,queueKey){
    const p={d,x,y,z,queueKey,present:true};
    return {...p,id:key(p)};
}
const first=entry('overworld',0,1,0,'q2'), last=entry('nether',10,1,0,'q7');
const relay={...entry('overworld',1,0,0),link:last.id};
const reg={receivers:[first,last],collectors:[relay]};
const blocks=new Map();
function put(d,x,y,z,type,dir=5,size=27){
    blocks.set(key({d,x,y,z}),{typeId:type,permutation:{getState:()=>dir},getComponent:()=>({container:{size}})});
}
for(const r of reg.receivers){
    put(r.d,r.x,1,0,'hartsorter:receiver');
    put(r.d,r.x,0,0,'minecraft:hopper');
}
put('overworld',1,0,0,'hartsorter:collector');
put('nether',10,-1,0,'hartsorter:sorter');
put('nether',11,0,0,'minecraft:chest');
const read=p=>blocks.get(key(p))??{typeId:'minecraft:air'};
const run=()=>traceQueue(reg,'q2',read,async()=>{},()=>{});
assert.equal(await run(),last.id);
relay.link=first.id;
await assert.rejects(run,/cycle/);
relay.link=last.id;
first.present=false;
await assert.rejects(run,/registered absent/);
first.present=true;
const system={runTimeout:fn=>queueMicrotask(fn)};
const ids=['hartsorter:q4m_q2'];
const reader={getDynamicPropertyIds:()=>ids,getDynamicProperty:id=>JSON.stringify(id===ids[0]?{v:4,q:4,r:4,d:0}:reg)};
let loaded=false,removed=0;
const world={getDimension:d=>({getBlock:p=>d==='nether'&&!loaded?undefined:read({...p,d})}),
    tickingAreaManager:{hasCapacity:()=>true,createTickingArea:async()=>{loaded=true;},removeTickingArea:()=>{removed++;loaded=false;}}};
async function full(expected){
    const lines=[];
    await traceLegacy(reader,world,system,'',line=>lines.push(line));
    assert.ok(lines.some(line=>line.includes(expected)),lines.join('\n'));
}
await full('committed=4 candidates=1 holds=0');
assert.equal(removed,1);
put('nether',10,-1,0,'minecraft:hopper');
await full('no Sorter column');
assert.equal(removed,2);
world.tickingAreaManager.hasCapacity=()=>false;
await full('unreadable nether');
world.tickingAreaManager.hasCapacity=()=>true;
put('nether',10,-1,0,'hartsorter:sorter');
put('nether',11,0,0,'minecraft:air');
assert.equal(await run(),last.id); // Sorter bus with an open end.
put('overworld',0,-1,0,'minecraft:hopper');
put('overworld',1,-1,0,'hartsorter:collector');
const second={...entry('overworld',1,-1,0),link:last.id};
reg.collectors.push(second);
assert.equal(await run(),last.id); // Two paths reach the same Receiver.
const alternate=entry('overworld',20,1,0,'q8');
reg.receivers.push(alternate);
put('overworld',20,1,0,'hartsorter:receiver');
put('overworld',20,0,0,'minecraft:hopper');
put('overworld',20,-1,0,'hartsorter:sorter');
second.link=alternate.id;
await assert.rejects(run,/different terminal Receivers/);
second.link=first.id;
await assert.rejects(run,/cycle/); // One successful branch cannot hide a cycle.
second.link=last.id;
put('overworld',1,0,0,'minecraft:air');
assert.equal(await run(),last.id); // Only the downward hopper accepts cargo.
put('overworld',1,0,0,'minecraft:dropper');
await assert.rejects(run,/unresolved minecraft:dropper/);
console.log('Legacy route trace checks passed');

// A verified owner remains eligible even without a readable downstream route.
put('overworld',1,0,0,'hartsorter:collector');
const buffer=entry('nether',30,1,0,'q14'), absent=entry('nether',40,1,0,'q6');
absent.present=false;
reg.receivers.push(buffer,absent);
put('nether',30,1,0,'hartsorter:receiver');
const amounts={q2:69884,q14:53939,q7:700,q6:1016};
const prefix='hartsorter:q4m_';
const planReader={
    getDynamicPropertyIds:()=>Object.keys(amounts).map(k=>prefix+k),
    getDynamicProperty:id=>id.startsWith(prefix)?
        JSON.stringify({v:4,q:amounts[id.slice(prefix.length)],r:amounts[id.slice(prefix.length)],d:0}):JSON.stringify(reg)
};
const planLines=[];
await traceLegacy(planReader,world,system,'',s=>planLines.push(s),true);
assert.ok(planLines.includes('PLAN COMPLETE committed=125539 transfer=69884 retain=54639 hold=1016'),planLines.join('\n'));
