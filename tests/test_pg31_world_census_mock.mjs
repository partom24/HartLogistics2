import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL(
  '../candidates/pg31/q4_world_census_overlay.js',import.meta.url),'utf8');
const command='hartlogistics:q5census';
const receiver=(n,count)=>({
  id:'minecraft:overworld|'+n+',70,-52',
  queueKey:'q'+(n+1),queued:count,
  d:'minecraft:overworld',x:n,y:70,z:-52
});
function fixture({
  receivers=[receiver(0,9),receiver(1,6)],
  ready=true,report=null,readError=null
}={}) {
  const registered=new Map(),logs=[],chat=[],audits=[],writes=[];
  const world={
    getDynamicPropertyIds:()=>[],
    getDynamicProperty:key=>undefined,
    setDynamicProperty:(key,value)=>{writes.push([key,value]);throw Error('unauthorized writer');}
  };
  const context=vm.createContext({
    CommandPermissionLevel:{GameDirectors:2},
    log:message=>logs.push(message),world,
    previewQ5WorldQ4Census:args=>{
      audits.push(args);
      if(readError)throw Error(readError);
      if(report!==null)return report;
      return {
        ok:true,status:'WORLD_Q4_CENSUS_READ_ONLY_ONLY',
        receiverCount:args.receivers.length,itemCount:args.expectedQueuedTotal,
        receivers:args.receivers.map((r,i)=>({
          id:r.id,queueKey:r.queueKey,
          itemCount:receivers[i].queued,entryCount:receivers[i].queued>0?1:0,
          fingerprint:'fnv32:12345678'
        })),
        hasNativeBlockResidencyProof:false,
        hasDurableGlobalFreezeProof:false,
        canMigrate:false,canWriteWorld:false
      };
    },
    system:{
      beforeEvents:{startup:{subscribe:callback=>callback({
        customCommandRegistry:{
          registerCommand:(meta,fn)=>registered.set(meta.name,{meta,fn})
        }
      })}},
      run:callback=>callback()
    }
  });
  vm.runInContext('let ready='+String(ready)+';\n'+
    'let logistics={receivers:'+JSON.stringify(receivers)+'};\n'+source,context);
  const origin={sourceEntity:{sendMessage:message=>chat.push(message)}};
  return {registered,logs,chat,audits,writes,context,world,origin,
    invoke:()=>registered.get(command).fn(origin)};
}
test('one operator-only command, no cheats, no automatic census or world writes',()=>{
  const f=fixture();
  assert.deepEqual([...f.registered.keys()],[command]);
  const metadata=f.registered.get(command).meta;
  assert.equal(metadata.permissionLevel,2);
  assert.equal(metadata.cheatsRequired,false);
  assert.equal(f.audits.length,0);
  assert.equal(f.writes.length,0);
});
test('entire registered Receiver list and exact Q4 claimed total are submitted',()=>{
  const f=fixture();
  f.invoke();
  assert.equal(f.audits.length,1);
  const seen=f.audits[0];
  assert.equal(seen.world,f.world);
  assert.equal(seen.worldId,'PG31-SOURCE-SHAPED-LAB-OBSERVATION-ONLY');
  assert.equal(seen.expectedReceiverCount,2);
  assert.equal(seen.expectedQueuedTotal,15);
  assert.equal(seen.registrySnapshotStable,true);
  assert.deepEqual(Array.from(seen.receivers,r=>r.id),
    [receiver(0,9).id,receiver(1,6).id]);
  assert.equal(f.chat.length,3);
  assert.match(f.chat[0],/STRUCTURAL PASS: 2 registered Receivers, 15 queued Q4 items in 2 queue entries/);
  assert.match(f.chat[2],/NO Q5 WRITES, NO AUTHORITY CHANGE/);
  assert.equal(f.writes.length,0);
});
test('representative 35 Receiver shape is read once without gameplay writes',()=>{
  const receipts=[90070,...Array.from({length:33},()=>800),3037];
  const f=fixture({receivers:receipts.map((n,i)=>receiver(i,n))});
  f.invoke();
  assert.equal(f.audits.length,1);
  assert.equal(f.audits[0].expectedReceiverCount,35);
  assert.equal(f.audits[0].expectedQueuedTotal,119507);
  assert.match(f.chat[0],/35 registered Receivers, 119507 queued Q4 items/);
  assert.match(f.chat[1],/Largest Receiver Q4: 90070 items/);
  assert.equal(f.writes.length,0);
});
test('single undercapacity receiver still reports count without assumptions of item type',()=>{
  const f=fixture({receivers:[receiver(0,1)]});
  f.invoke();
  assert.match(f.chat[0],/1 queued Q4 items in 1 queue entries/);
  assert.doesNotMatch(f.chat.join(' '),/native MR VERIFIED|crash atomic/i);
});
test('an observed whole-world HOLD never masquerades as a success',()=>{
  const f=fixture({report:{ok:false,reason:'journal_not_clear'}});
  f.invoke();
  assert.equal(f.chat.length,1);
  assert.match(f.chat[0],/HOLD: journal_not_clear/);
  assert.doesNotMatch(f.chat[0],/STRUCTURAL PASS/);
  assert.equal(f.writes.length,0);
});
test('missing world-property listing results in whole-world HOLD',()=>{
  const f=fixture({report:{ok:false,reason:'world_property_listing_unavailable'}});
  f.invoke();
  assert.match(f.chat[0],/HOLD: world_property_listing_unavailable/);
});
test('missing one Q4 page prevents a partial receiver report',()=>{
  const f=fixture({report:{ok:false,reason:'receiver_q4_refused:r1:missing_or_orphan_q4_page'}});
  f.invoke();
  assert.equal(f.chat.length,1);
  assert.match(f.chat[0],/HOLD/);
  assert.equal(f.writes.length,0);
});
test('read-only scanner throwing is caught and cannot call a repair writer',()=>{
  const f=fixture({readError:'simulated BDS property read'});
  f.invoke();
  assert.match(f.chat[0],/HOLD: read-only world census threw/);
  assert.equal(f.writes.length,0);
});
test('initialization incomplete refuses all Q4 scanning and writing',()=>{
  const f=fixture({ready:false});
  f.invoke();
  assert.match(f.chat[0],/HOLD: PG27 runtime registry not ready/);
  assert.equal(f.audits.length,0);
});
test('no registered receivers refuses rather than invented zero-world proof',()=>{
  const f=fixture({receivers:[]});
  f.invoke();
  assert.match(f.chat[0],/HOLD: Receiver count outside bounded census/);
  assert.equal(f.audits.length,0);
});
test('over 512 registered receivers refuses before any world-property scan',()=>{
  const f=fixture({receivers:Array.from({length:513},(_,i)=>receiver(i,0))});
  f.invoke();
  assert.match(f.chat[0],/HOLD: Receiver count outside bounded census/);
  assert.equal(f.audits.length,0);
});
test('malformed or coercible synthetic Receiver counts cannot be silently read',()=>{
  for(const amount of [undefined,null,-1,250001,'9',1.5,Number.MAX_SAFE_INTEGER]){
    const r=receiver(0,amount),f=fixture({receivers:[r]});
    f.invoke();
    assert.match(f.chat[0],/HOLD: unrecognized registered Receiver/);
    assert.equal(f.audits.length,0);
  }
});
test('unrecognized Receiver id/queueKey refused before world census',()=>{
  for(const change of [
    r=>{r.id=null;},r=>{r.queueKey=42;}
  ]){
    const r=receiver(0,9);change(r);
    const f=fixture({receivers:[r]});
    f.invoke();
    assert.match(f.chat[0],/HOLD: unrecognized registered Receiver/);
    assert.equal(f.audits.length,0);
  }
});
test('a claimed item count inconsistent with all Receiver totals is HOLD',()=>{
  const f=fixture({report:{
    ok:true,receiverCount:2,itemCount:14,
    receivers:[{itemCount:9,entryCount:1,fingerprint:'fnv32:xx'}],
    hasNativeBlockResidencyProof:false,hasDurableGlobalFreezeProof:false,
    canMigrate:false,canWriteWorld:false
  }});
  f.invoke();
  assert.match(f.chat[0],/HOLD: world or authority changed during observation/);
});
test('never accepts a scanner claiming live migration or world-write authority',()=>{
  for(const field of ['canMigrate','canWriteWorld','hasNativeBlockResidencyProof',
                      'hasDurableGlobalFreezeProof']){
    const f=fixture({report:{
      ok:true,receiverCount:2,itemCount:15,
      receivers:[
        {itemCount:9,entryCount:1,fingerprint:'fnv32:a'},
        {itemCount:6,entryCount:1,fingerprint:'fnv32:b'}
      ],
      hasNativeBlockResidencyProof:false,hasDurableGlobalFreezeProof:false,
      canMigrate:false,canWriteWorld:false,[field]:true
    }});
    f.invoke();
    assert.match(f.chat[0],/HOLD: world or authority changed during observation/);
  }
});
test('changed live Receiver registry during observation refuses entire result',()=>{
  const f=fixture();
  f.context.previewQ5WorldQ4Census=args=>{
    f.audits.push(args);
    vm.runInContext('logistics.receivers[0].queued++;',f.context);
    return {ok:true,receiverCount:2,itemCount:15,
      receivers:[
        {id:receiver(0,9).id,itemCount:9,entryCount:1,fingerprint:'fnv32:a'},
        {id:receiver(1,6).id,itemCount:6,entryCount:1,fingerprint:'fnv32:b'}
      ],
      hasNativeBlockResidencyProof:false,hasDurableGlobalFreezeProof:false,
      canMigrate:false,canWriteWorld:false};
  };
  f.invoke();
  assert.match(f.chat[0],/HOLD: world or authority changed during observation/);
});
test('missing report and no valid Receiver data fail closed',()=>{
  const f=fixture({report:{ok:false,reason:'unclaimed_q4_receiver_metadata'}});
  f.invoke();
  assert.match(f.chat[0],/HOLD: unclaimed_q4_receiver_metadata/);
});
test('a simple console invocation logs instead of silently discarding HOLD',()=>{
  const f=fixture({report:{ok:false,reason:'journal_not_clear'}});
  f.registered.get(command).fn({});
  assert.match(f.logs[0],/HOLD: journal_not_clear/);
  assert.equal(f.chat.length,0);
});
test('source command contains no world/inventory/journal mutations',()=>{
  for(const forbidden of [
    '.setDynamicProperty(','.setItem(','.moveItem(','.transferItem(',
    'saveQueueJournal(', 'saveJournal(', 'clearDynamicProperties(',
    'spawnEntity(', 'spawnItem(', 'new ItemStack('
  ])assert.equal(source.includes(forbidden),false,forbidden);
});
