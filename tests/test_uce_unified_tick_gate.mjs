import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/** The exact generated-bridge scheduler gate, not a second test implementation.
 * Source mock only: Bedrock disk durability and actual actor interleavings
 * remain separate, bounded acceptance requirements.
 */
const bridge=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const first=bridge.indexOf('function uceUnifiedJournalHold(){');
const last=bridge.indexOf('\n/**\n * Read the immutable cold seal',first);
assert.ok(first>=0&&last>first,'unified scheduler must have stable bounds');
const actual=bridge.slice(first,last);

function fixture({ready=true,active=true,sealed=true,
                  thrown=false,journals={},afterMR=null}={}){
  const calls=[],messages=[],reads=[];
  const authority=active?{worldId:'restored-lab-copy',epoch:41}:undefined;
  const world={
    getDynamicProperty:key=>{
      reads.push(key);
      if(thrown)throw Error('unreadable world property');
      return journals[key];
    }
  };
  const context={
    world,ready,
    uceAuthoritySnapshot:()=>{calls.push('authority');return authority;},
    inspectUnifiedActiveColdImport:args=>{
      calls.push('cold');
      assert.equal(args.world,world);
      assert.equal(args.worldId,'restored-lab-copy');
      assert.equal(args.epoch,41);
      return sealed?{ok:true}:{ok:false,reason:'stale_sealed_shard'};
    },
    uceBridgeLog:msg=>messages.push(msg),
    uceMrServiceTick:a=>{
      assert.equal(a,authority);calls.push('MR');
      if(typeof afterMR==='function')afterMR(journals);
    },
    uceOrdinaryServiceTick:a=>{
      assert.equal(a,authority);calls.push('ORDINARY');
    }
  };
  vm.runInNewContext(actual,context);
  context.uceUnifiedServiceTick();
  return {calls,messages,reads};
}
test('valid ACTIVE sealed world services both lanes under a single authority proof',()=>{
  const f=fixture();
  assert.deepEqual(f.calls,['authority','cold','MR','ORDINARY']);
  assert.equal(f.reads.length,8);
});
test('missing authority or failed cold seal never invokes either lane',()=>{
  assert.deepEqual(fixture({active:false}).calls,['authority']);
  assert.deepEqual(fixture({sealed:false}).calls,['authority','cold']);
  assert.deepEqual(fixture({ready:false}).calls,['authority']);
});
test('every nonempty native, ordinary, and Q4 journal globally freezes both lanes',()=>{
  for(const key of [
    'hartsorter:journal_v1',
    'hartsorter:queue_journal_v1',
    'hartlogistics:uce_native_intent_v1',
    'hartlogistics:uce_boundary_intent_v1'
  ]){
    const f=fixture({journals:{[key]:'PREPARED'}});
    assert.deepEqual(f.calls,['authority','cold'],key);
    assert.equal(f.messages.some(x=>x.includes(key)),true,key);
  }
});
test('ambiguous falsy journal values HOLD; absence may proceed',()=>{
  for(const value of [false,0]){
    const f=fixture({journals:{'hartsorter:journal_v1':value}});
    assert.deepEqual(f.calls,['authority','cold']);
  }
  assert.deepEqual(fixture({journals:{
    'hartsorter:journal_v1':''
  }}).calls,['authority','cold','MR','ORDINARY']);
});
test('world property throw is global HOLD, not legacy fallback or a write',()=>{
  const f=fixture({thrown:true});
  assert.deepEqual(f.calls,['authority','cold']);
  assert.equal(f.messages.some(x=>x.includes('unreadable')),true);
});

test('MR PREPARED in this tick prevents any later ordinary service start',()=>{
  const f=fixture({afterMR:j=>{
    j['hartlogistics:uce_native_intent_v1']='PREPARED';
  }});
  assert.deepEqual(f.calls,['authority','cold','MR']);
  assert.equal(f.messages.some(x=>x.includes('uce_native_intent_v1')),true);
});
test('MR clears its own acknowledged journal before ordinary lane starts',()=>{
  const f=fixture({afterMR:j=>{
    j['hartlogistics:uce_native_intent_v1']=undefined;
  }});
  assert.deepEqual(f.calls,['authority','cold','MR','ORDINARY']);
});
