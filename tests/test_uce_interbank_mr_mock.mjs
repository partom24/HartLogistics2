import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/**
 * Exact UCE bridge function, run with source and generated main.js. The
 * underlying real native port and carrier-ticket persistence are covered
 * separately by their own crash-injection suites. This fixture verifies
 * the COMPLETE interbank orchestration and ordering, not BDS disk behavior.
 */
const baseline=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const compiled=process.env.UCE_GENERATED_MAIN?
  fs.readFileSync(process.env.UCE_GENERATED_MAIN,'utf8'):undefined;
function one(src,name){
  const at=src.indexOf('function '+name+'(');
  assert.ok(at>=0,'missing runtime function '+name);
  const start=src.indexOf('{',at);
  let depth=0;
  for(let i=start;i<src.length;i++){
    if(src[i]==='{')depth++;
    else if(src[i]==='}'&&--depth===0)
      return src.slice(at,i+1);
  }
  throw Error('unterminated '+name);
}
const fn=one(compiled||baseline,'uceTryInterbankMrHandoff');
const id1='minecraft:overworld|4|70|4';
const id2='minecraft:overworld|24|70|4';
const worldId='world-mr',epoch=14;
function fixture({missingTarget=false,fullTarget=false,failTicket='',
                 afterMoveRevoke=false,metadata='named'}={}){
  const calls=[];
  const sourceItem={typeId:'minecraft:enchanted_book',amount:1,
    nameTag:metadata,lore:['original enchantment payload'],
    hiddenMetadata:{components:['do-not-serialize','do-not-rebuild']}};
  const slotsA=Array(9).fill(undefined);
  const slotsB=Array(9).fill(undefined);
  slotsA[0]=sourceItem;
  if(fullTarget)for(let i=0;i<9;i++)
    slotsB[i]={typeId:'minecraft:stone',amount:64};
  function container(slots){
    return {size:9,isValid:true,
      getItem:i=>slots[i],
      moveItem(from,to,dest){
        const item=slots[from];
        assert.ok(item);
        assert.equal(dest.getItem(to),undefined);
        slots[from]=undefined;
        dest._slots[to]=item;
      },
      _slots:slots};
  }
  const ca=container(slotsA),cb=container(slotsB);
  const first={id:id1,d:'minecraft:overworld',x:4,y:70,z:4};
  const final={id:id2,d:'minecraft:overworld',x:24,y:70,z:4};
  const anchorA={dimensionId:first.d,x:first.x,y:first.y,z:first.z};
  const anchorB={dimensionId:final.d,x:final.x,y:final.y,z:final.z};
  let registered=!missingTarget;
  let released=false,admitted=false,journal=false,ack=false,validRoute=true;
  const selected={receiver:final,hops:1,witness:'IB1|loaded-filter-path'};
  const registry={
    inspectHost({ownerId}){
      if(ownerId===id2&&!registered)return {
        ok:false,reason:'carrier_record_missing'};
      return ownerId===id1?{ok:true,container:ca}:
        ownerId===id2?{ok:true,container:cb}:
          {ok:false,reason:'unverified_owner'};
    },
    registerEmptyHost({ownerId}){
      calls.push('REGISTER_EMPTY');
      assert.equal(ownerId,id2);
      registered=true;
      return {ok:true,status:'EMPTY_NATIVE_HOST_REGISTERED'};
    },
    inspectCustody({ownerId}){
      if(ownerId===id1)return {ok:true,slots:released?[]:[0],
        free:released?9:8};
      if(ownerId===id2)return {ok:true,
        slots:admitted?[0]:[],
        free:fullTarget?0:admitted?8:9};
      return {ok:false};
    },
    stageMovedTicket({ownerId}){
      calls.push(ownerId===id1?'RELEASE':'ADMIT');
      if(failTicket==='release'&&ownerId===id1)
        return {ok:false,reason:'source_ticket_save_failed'};
      if(failTicket==='admit'&&ownerId===id2)
        return {ok:false,reason:'dest_ticket_save_failed'};
      if(ownerId===id1)released=true;
      else admitted=true;
      return {ok:true,status:'NATIVE_TICKET_STAGED_FOR_ACK'};
    },
    durableOwnershipWitness:()=>released||admitted
  };
  const ctx={
    world:{},
    uceClassifyLiveStack:()=> 'MR',
    ucePipeRouteNetwork:()=>({id:'verified'}),
    uceSelectInterbankFilteredRoute:()=>validRoute?selected:undefined,
    uceLiveReceiverOwner:()=>true,
    uceNativeReceiptId:()=> 'mr-federation-1',
    uceLegacyWriterBlocked:()=>true,
    uceAuthoritySnapshot:()=>({worldId,epoch}),
    createUnifiedNativePort:opts=>{
      calls.push('PORT');
      return {ok:true,
        moveWhole({operationId,from,to}){
          calls.push('MOVE');
          assert.equal(operationId,'mr-federation-1');
          assert.equal(opts.verifyEndpointOwner(from),true);
          assert.equal(opts.verifyEndpointOwner(to),true);
          from.container.moveItem(from.slot,to.slot,to.container);
          journal=true;
          if(afterMoveRevoke)validRoute=false;
          return {ok:true,status:'NATIVE_MOVED_PENDING_OWNERSHIP_ACK',
            destinationWitness:{amount:1}};
        },
        ackWhole({operationId,from,to}){
          calls.push('ACK');
          if(!journal||!opts.verifyEndpointOwner(from)||
             !opts.verifyEndpointOwner(to)||
             !opts.durableOwnershipWitness({
               operationId,from,to}))
            return {ok:false,reason:'dual_custody_or_route_not_proved'};
          ack=true;journal=false;
          return {ok:true,status:'NATIVE_CUSTODY_ACK_READBACK'};
        }
      };
    }
  };
  vm.runInNewContext(fn,ctx);
  const run=()=>ctx.uceTryInterbankMrHandoff(
    {worldId,epoch},first,registry,{container:ca},anchorA,
    0,sourceItem);
  return {run,calls,sourceItem,slotsA,slotsB,registry,
    get journal(){return journal;},
    get ack(){return ack;},
    revoke(){validRoute=false;}};
}
test('native MR moves the SAME metadata-rich item and saves BOTH carrier tickets before ACK',()=>{
  const f=fixture();
  const result=f.run();
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.status,'INTERBANK_MR_NATIVE_CUSTODY_ACK');
  assert.deepEqual(f.calls,['PORT','MOVE','RELEASE','ADMIT','ACK']);
  assert.equal(f.slotsA[0],undefined);
  assert.equal(f.slotsB[0],f.sourceItem);
  assert.equal(f.slotsB[0].hiddenMetadata,f.sourceItem.hiddenMetadata);
  assert.equal(f.journal,false);
  assert.equal(f.ack,true);
});
test('new target host only registered after real MR and verified physical linked Filter',()=>{
  const f=fixture({missingTarget:true});
  const result=f.run();
  assert.equal(result.ok,true,result.reason);
  assert.equal(f.calls[0],'REGISTER_EMPTY');
  assert.equal(f.slotsB[0],f.sourceItem);
});
test('second-owner ticket failure leaves native journal pending and never ACKs',()=>{
  const f=fixture({failTicket:'admit'});
  const result=f.run();
  assert.equal(result.ok,false);
  assert.ok(result.reason.includes('interbank_mr_target_ticket'));
  assert.equal(f.journal,true);
  assert.equal(f.ack,false);
  assert.deepEqual(f.calls,['PORT','MOVE','RELEASE','ADMIT']);
  assert.equal(f.slotsA[0],undefined);
  assert.equal(f.slotsB[0],f.sourceItem);
});
test('source ticket failure never authorizes destination ticket or ACK',()=>{
  const f=fixture({failTicket:'release'});
  const r=f.run();
  assert.equal(r.ok,false);
  assert.deepEqual(f.calls,['PORT','MOVE','RELEASE']);
  assert.equal(f.journal,true);
  assert.equal(f.ack,false);
});
test('changed Collector path after native move HOLDS with the original item in target host',()=>{
  const f=fixture({afterMoveRevoke:true});
  const result=f.run();
  assert.equal(result.ok,false);
  assert.ok(result.reason.includes('interbank_mr_ack'));
  assert.equal(f.slotsB[0],f.sourceItem);
  assert.equal(f.journal,true);
  assert.equal(f.ack,false);
});
test('full destination carrier never attempts a physical MR move',()=>{
  const f=fixture({fullTarget:true});
  const result=f.run();
  assert.equal(result.ok,false);
  assert.equal(result.reason,'interbank_mr_target_carrier_full');
  assert.deepEqual(f.calls,[]);
  assert.equal(f.slotsA[0],f.sourceItem);
  assert.equal(f.ack,false);
});
test('invalid route is not interpreted as authority to synthesize another MR item',()=>{
  const f=fixture();f.revoke();
  assert.equal(f.run(),undefined);
  assert.deepEqual(f.calls,[]);
  assert.equal(f.slotsA[0],f.sourceItem);
});
