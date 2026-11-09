import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL(
  '../candidates/pg30/q5_property_probe_overlay.js',import.meta.url),'utf8');
const HISTORY='hartlogistics:pg30_test_history_tmp_v1';
const MARKER='hartlogistics:pg30_test_marker_tmp_v1';
const names=['q5pcheck','q5pstart','q5pfinish','q5pclear'];
const cmds=names.map(x=>'hartlogistics:'+x);
function instance({records=new Map(),ready=true,writeFault=null,readFault=false}={}) {
  const commands=new Map(),writes=[],chat=[],logs=[],queued=[];
  let fault=writeFault,readBroken=readFault;
  const context={
    CommandPermissionLevel:{GameDirectors:2},
    log:message=>logs.push(message),
    world:{
      getDynamicProperty(key){
        if(readBroken)throw Error('read unavailable');
        return records.get(key);
      },
      setDynamicProperty(key,value){
        writes.push({key,value});
        if(fault && fault(key,value))throw Error('simulated write failure');
        if(value===undefined)records.delete(key);else records.set(key,value);
      }
    },
    system:{
      beforeEvents:{startup:{subscribe(callback){
        callback({customCommandRegistry:{
          registerCommand:(meta,fn)=>commands.set(meta.name,{meta,fn})
        }});
      }}},
      run:fn=>{queued.push(fn);fn();}
    }
  };
  vm.runInNewContext('let ready='+String(ready)+';\n'+source,context);
  const origin={sourceEntity:{sendMessage:s=>chat.push(s)}};
  const invoke=short=>{
    const c=commands.get('hartlogistics:'+short);
    assert.ok(c,short);
    c.fn(origin);
    return chat.at(-1);
  };
  return {
    records,writes,chat,logs,commands,origin,invoke,context,
    get queued(){return queued.length;},
    setReadFault(value){readBroken=value;},
    setWriteFault(value){fault=value;}
  };
}
function onlyTempWrites(f){
  for(const x of f.writes)
    assert.ok([HISTORY,MARKER].includes(x.key),x.key);
}
test('four scoped, GameDirectors-only, no-cheat commands, no startup writes',()=>{
  const f=instance();
  assert.deepEqual([...f.commands.keys()],cmds);
  for(const c of f.commands.values()){
    assert.equal(c.meta.permissionLevel,2);
    assert.equal(c.meta.cheatsRequired,false);
  }
  assert.equal(f.writes.length,0);
  assert.equal(f.queued,0);
  assert.equal(f.records.size,0);
});
test('read-only check of virgin world reports clean without writing a property',()=>{
  const f=instance();
  assert.match(f.invoke('q5pcheck'),/CLEAN: both temporary keys absent/);
  assert.equal(f.writes.length,0);
});
test('operator start writes history only and reads it back',()=>{
  const f=instance();
  assert.match(f.invoke('q5pstart'),/HISTORY_ONLY: temporary history written/);
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].key,HISTORY);
  assert.equal(f.records.has(MARKER),false);
  assert.equal(JSON.parse(f.records.get(HISTORY)).kind,'history');
  assert.match(f.invoke('q5pcheck'),/HISTORY_ONLY: history persisted/);
  onlyTempWrites(f);
});
test('fresh server VM sees history written before normal restart, without auto-write',()=>{
  const f=instance();f.invoke('q5pstart');
  const restarted=instance({records:f.records});
  assert.equal(restarted.writes.length,0);
  assert.match(restarted.invoke('q5pcheck'),/HISTORY_ONLY: history persisted/);
  assert.equal(restarted.records.has(MARKER),false);
});
test('finish only from verified history-only state and observes both test keys',()=>{
  const f=instance();
  assert.match(f.invoke('q5pfinish'),/HOLD: not in exact history-only/);
  assert.equal(f.writes.length,0);
  f.invoke('q5pstart');
  assert.match(f.invoke('q5pfinish'),/BOTH_PRESENT: two isolated test keys now match/);
  assert.equal(f.writes.length,2);
  assert.deepEqual(f.writes.map(x=>x.key),[HISTORY,MARKER]);
  assert.equal(JSON.parse(f.records.get(MARKER)).authority,'NO_Q4_OR_Q5_CHANGE');
  assert.match(f.invoke('q5pcheck'),/BOTH_PRESENT: test marker\/history match/);
  onlyTempWrites(f);
});
test('double start and double finish refuse without modifying existing records',()=>{
  const f=instance();
  f.invoke('q5pstart');
  const old=f.records.get(HISTORY);
  assert.match(f.invoke('q5pstart'),/HOLD: test keys not both clean/);
  assert.equal(f.records.get(HISTORY),old);
  f.invoke('q5pfinish');
  assert.match(f.invoke('q5pfinish'),/HOLD: not in exact history-only/);
  assert.equal(f.writes.length,2);
});
test('cleanup clears exactly both test-only keys and verifies absence',()=>{
  const f=instance();
  f.invoke('q5pstart');f.invoke('q5pfinish');
  assert.match(f.invoke('q5pclear'),/CLEAN: both temporary keys verified absent/);
  assert.equal(f.records.has(HISTORY),false);
  assert.equal(f.records.has(MARKER),false);
  assert.deepEqual(f.writes.map(x=>x.key),[HISTORY,MARKER,MARKER,HISTORY]);
  onlyTempWrites(f);
});
test('cleanup on already-clean world is an idempotent no-op',()=>{
  const f=instance();
  assert.match(f.invoke('q5pclear'),/CLEAN/);
  assert.equal(f.writes.length,0);
  assert.match(f.invoke('q5pcheck'),/CLEAN/);
});
test('cleanup after a partial clear remains safe and completes without deletion of unrelated keys',()=>{
  const records=new Map([['foreign:world','unrelated']]);
  const f=instance({records});
  f.invoke('q5pstart');f.invoke('q5pfinish');
  let failed=false;
  f.setWriteFault((key,value)=>{
    if(key===HISTORY && value===undefined && !failed){
      failed=true;return true;
    }
    return false;
  });
  assert.match(f.invoke('q5pclear'),/HOLD: partial test-key cleanup/);
  assert.equal(f.records.has(MARKER),false);
  assert.equal(f.records.has(HISTORY),true);
  f.setWriteFault(null);
  assert.match(f.invoke('q5pclear'),/CLEAN/);
  assert.equal(f.records.get('foreign:world'),'unrelated');
  assert.equal(f.records.size,1);
});
test('a marker-only partial clear is allowed only for exact owned value',()=>{
  const f=instance();
  f.invoke('q5pstart');f.invoke('q5pfinish');
  f.records.delete(HISTORY);
  assert.match(f.invoke('q5pcheck'),/HOLD: partial temporary cleanup/);
  assert.match(f.invoke('q5pclear'),/CLEAN/);
  assert.equal(f.records.size,0);
});
test('unknown preexisting history refuses all writable commands',()=>{
  const f=instance({records:new Map([[HISTORY,'unrelated source']])});
  assert.match(f.invoke('q5pstart'),/HOLD/);
  assert.match(f.invoke('q5pfinish'),/HOLD/);
  assert.match(f.invoke('q5pclear'),/HOLD: unknown test keys/);
  assert.equal(f.records.get(HISTORY),'unrelated source');
  assert.equal(f.writes.length,0);
});
test('unknown preexisting marker also prevents overwrites or cleanup',()=>{
  const f=instance({records:new Map([[MARKER,'foreign']])});
  for(const cmd of ['q5pstart','q5pfinish','q5pclear'])
    assert.match(f.invoke(cmd),/HOLD/);
  assert.equal(f.writes.length,0);
  assert.equal(f.records.get(MARKER),'foreign');
});
test('read failure reports HOLD without fallback writer',()=>{
  const f=instance({readFault:true});
  assert.match(f.invoke('q5pcheck'),/HOLD: property read failed/);
  assert.match(f.invoke('q5pstart'),/HOLD/);
  assert.match(f.invoke('q5pclear'),/HOLD/);
  assert.equal(f.writes.length,0);
});
test('history write failure cannot proceed to marker',()=>{
  const f=instance({writeFault:key=>key===HISTORY});
  assert.match(f.invoke('q5pstart'),/HOLD: test-only history write failed/);
  assert.equal(f.writes.length,1);
  assert.equal(f.records.has(MARKER),false);
  assert.match(f.invoke('q5pfinish'),/HOLD/);
});
test('marker write failure leaves history and cannot report success',()=>{
  const f=instance({writeFault:key=>key===MARKER});
  f.invoke('q5pstart');
  assert.match(f.invoke('q5pfinish'),/HOLD: test-only marker write failed/);
  assert.equal(f.records.has(MARKER),false);
  assert.match(f.invoke('q5pcheck'),/HISTORY_ONLY/);
  assert.match(f.invoke('q5pclear'),/CLEAN/);
});
test('uninitialized legacy runtime refuses every state transition',()=>{
  const f=instance({ready:false});
  for(const cmd of names)
    assert.match(f.invoke(cmd),/HOLD: legacy runtime initialization incomplete/);
  assert.equal(f.writes.length,0);
});
test('console invocation falls back to log rather than dropping errors',()=>{
  const f=instance();
  f.commands.get(cmds[0]).fn({});
  assert.equal(f.logs.length,1);
  assert.match(f.logs[0],/CLEAN/);
});
test('other mod/Q4 records and all state are unchanged by a complete synthetic session',()=>{
  const records=new Map([
    ['hartsorter:q4m_q1','unmodified'],
    ['hartsorter:queue_journal_v1','legacy untouched'],
    ['hartlogistics:q5_maintenance_marker_v1','DO NOT TOUCH'],
    ['foreign:pack_state','KEEP']
  ]);
  const original=[...records],f=instance({records});
  f.invoke('q5pcheck');f.invoke('q5pstart');f.invoke('q5pfinish');
  const restarted=instance({records:f.records});
  restarted.invoke('q5pcheck');
  restarted.invoke('q5pclear');
  assert.deepEqual([...records],original);
  onlyTempWrites(f);onlyTempWrites(restarted);
});
