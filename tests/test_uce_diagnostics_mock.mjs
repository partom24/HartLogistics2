import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const marker='function uceSendDiagnostics(origin){';
const a=src.indexOf(marker),b=src.indexOf('\n}',a);
assert.ok(a>=0&&b>a);
const fn=src.slice(a,b+2);
function fixture({active=true,sealed=true,native=false,boundary=false}={}){
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
