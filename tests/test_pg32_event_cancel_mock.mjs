import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const overlay = fs.readFileSync(
  new URL('../candidates/pg32/event_cancel_overlay.js',import.meta.url),'utf8'
);
const classId='hartsorter:collector';
function fixture(){
  const commands=new Map(),messages=[],logs=[];
  const player={
    id:'owner-1',typeId:'minecraft:player',
    sendMessage:m=>messages.push(m)
  };
  const system={
    currentTick:100,
    beforeEvents:{startup:{subscribe:fn=>{
      fn({customCommandRegistry:{
        registerCommand:(spec,fn)=>{
          assert.equal(spec.permissionLevel,2);
          assert.equal(spec.cheatsRequired,false);
          commands.set(spec.name,fn);
        }
      }});
    }}},
    run(fn){fn();}
  };
  const world={
    getDynamicProperty(){throw Error('PG32 must not read Q4');},
    setDynamicProperty(){throw Error('PG32 must not mutate Q4');}
  };
  const context=vm.createContext({
    system,world,log:s=>logs.push(s),
    CommandPermissionLevel:{GameDirectors:2}
  });
  vm.runInContext(overlay,context,{filename:'pg32-event-overlay.js'});
  const command=(name,origin={sourceEntity:player})=>{
    const f=commands.get('hartlogistics:'+name);
    assert.ok(f,'missing '+name);
    f(origin);
  };
  const event=(block=classId,p=player)=>({
    player:p,block:{typeId:block},isFirstEvent:true,cancel:false
  });
  let calls=0;
  const simulate=e=>{
    if(context.pg32CancelBeforeInteract(e)) return 'CANCELLED';
    calls++; return 'ORIGINAL';
  };
  return {system,player,commands,messages,logs,command,event,simulate,
    get calls(){return calls;},context};
}

test('commands exist only as GameDirector and no-cheat in startup registration',()=>{
  const f=fixture();
  assert.deepEqual([...f.commands.keys()].sort(),[
    'hartlogistics:q5cancelarm','hartlogistics:q5cancelcheck',
    'hartlogistics:q5cancelclear'
  ]);
  assert.equal(f.simulate(f.event()),'ORIGINAL');
  assert.equal(f.calls,1);
});

test('operator arming cancels exactly one Collector click, no original callback',()=>{
  const f=fixture();
  f.command('q5cancelarm');
  const first=f.event();
  assert.equal(f.simulate(first),'CANCELLED');
  assert.equal(first.cancel,true);
  assert.equal(f.calls,0);
  const second=f.event();
  assert.equal(f.simulate(second),'ORIGINAL');
  assert.equal(second.cancel,false);
  assert.equal(f.calls,1);
  f.command('q5cancelcheck');
  assert.match(f.messages.at(-1),/last=CANCEL_READBACK_TRUE cancelled=1 armed=NO/);
});

test('unarmed interaction is identical to normal PG27 callback admission',()=>{
  const f=fixture();
  for(let i=0;i<3;i++){
    const e=f.event();
    assert.equal(f.simulate(e),'ORIGINAL');
    assert.equal(e.cancel,false);
  }
  assert.equal(f.calls,3);
});

test('different player or vanilla/non-Collector block never cancelled',()=>{
  const f=fixture();
  f.command('q5cancelarm');
  const other={id:'other',typeId:'minecraft:player'};
  for(const e of [
    f.event(classId,other),
    f.event('minecraft:chest'),
    f.event('hartsorter:receiver'),
    f.event('hartsorter:sorter')
  ]){
    assert.equal(f.simulate(e),'ORIGINAL');
    assert.equal(e.cancel,false);
  }
  assert.equal(f.simulate(f.event()),'CANCELLED');
  assert.equal(f.calls,4);
});

test('expired arming leaves Collector interaction untouched',()=>{
  const f=fixture();
  f.command('q5cancelarm');
  f.system.currentTick+=1201;
  assert.equal(f.simulate(f.event()),'ORIGINAL');
  f.command('q5cancelcheck');
  assert.match(f.messages.at(-1),/last=EXPIRED cancelled=0 armed=NO/);
});

test('operator can manually disarm without executing any interaction',()=>{
  const f=fixture();
  f.command('q5cancelarm');
  f.command('q5cancelclear');
  assert.equal(f.simulate(f.event()),'ORIGINAL');
  f.command('q5cancelcheck');
  assert.match(f.messages.at(-1),/last=DISARMED cancelled=0 armed=NO/);
});

test('non-player command origin cannot arm or clear an operator ticket',()=>{
  const f=fixture();
  f.command('q5cancelarm',{sourceEntity:{id:'console',typeId:'minecraft:command_block'}});
  assert.equal(f.simulate(f.event()),'ORIGINAL');
  assert.equal(f.calls,1);
  f.command('q5cancelcheck',{sourceEntity:null});
  assert.match(f.logs.at(-1),/HOLD: operator player required/);
});

test('second operator cannot disarm a first operator arm',()=>{
  const f=fixture();
  f.command('q5cancelarm');
  const other={id:'other',typeId:'minecraft:player',sendMessage:()=>{}};
  f.command('q5cancelclear',{sourceEntity:other});
  assert.equal(f.simulate(f.event()),'CANCELLED');
});

test('cancel setter exception does not throw or change actual callback default',()=>{
  const f=fixture();
  f.command('q5cancelarm');
  const e={player:f.player,block:{typeId:classId},isFirstEvent:true};
  Object.defineProperty(e,'cancel',{set(){throw Error('read-only event');}});
  assert.equal(f.simulate(e),'ORIGINAL');
  f.command('q5cancelcheck');
  assert.match(f.messages.at(-1),/last=CANCEL_EXCEPTION_HOLD cancelled=0 armed=NO/);
});

test('failure to readback cancel never claims diagnostic PASS',()=>{
  const f=fixture();
  f.command('q5cancelarm');
  const e={player:f.player,block:{typeId:classId},isFirstEvent:true};
  Object.defineProperty(e,'cancel',{get(){return false;},set(){}});
  assert.equal(f.simulate(e),'ORIGINAL');
  f.command('q5cancelcheck');
  assert.match(f.messages.at(-1),/last=CANCEL_READBACK_FAILED cancelled=0 armed=NO/);
});

test('invalid tick availability prevents arming instead of persisting indefinite ticket',()=>{
  const f=fixture();
  f.system.currentTick=undefined;
  f.command('q5cancelarm');
  assert.equal(f.simulate(f.event()),'ORIGINAL');
  assert.match(f.messages[0],/HOLD: player\/tick unavailable/);
});

test('overlay has no runtime Q5 marker, Q4 or physical ItemStack operations',()=>{
  for(const forbidden of [
    'setDynamicProperty(', 'setItem(', 'moveItem(', 'transferItem(',
    'saveJournal(', 'saveQueueJournal(', 'new ItemStack(',
    'q5_maintenance_marker_v1'
  ])assert.equal(overlay.includes(forbidden),false,forbidden);
  assert.equal(overlay.includes('ev.cancel = true;'),true);
});

test('repeat interaction events do not spend the one-shot arm',()=>{
  const f=fixture();
  f.command('q5cancelarm');
  const repeated=f.event();
  repeated.isFirstEvent=false;
  assert.equal(f.simulate(repeated),'ORIGINAL');
  assert.equal(repeated.cancel,false);
  assert.equal(f.simulate(f.event()),'CANCELLED');
  f.command('q5cancelcheck');
  assert.match(f.messages.at(-1),/cancelled=1 armed=NO/);
});
