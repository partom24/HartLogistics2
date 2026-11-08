import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../candidates/pg29/q5_audit_overlay.js',import.meta.url),'utf8');

function fixture(result={ok:true,total:12,entryCount:2,snapshotFingerprint:'fnv32:1234abcd'}) {
  const commands=new Map(),logs=[],chat=[],audits=[];
  const context={
    CommandPermissionLevel:{GameDirectors:2},
    log:text=>logs.push(text),
    world:{id:'world'},
    sampleQ4WorldReadOnly:args=>{audits.push(args);return result},
    system:{
      beforeEvents:{startup:{subscribe:callback=>callback({
        customCommandRegistry:{registerCommand:(meta,callback)=>commands.set(meta.name,{meta,callback})}
      })}},
      run:callback=>callback()
    }
  };
  vm.runInNewContext('let ready=true;let logistics={receivers:['+
    '{id:"receiver-small",queueKey:"q1",d:"minecraft:overworld",x:1,y:70,z:1,queued:2},'+
    '{id:"receiver-big",queueKey:"q2",d:"minecraft:overworld",x:2,y:70,z:2,queued:200}'+
    ']};\n'+source,context);
  const origin={sourceEntity:{sendMessage:s=>chat.push(s)}};
  return {commands,logs,chat,audits,origin,context,
          invoke:()=>commands.get('hartlogistics:q5audit').callback(origin)};
}

test('one temporary operator-only no-cheat audit command and no automatic scan',()=>{
  const f=fixture();
  assert.deepEqual([...f.commands.keys()],['hartlogistics:q5audit']);
  const command=f.commands.get('hartlogistics:q5audit').meta;
  assert.equal(command.permissionLevel,2);
  assert.equal(command.cheatsRequired,false);
  assert.equal(f.audits.length,0);
});

test('explicit audit selects registered largest Receiver, does not write inventory',()=>{
  const f=fixture();
  f.invoke();
  assert.equal(f.audits.length,1);
  assert.equal(f.audits[0].receiver.id,'receiver-big');
  assert.equal(f.audits[0].world,f.context.world);
  assert.equal(f.chat.length,3);
  assert.match(f.chat[0],/12 items in 2 entries/);
  assert.match(f.chat[2],/NO Q5 WRITES OR AUTHORITY CHANGE/);
});

test('scanner HOLD remains HOLD with no recovery or replay command',()=>{
  const f=fixture({ok:false,reason:'journal_not_clear'});
  f.invoke();
  assert.equal(f.chat.length,1);
  assert.match(f.chat[0],/HOLD: journal_not_clear/);
  assert.doesNotMatch(f.chat[0],/CLEAR|RETRY|REPAIR/i);
});

test('scanner exception reports HOLD and does not spawn alternate writer',()=>{
  const f=fixture();
  f.context.sampleQ4WorldReadOnly=()=>{throw Error('unloaded')};
  f.invoke();
  assert.equal(f.chat.length,1);
  assert.match(f.chat[0],/HOLD: read-only scanner threw/);
});

test('console command has a read-only log fallback',()=>{
  const f=fixture();
  f.commands.get('hartlogistics:q5audit').callback({});
  assert.equal(f.chat.length,0);
  assert.equal(f.logs.length,3);
  assert.match(f.logs[0],/Q4 snapshot structurally observed/);
});
