import test from 'node:test';
import assert from 'node:assert/strict';
import {previewUnifiedMigrationPreflight} from
  '../candidates/transport/unified_migration_preflight.mjs';

const ordinary={typeId:'minecraft:stone',lore:[],ench:[],
  canDestroy:[],canPlaceOn:[]};
function fixture(groups=[[{definition:ordinary,amount:4}],
                         [{definition:ordinary,amount:7}]]){
  const values=new Map(),receivers=[];
  let writes=0;
  groups.forEach((rows,i)=>{
    const id='minecraft:overworld|'+i+'|70|4',queueKey='q'+(i+1);
    receivers.push({id,d:'minecraft:overworld',x:i,y:70,z:4,
      present:true,queueKey});
    const n=rows.length,total=rows.reduce((s,x)=>s+x.amount,0);
    values.set('hartsorter:q4m_'+queueKey,JSON.stringify({
      v:4,h:n?1:0,t:n,n:n+1,q:total,r:total,d:0
    }));
    if(n){
      values.set('hartsorter:q4p_'+queueKey+'_0',
        JSON.stringify([0,rows.map((row,j)=>['d'+j,row.amount])]));
      rows.forEach((row,j)=>values.set(
        'hartsorter:q4d_'+queueKey+'_d'+j,JSON.stringify(row.definition)));
    }
  });
  values.set('hartsorter:logistics_v2',JSON.stringify({
    collectors:[],receivers,nextQueue:groups.length+1
  }));
  const world={
    getDynamicProperty:k=>values.get(k),
    getDynamicPropertyIds:()=>[...values.keys()],
    setDynamicProperty(){writes++;}
  };
  return {world,values,receivers,get writes(){return writes;}};
}
test('derives complete Q4 Receiver and count census with zero world writes',()=>{
  const f=fixture(),before=JSON.stringify([...f.values]);
  const x=previewUnifiedMigrationPreflight({world:f.world});
  assert.equal(x.ok,true,x.reason);
  assert.equal(x.receiverCount,2);
  assert.equal(x.q4ItemCount,11);
  assert.equal(x.ordinaryShapeCandidateCount,11);
  assert.equal(x.metadataRichOrUnknownCount,0);
  assert.equal(x.canMigrate,false);
  assert.equal(x.hasFrozenWorldProof,false);
  assert.equal(x.hasNativeRoundTripProof,false);
  assert.equal(f.writes,0);
  assert.equal(JSON.stringify([...f.values]),before);
});
test('named or otherwise opaque legacy rows HOLD, never flatten',()=>{
  const f=fixture([[{definition:{...ordinary,nameTag:'Precious'},amount:3},
    {definition:{...ordinary,typeId:'minecraft:enchanted_book'},amount:1}]]);
  const x=previewUnifiedMigrationPreflight({world:f.world});
  assert.equal(x.ok,false);
  assert.equal(x.reason,'legacy_metadata_rich_or_unknown_items');
  assert.equal(x.metadataRichOrUnknownCount,4);
  assert.equal(x.ordinaryShapeCandidateCount,0);
  assert.equal(x.canModifyWorld,false);
  assert.equal(f.writes,0);
});
test('pending legacy journal or drifted Q4 counts fail preflight safely',()=>{
  for(const key of ['hartsorter:journal_v1',
                    'hartsorter:queue_journal_v1']){
    const f=fixture();f.values.set(key,'PREPARED');
    const x=previewUnifiedMigrationPreflight({world:f.world});
    assert.equal(x.ok,false);
    assert.match(x.reason,/journal_not_clear/);
    assert.equal(f.writes,0);
  }
  const f=fixture();
  const meta=JSON.parse(f.values.get('hartsorter:q4m_q1'));meta.q++;
  f.values.set('hartsorter:q4m_q1',JSON.stringify(meta));
  assert.equal(previewUnifiedMigrationPreflight({world:f.world}).ok,false);
});
test('missing, duplicate and changed source registry are all HOLD',()=>{
  const f=fixture();
  const obj=JSON.parse(f.values.get('hartsorter:logistics_v2'));
  obj.receivers[1].id=obj.receivers[0].id;
  f.values.set('hartsorter:logistics_v2',JSON.stringify(obj));
  assert.equal(previewUnifiedMigrationPreflight({world:f.world}).reason,
    'legacy_receiver_registry_invalid_or_legacy');
  const no=fixture();no.values.delete('hartsorter:logistics_v2');
  assert.equal(previewUnifiedMigrationPreflight({world:no.world}).ok,false);
  const drift=fixture(),original=drift.world.getDynamicProperty;
  let reads=0;
  drift.world.getDynamicProperty=key=>{
    const value=original(key);
    if(key==='hartsorter:logistics_v2'&&++reads===2)
      return value.replace('"nextQueue":3','"nextQueue":4');
    return value;
  };
  assert.equal(previewUnifiedMigrationPreflight({world:drift.world}).reason,
    'legacy_registry_changed_during_preflight');
});
test('existing UCE activation prohibits a second Q4 migration preflight',()=>{
  const f=fixture();f.values.set('hartlogistics:uce_authority_v1','REQUESTED');
  const x=previewUnifiedMigrationPreflight({world:f.world});
  assert.equal(x.reason,'uce_authority_already_present');
  assert.equal(f.writes,0);
});
test('empty receiver census remains read only',()=>{
  const f=fixture([]),x=previewUnifiedMigrationPreflight({world:f.world});
  assert.equal(x.ok,true,x.reason);
  assert.equal(x.receiverCount,0);
  assert.equal(x.q4ItemCount,0);
  assert.equal(x.canMigrate,false);
});

test('opaque migration preflight pinpoints affected Receiver queues without leaking metadata or writing Q4',()=>{
  const sensitive={...ordinary,nameTag:'Private custom name'};
  const f=fixture([
    [{definition:ordinary,amount:200000}],
    [{definition:sensitive,amount:3}],
    [{definition:ordinary,amount:6}],
    [{definition:{...ordinary,typeId:'minecraft:enchanted_book'},amount:1}]
  ]);
  const before=JSON.stringify([...f.values]);
  const result=previewUnifiedMigrationPreflight({world:f.world});
  assert.equal(result.ok,false);
  assert.equal(result.reason,'legacy_metadata_rich_or_unknown_items');
  assert.equal(result.receiverCount,4);
  assert.equal(result.q4ItemCount,200010);
  assert.equal(result.ordinaryShapeCandidateCount,200006);
  assert.equal(result.metadataRichOrUnknownCount,4);
  assert.equal(result.opaqueReceiverCount,2);
  assert.deepEqual(result.opaqueReceiverExamples.map(x=>x.queueKey),[
    'q2','q4'
  ]);
  assert.deepEqual(result.opaqueReceiverExamples.map(x=>x.opaqueItemCount),[
    3,1
  ]);
  assert.equal(result.opaqueReceiverExamples[0].receiverId,
    'minecraft:overworld|1|70|4');
  assert.equal(JSON.stringify(result.opaqueReceiverExamples)
    .includes('Private custom name'),false,
    'the diagnostic never prints private legacy item metadata');
  assert.equal(f.writes,0);
  assert.equal(JSON.stringify([...f.values]),before,
    'preflight cannot alter any source property or item count');
});
