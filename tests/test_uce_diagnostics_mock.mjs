import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Generated-addon tests run the same functions from assembled main.js.
const src=process.env.UCE_GENERATED_MAIN?
  fs.readFileSync(process.env.UCE_GENERATED_MAIN,'utf8'):
  fs.readFileSync(new URL(
    '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const marker='function uceSendDiagnostics(origin){';
const a=src.indexOf(marker),b=src.indexOf('\n}',a);
assert.ok(a>=0&&b>a);
const fn=src.slice(a,b+2);
function fixture({active=true,sealed=true,native=false,boundary=false,
  federated=false}={}){
  const lines=[],calls=[];
  const auth=active?{worldId:'minecraft:overworld:141',epoch:4}:undefined;
  const seal={shards:[{key:'hartlogistics:uce_shard_0000_v1'}]};
  const world={
    getDynamicProperty(key){
      calls.push(key);
      if(key==='hartlogistics:uce_cold_seal_v1')return JSON.stringify(seal);
      if(key==='hartlogistics:uce_native_intent_v1')
        return native?'{"phase":"PREPARED"}':undefined;
      if(key==='hartlogistics:uce_boundary_intent_v1')
        return boundary?'{"phase":"ESCROW_READY"}':undefined;
      if(key==='hartlogistics:uce_federated_intent_v1')
        return federated?JSON.stringify({schema:'hart-uce-federated-intent-v1',
          phase:'DEBIT_INSPECTED',fromAccount:'receiver:a',
          toAccount:'bulk:b',count:32}):undefined;
      return undefined;
    },
    setDynamicProperty(){throw Error('diagnostics must never write');}
  };
  const ctx={
    world,
    uceAuthoritySnapshot:()=>auth,
    inspectUnifiedActiveColdImport:()=>({ok:sealed,reason:'invalid_shard'}),
    createUnifiedShardWriter:()=>({ok:true,inspect:()=>({ok:true,
      snapshot:{accounts:[
        {kind:'receiver',total:120},
        {kind:'bulk',role:'controller',total:40,capacity:200000},
        {kind:'bulk',role:'member',total:20,capacity:200000}
      ]}})}),
    inspectUnifiedFederatedPending:()=>({
      ok:true,evidenceState:'SOURCE_DEBIT_ONLY_OBSERVED'
    }),
    log:message=>lines.push(String(message))
  };
  vm.runInNewContext(fn,ctx);
  const origin={sourceEntity:{sendMessage:s=>lines.push(s)}};
  return {run:()=>ctx.uceSendDiagnostics(origin),lines,calls};
}
test('unified status displays Receiver and Bulk account totals without making a world mutation',()=>{
  const f=fixture();f.run();
  const joined=f.lines.join(' | ');
  assert.match(joined,/Receivers:.*1/);
  assert.match(joined,/Ordinary:.*120/);
  assert.match(joined,/Bulk:.*60\/400000/);
  assert.match(joined,/controllers 1/);
  assert.match(joined,/SOURCE ONLY/);
  assert.ok(f.calls.includes('hartlogistics:uce_cold_seal_v1'));
});
test('pending MR and ordinary journals are labelled as HOLD, never auto-cleared',()=>{
  const f=fixture({native:true,boundary:true});f.run();
  assert.match(f.lines.join('|'),/MR HOLD.*Ordinary HOLD/);
});
test('absent or unverified authority reports HOLD without pretending a playable result',()=>{
  const missing=fixture({active:false});missing.run();
  assert.match(missing.lines.join('|'),/not ACTIVE/);
  const corrupt=fixture({sealed:false});corrupt.run();
  assert.match(corrupt.lines.join('|'),/COLD AUTHORITY HOLD/);
});

function owner(x,y=131,z=-90){
  const dimensionId='minecraft:overworld';
  const id=dimensionId+'|'+x+'|'+y+'|'+z;
  return {id:'receiver:'+id,kind:'receiver',ownerId:id,
    uceAnchor:{dimensionId,x,y,z},total:0};
}
test('PG37 owner census enumerates all four sealed Receiver anchors after PG36 restart',()=>{
  const lines=[],writes=[];
  const ids=[-78,-74,-82,-86];
  const accounts=ids.map(x=>owner(x));
  const world={
    getDynamicProperty(key){
      if(key==='hartlogistics:uce_cold_seal_v1')
        return JSON.stringify({shards:[{key:'hartlogistics:uce_shard_0000_v1'}]});
      return undefined;
    },
    setDynamicProperty(...args){writes.push(args);throw Error('read-only');}
  };
  const ctx={
    world,uceAuthoritySnapshot:()=>({worldId:'new',epoch:1}),
    inspectUnifiedActiveColdImport:()=>({ok:true}),
    createUnifiedShardWriter:()=>({ok:true,inspect:()=>({ok:true,
      snapshot:{accounts}})}),
    log:m=>lines.push(String(m))
  };
  vm.runInNewContext(fn,ctx);
  ctx.uceSendDiagnostics({sourceEntity:{sendMessage:m=>lines.push(m)}});
  const joined=lines.join('\n');
  assert.match(joined,/Receivers:.*4/);
  assert.match(joined,/Sealed Receiver owners \(read-only\):.*4 listed/);
  for(const x of ids)assert.match(joined,new RegExp(
    'minecraft:overworld\\|'+x+'\\|131\\|-90'));
  assert.equal(writes.length,0,'diagnostic must not mutate Bedrock');
  assert.doesNotMatch(joined,/Receiver owner census HOLD/);
});
test('PG37 duplicate or malformed sealed owner remains visible and triggers census HOLD',()=>{
  const lines=[];
  const good=owner(-78);
  const malformed={...owner(-74),uceAnchor:{dimensionId:'minecraft:overworld',x:-999,y:131,z:-90}};
  const world={getDynamicProperty:k=>k==='hartlogistics:uce_cold_seal_v1'
    ?JSON.stringify({shards:[{key:'hartlogistics:uce_shard_0000_v1'}]})
    :undefined,
    setDynamicProperty(){throw Error('never write diagnostics');}};
  const ctx={world,uceAuthoritySnapshot:()=>({worldId:'w',epoch:1}),
    inspectUnifiedActiveColdImport:()=>({ok:true}),
    createUnifiedShardWriter:()=>({ok:true,inspect:()=>({ok:true,
      snapshot:{accounts:[good,good,malformed]}})}),
    log:s=>lines.push(s)};
  vm.runInNewContext(fn,ctx);
  ctx.uceSendDiagnostics({sourceEntity:{sendMessage:s=>lines.push(s)}});
  assert.match(lines.join('\n'),/Receiver owner census HOLD: invalid 1 \| duplicate 1/);
});
test('PG37 bounded receiver listing refuses to dump an unbounded registry to chat',()=>{
  const accounts=Array.from({length:20},(_,i)=>owner(i,131,-90));
  const lines=[];
  const world={getDynamicProperty:k=>k==='hartlogistics:uce_cold_seal_v1'
    ?JSON.stringify({shards:[{key:'hartlogistics:uce_shard_0000_v1'}]})
    :undefined};
  const ctx={world,uceAuthoritySnapshot:()=>({worldId:'w',epoch:1}),
    inspectUnifiedActiveColdImport:()=>({ok:true}),
    createUnifiedShardWriter:()=>({ok:true,inspect:()=>({ok:true,
      snapshot:{accounts}})}),
    log:s=>lines.push(s)};
  vm.runInNewContext(fn,ctx);
  ctx.uceSendDiagnostics({sourceEntity:{sendMessage:s=>lines.push(s)}});
  const receiverLines=lines.filter(x=>x.startsWith('§7R §f'));
  assert.equal(receiverLines.length,12);
  assert.match(lines.join('\n'),/20 listed, first 12 shown/);
});

test('read-only status reveals a RESERVED carrier despite clear global MR journal',()=>{
  const lines=[],writes=[],account=owner(-78);
  const world={
    getDynamicProperty:k=>k==='hartlogistics:uce_cold_seal_v1'
      ?JSON.stringify({shards:[{key:'hartlogistics:uce_shard_0000_v1'}]})
      :undefined,
    setDynamicProperty(...args){writes.push(args);throw Error('read-only');}
  };
  const ctx={
    world,uceAuthoritySnapshot:()=>({worldId:'w',epoch:1}),
    inspectUnifiedActiveColdImport:()=>({ok:true}),
    createUnifiedShardWriter:()=>({ok:true,inspect:()=>({ok:true,
      snapshot:{accounts:[account]}})}),
    createUnifiedCarrierRegistry:()=>({ok:true,
      inspectHostEvidence:()=>({ok:true,recordState:'RESERVED',
        recordEntityId:null,recordStatus:'VERIFIED',
        custodyState:'HOLD:RESERVED',liveEntityCount:1,ticketSlotCount:0,
        ticketRevision:0,ticketStatus:'VERIFIED',nativeIntentPhase:'CLEAR',
        entities:[{id:'native-PG39',occupied:0,inventoryStatus:'VERIFIED'}],
        ownerVerified:true})}),
    uceLiveReceiverOwner:()=>true,
    log:s=>lines.push(String(s))
  };
  vm.runInNewContext(fn,ctx);
  ctx.uceSendDiagnostics({sourceEntity:{sendMessage:s=>lines.push(s)}});
  assert.match(lines.join('|'),/MR clear/);
  assert.match(lines.join('|'),/Carrier.*RESERVED.*HOLD:RESERVED/);
  assert.match(lines.join('|'),/Entity.*native-PG39.*occupied 0/);
  assert.match(lines.join('|'),/intent CLEAR/);
  assert.equal(writes.length,0);
});
test('owner-keyed warning suppression keeps alternating failures bounded',()=>{
  const begin=src.indexOf('const uceWarningCounts=new Map();');
  const end=src.indexOf('function uceNativeReceiptId(){',begin);
  assert.ok(begin>=0&&end>begin);
  const logs=[],ctx={log:s=>logs.push(s)};
  vm.runInNewContext(src.slice(begin,end),ctx);
  for(let i=0;i<40;i++){
    ctx.uceBridgeLog('carrier_reserved_requires_manual_reconciliation','receiver-A');
    ctx.uceBridgeLog('carrier_record_missing','receiver-B');
  }
  assert.equal(logs.length,4);
  assert.match(logs[0],/owner=receiver-A/);
  assert.match(logs[1],/owner=receiver-B/);
  assert.match(logs[2],/repeated=16/);
});

test('read-only status shows expected ACTIVE ID beside the observed different entity ID',()=>{
  const lines=[],account=owner(-78);
  const world={getDynamicProperty:k=>k==='hartlogistics:uce_cold_seal_v1'
    ?JSON.stringify({shards:[{key:'hartlogistics:uce_shard_0000_v1'}]})
    :undefined,setDynamicProperty(){throw Error('read-only');}};
  const ctx={world,uceAuthoritySnapshot:()=>({worldId:'w',epoch:1}),
    inspectUnifiedActiveColdImport:()=>({ok:true}),
    createUnifiedShardWriter:()=>({ok:true,inspect:()=>({ok:true,
      snapshot:{accounts:[account]}})}),
    createUnifiedCarrierRegistry:()=>({ok:true,
      inspectHostEvidence:()=>({ok:true,recordState:'ACTIVE',
        recordEntityId:'expected-carrier',recordStatus:'VERIFIED',
        custodyState:'HOLD:carrier_entity_id_changed',
        liveEntityCount:1,ticketSlotCount:null,ticketRevision:null,
        ticketStatus:'HOLD:native_ticket_invalid_json',
        nativeIntentPhase:'CLEAR',ownerVerified:true,
        entities:[{id:'observed-carrier',occupied:1,
          inventoryStatus:'VERIFIED'}]})}),
    uceLiveReceiverOwner:()=>true,log:m=>lines.push(String(m))};
  vm.runInNewContext(fn,ctx);
  ctx.uceSendDiagnostics({sourceEntity:{sendMessage:m=>lines.push(m)}});
  assert.match(lines.join('|'),/saved ID expected-carrier/);
  assert.match(lines.join('|'),/Entity.*observed-carrier/);
  assert.match(lines.join('|'),/tickets UNKNOWN@UNKNOWN/);
  assert.match(lines.join('|'),/HOLD:carrier_entity_id_changed/);
});

test('status isolates unresolved cross-shard custody and never clears the global intent',()=>{
  const f=fixture({federated:true});f.run();
  const joined=f.lines.join('|');
  assert.match(joined,/Federated HOLD/);
  assert.match(joined,/DEBIT_INSPECTED/);
  assert.match(joined,/receiver:a.*bulk:b.*32/);
  assert.match(joined,/SOURCE_DEBIT_ONLY_OBSERVED/);
  assert.ok(f.calls.includes('hartlogistics:uce_federated_intent_v1'));
});

test('diagnostics treat malformed falsy journal values as HOLD, not clear',()=>{
  const f=fixture();
  const source=fs.readFileSync(new URL(
    '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
  assert.match(source,/const pending=v=>v!==undefined&&v!==null&&v!==''/);
});

test('session performance counters measure individual item throughput, not just 64-item batches',()=>{
  const begin=src.indexOf('const UCE_PERF_SLOW_TICK_MS=25;');
  const end=src.indexOf('// End optional operational diagnostics.',begin);
  assert.ok(begin>=0&&end>begin,'exact runtime performance helper exists');
  const output=[];
  const ctx={system:{currentTick:100},log:s=>output.push(String(s))};
  vm.runInNewContext(src.slice(begin,end),ctx);
  const origin={sourceEntity:{sendMessage:s=>output.push(String(s))}};
  ctx.ucePerformancePanel(origin,'on');
  ctx.ucePerfRecordMove('ordinary',64);
  ctx.system.currentTick++;
  ctx.ucePerfRecordMove('ordinary',32);
  ctx.ucePerfRecordMove('MR',3);
  output.length=0;
  ctx.ucePerformancePanel(origin,'status');
  const shown=output.join('|');
  assert.match(shown,/Committed transfer operations: MR 1, ordinary 2/);
  assert.match(shown,/Committed items: MR 3, ordinary 96/);
  assert.match(shown,/observed wall-clock rate .* items\/s/);
  ctx.ucePerformancePanel(origin,'off');
  ctx.ucePerfRecordMove('ordinary',200000);
  output.length=0;
  ctx.ucePerformancePanel(origin,'on');
  const restarted=output.join('|');
  assert.match(restarted,/Monitoring:.*ON/);
  output.length=0;
  ctx.ucePerformancePanel(origin,'status');
  assert.match(output.join('|'),/Committed items: MR 0, ordinary 0/,
    'session statistics reset; no persistent backlog telemetry');
});
