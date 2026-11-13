import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceUnifiedReceiverMR} from
  '../candidates/transport/unified_receiver_mr_service.mjs';

const anchor={dimensionId:'minecraft:overworld',x:5,y:70,z:2};
function fixture(kind='MR'){
  const native={typeId:kind==='MR'?'minecraft:diamond_pickaxe':
    'minecraft:cobblestone',amount:1,nameTag:'owner sample'};
  const outputSlots=[undefined,undefined],writes=[];
  const carrier={size:9,getItem:i=>i===0?native:undefined};
  const terminal={size:2,getItem:i=>outputSlots[i]};
  const registry={
    inspectCustody:()=>({ok:true,occupied:1,free:8,slots:[0]}),
    inspectHost:()=>({ok:true,container:carrier}),
    stageMovedTicket:()=>{writes.push('ticket');
      return {ok:true,status:'NATIVE_TICKET_STAGED_FOR_ACK'};}
  };
  const port={
    moveWhole:({from,to})=>{
      writes.push('move');
      assert.equal(from.container,carrier);
      assert.equal(to.container,terminal);
      return {ok:true,status:'NATIVE_MOVED_PENDING_OWNERSHIP_ACK',
        destinationWitness:{amount:1}};
    },
    ackWhole:()=>{writes.push('ack');
      return {ok:true,status:'NATIVE_CUSTODY_ACK_READBACK'};}
  };
  const args={registry,port,ownerId:'receiver-5',anchor,
    direction:'egress',output:{ownerId:'output-hopper',
      container:terminal,blockVerified:true,locked:false},
    identify:()=>kind,operationId:'mr-output-op-1'};
  return {args,writes};
}
test('metadata-rich host ticket outputs through the one native port and ticket writer',()=>{
  const f=fixture('MR');
  const result=serviceUnifiedReceiverMR(f.args);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.moved,1);
  assert.deepEqual(f.writes,['move','ticket','ack']);
});
test('plain ordinary host ticket is HELD, never bypasses its ordinary-account debit',()=>{
  const f=fixture('ORDINARY');
  const r=serviceUnifiedReceiverMR(f.args);
  assert.equal(r.ok,false);
  assert.equal(r.reason,'native_egress_requires_mr_identity');
  assert.equal(r.moved,0);
  assert.deepEqual(f.writes,[]);
});
test('unclassified or unreadable carrier ItemStack is HELD with no native writes',()=>{
  const u=fixture('UNKNOWN');
  const r=serviceUnifiedReceiverMR(u.args);
  assert.equal(r.ok,false);
  assert.equal(r.reason,'native_egress_requires_mr_identity');
  assert.deepEqual(u.writes,[]);
  const broken=fixture('MR');
  broken.args.registry.inspectHost=()=>({ok:true,container:{
    size:9,getItem:()=>{throw Error('unreadable')}}});
  const x=serviceUnifiedReceiverMR(broken.args);
  assert.equal(x.ok,false);
  assert.equal(x.reason,'native_mr_egress_identity_unreadable');
  assert.deepEqual(broken.writes,[]);
});
