import test from 'node:test';
import assert from 'node:assert/strict';
import {q5IdentityKey} from '../candidates/transport/q5_bucket_core.mjs';
import {readOnlyQ4Snapshot} from '../candidates/transport/q5_q4_readonly_snapshot.mjs';
import {previewQ5WorldQ4Census} from '../candidates/transport/q5_world_receiver_census.mjs';
import {
  UCE_LEDGER_SCHEMA,UCE_RECEIVER_CAPACITY,UCE_BULK_MEMBER_CAPACITY,
  createEmptyUnifiedOrdinaryLedger,registerUnifiedEmptyAccount,
  stageUnifiedOrdinaryAccounts,inspectUnifiedOrdinaryLedger,
  createEmptyUnifiedOrdinaryLedger,registerUnifiedEmptyAccount,
  transitionUnifiedOrdinaryAccounts,transitionUnifiedOrdinaryBoundary
} from '../candidates/transport/unified_ordinary_accounts.mjs';

const item=(typeId='minecraft:cobblestone',extra={})=>({
  typeId,lore:[],ench:[],canDestroy:[],canPlaceOn:[],...extra
});
const proof=()=>({
  classification:'ordinary',losslessIdentity:true,metadataFree:true,
  runtimeStackable:true,runtimeMaxStack:64,verifiedFreshRoundTrip:true
});
function fixture(groups=[
  [{definition:item(),amount:12},{definition:item('minecraft:stone'),amount:8}],
  [{definition:item('minecraft:iron_ingot'),amount:16}]
], options={}) {
  const records=new Map(),receivers=[],sourceSnapshots=[],proofs=new Map();
  let total=0;
  for(let i=0;i<groups.length;i++){
    const queueKey='q'+(i+1),id='minecraft:overworld|'+i+',70,-40';
    const receiver={id,queueKey},rows=groups[i];
    receivers.push(receiver);
    const count=rows.reduce((n,x)=>n+x.amount,0);
    total+=count;
    const next=rows.length+1;
    records.set('hartsorter:q4m_'+queueKey,JSON.stringify({
      v:4,h:rows.length?1:0,t:rows.length,n:next,
      q:count,r:count+7,d:7
    }));
    if(rows.length){
      records.set('hartsorter:q4p_'+queueKey+'_0',JSON.stringify([
        0,rows.map((x,j)=>['d'+j,x.amount])
      ]));
    }
    rows.forEach((x,j)=>{
      records.set('hartsorter:q4d_'+queueKey+'_d'+j,
        JSON.stringify(x.definition));
      proofs.set(q5IdentityKey(x.definition),proof());
    });
  }
  const world={
    getDynamicPropertyIds:()=>[...records.keys()],
    getDynamicProperty:key=>records.get(key)
  };
  const worldId='minecraft:overworld:immutable-141-zip';
  const census=previewQ5WorldQ4Census({
    world,worldId,receivers,expectedReceiverCount:receivers.length,
    expectedQueuedTotal:total,registrySnapshotStable:true
  });
  assert.equal(census.ok,true,census.reason);
  for(const receiver of receivers){
    const snap=readOnlyQ4Snapshot({receiver,records,queueJournalClear:true,
      physicalJournalClear:true});
    assert.equal(snap.ok,true,snap.reason);
    sourceSnapshots.push(snap);
  }
  return {world,records,census,sourceSnapshots,proofs,
    bulkMemberIds:options.bulkMemberIds??['bank-b1'],epoch:8};
}
const stage=(f,changes={})=>stageUnifiedOrdinaryAccounts({
  worldCensus:f.census,sourceSnapshots:f.sourceSnapshots,
  ordinaryProofs:f.proofs,bulkMemberIds:f.bulkMemberIds,epoch:f.epoch,
  ...changes
});
const hold=(r,reason)=>{
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(r.status,'HOLD');
  if(reason)assert.equal(r.reason,reason);
  for(const k of ['canWriteWorld','canMoveItems','canCommitMigration','canClearQ4'])
    assert.equal(r[k],false,k);
};
function move(snapshot,from,to,key,count,op='tx-1',extra={}){
  return transitionUnifiedOrdinaryAccounts(snapshot,{
    operationId:op,from,to,key,count,
    expectedRevision:snapshot.revision,expectedEpoch:snapshot.epoch,
    ...extra
  });
}
test('real Q4 structure -> shared Receiver/Bulk account draft; exact counters and bytes untouched',()=>{
  const f=fixture(),before=JSON.stringify([...f.records]),r=stage(f);
  assert.equal(r.ok,true);
  assert.equal(r.status,'COLD_Q4_ACCOUNT_DRAFT_ONLY');
  assert.equal(r.snapshot.schema,UCE_LEDGER_SCHEMA);
  assert.equal(r.snapshot.total,36);
  assert.equal(r.matchedReceivers,2);
  assert.deepEqual(r.snapshot.accounts.map(a=>a.id),[
    'bulk:bank-b1','receiver:minecraft:overworld|0,70,-40',
    'receiver:minecraft:overworld|1,70,-40'
  ]);
  assert.equal(r.snapshot.accounts[0].capacity,UCE_BULK_MEMBER_CAPACITY);
  assert.equal(r.snapshot.accounts[1].capacity,UCE_RECEIVER_CAPACITY);
  assert.equal(r.snapshot.accounts[1].legacyQ4.received,27);
  assert.equal(r.snapshot.accounts[1].legacyQ4.delivered,7);
  assert.deepEqual(r.snapshot.accounts[1].lifetime,{received:27,delivered:7});
  assert.equal(inspectUnifiedOrdinaryLedger(r.snapshot).total,36);
  assert.equal(r.hasAuthenticatedFreeze,false);
  assert.equal(r.hasAtomicBedrockSaveProof,false);
  assert.equal(r.canCommitMigration,false);
  assert.equal(JSON.stringify([...f.records]),before);
});
test('one logical Receiver -> Bulk revision preserves both balances without any external write',()=>{
  const f=fixture(),s=stage(f).snapshot;
  const key=q5IdentityKey(item());
  const r=move(s,'receiver:minecraft:overworld|0,70,-40','bulk:bank-b1',key,9);
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.receipt.beforeRevision,0);
  assert.equal(r.receipt.afterRevision,1);
  assert.equal(r.next.total,36);
  assert.equal(r.next.accounts.find(a=>a.kind==='bulk').total,9);
  const receiver=r.next.accounts.find(a=>a.ownerId==='minecraft:overworld|0,70,-40');
  assert.equal(receiver.total,11);
  assert.equal(receiver.legacyQ4.received,27);
  assert.equal(inspectUnifiedOrdinaryLedger(r.next).ok,true);
  assert.equal(s.revision,0);
  assert.equal(s.accounts.find(a=>a.kind==='bulk').total,0);
  assert.equal(r.hasDurableReceipt,false);
  assert.equal(r.canWriteWorld,false);
});
test('reused expected revision cannot debit again',()=>{
  const s=stage(fixture()).snapshot;
  const key=q5IdentityKey(item());
  const args={operationId:'tx-1',
    from:'receiver:minecraft:overworld|0,70,-40',
    to:'bulk:bank-b1',key,count:4,expectedRevision:0,expectedEpoch:8};
  const a=transitionUnifiedOrdinaryAccounts(s,args);
  assert.equal(a.ok,true);
  hold(transitionUnifiedOrdinaryAccounts(a.next,args),
    'invalid_or_stale_transfer_request');
});
test('bulk->receiver and receiver->receiver share the same revision and item identity',()=>{
  const s=stage(fixture()).snapshot,key=q5IdentityKey(item());
  const a=move(s,'receiver:minecraft:overworld|0,70,-40','bulk:bank-b1',key,8);
  const b=move(a.next,'bulk:bank-b1','receiver:minecraft:overworld|1,70,-40',key,6,'tx-2');
  assert.equal(b.ok,true,b.reason);
  assert.equal(b.next.revision,2);
  assert.equal(b.next.total,36);
  assert.equal(b.next.accounts.find(x=>x.id==='bulk:bank-b1').total,2);
  const c=move(b.next,'receiver:minecraft:overworld|1,70,-40',
    'receiver:minecraft:overworld|0,70,-40',key,4,'tx-3');
  assert.equal(c.ok,true,c.reason);
  assert.equal(c.next.total,36);
  assert.equal(inspectUnifiedOrdinaryLedger(c.next).ok,true);
});
test('strict all-or-HOLD for metadata-rich or nonstackable source',()=>{
  for(const typeId of ['minecraft:diamond_sword','minecraft:enchanted_book',
                       'minecraft:filled_map','minecraft:shulker_box']){
    const f=fixture([[{definition:item(typeId),amount:1}]]);
    hold(stage(f),'q4_not_ordinary:native_or_opaque_item_type');
  }
});
test('metadata-rich ordinary type does not become a count bucket',()=>{
  const f=fixture([[{definition:item('minecraft:stone',{nameTag:'unique'}),amount:5}]]);
  hold(stage(f),'q4_not_ordinary:serialized_item_metadata_present');
});
test('missing runtime identity certification fails closed',()=>{
  const f=fixture();f.proofs.delete(q5IdentityKey(item('minecraft:stone')));
  hold(stage(f),'uncertified_ordinary_identity');
});
test('extra unverified identity refuses staging',()=>{
  const f=fixture();f.proofs.set(q5IdentityKey(item('minecraft:sand')),proof());
  hold(stage(f),'world_count_or_certification_mismatch');
});
test('modified Q4 fingerprint and missing Receiver refuse all-or-HOLD',()=>{
  const f=fixture(),bad=f.sourceSnapshots.map(s=>({...s}));
  bad[0].snapshotFingerprint='fnv32:aaaaaaaa';
  hold(stage(f,{sourceSnapshots:bad}),'q4_census_snapshot_mismatch');
  hold(stage(f,{sourceSnapshots:bad.slice(0,1)}),'invalid_cold_import_inputs');
});
test('tampered counts, duplicate buckets and reordered accounts cannot pass verification',()=>{
  const s=stage(fixture()).snapshot;
  const a=structuredClone(s);a.total++;
  hold(inspectUnifiedOrdinaryLedger(a),'ledger_conservation_mismatch');
  const b=structuredClone(s);
  b.accounts[1].buckets.push({...b.accounts[1].buckets[0]});
  hold(inspectUnifiedOrdinaryLedger(b),'invalid_or_unsorted_ordinary_bucket');
  const c=structuredClone(s);c.accounts.reverse();
  hold(inspectUnifiedOrdinaryLedger(c),'duplicate_or_unordered_account');
});
test('unknown account, insufficient balance and same-owner movement refuse mutation',()=>{
  const s=stage(fixture()).snapshot,key=q5IdentityKey(item());
  hold(move(s,'unknown','bulk:bank-b1',key,1),'unknown_account');
  hold(move(s,'receiver:minecraft:overworld|0,70,-40',
    'bulk:bank-b1',key,13),'insufficient_source_balance');
  hold(move(s,'bulk:bank-b1','bulk:bank-b1',key,1),'invalid_or_stale_transfer_request');
});
test('receiver and Bulk capacities enforced without partial debit',()=>{
  const f=fixture([[{definition:item(),amount:250000}]],{
    bulkMemberIds:['bank-b1']
  });
  const s=stage(f).snapshot;
  assert.equal(s.accounts.find(a=>a.kind==='receiver').total,250000);
  const key=q5IdentityKey(item()),src='receiver:minecraft:overworld|0,70,-40';
  const a=move(s,src,'bulk:bank-b1',key,200000);
  assert.equal(a.ok,true,a.reason);
  hold(move(a.next,src,'bulk:bank-b1',key,1,'tx-2'),'destination_full');
  hold(move(a.next,'bulk:bank-b1',src,key,200001,'tx-3'),
    'insufficient_source_balance');
  const b=move(a.next,'bulk:bank-b1',src,key,100000,'tx-4');
  assert.equal(b.ok,true,b.reason);
  assert.equal(b.next.accounts.find(x=>x.id===src).total,150000);
  assert.equal(b.next.total,250000);
});
test('zero/negative batch and incorrect epoch or revision refuse transition',()=>{
  const s=stage(fixture()).snapshot,key=q5IdentityKey(item());
  for(const count of [0,-1,1.5]){
    hold(move(s,'receiver:minecraft:overworld|0,70,-40',
      'bulk:bank-b1',key,count),'invalid_or_stale_transfer_request');
  }
  hold(move(s,'receiver:minecraft:overworld|0,70,-40',
    'bulk:bank-b1',key,1,'tx-1',{expectedEpoch:9}),
  'invalid_or_stale_transfer_request');
});
test('35 Receiver Q4 fixture builds deterministic ledger without loading a world',()=>{
  const f=fixture(Array.from({length:35},(_,i)=>[
    {definition:item(i%2?'minecraft:stone':'minecraft:cobblestone'),
      amount:10000+i}
  ]));
  const r=stage(f);
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.snapshot.accounts.length,36);
  assert.equal(r.snapshot.total,35*10000+34*35/2);
  assert.equal(r.matchedReceivers,35);
  assert.equal(inspectUnifiedOrdinaryLedger(r.snapshot).ok,true);
});
test('empty Q4 Receiver remains a real account and retains its lifetime counters',()=>{
  const f=fixture([[],[{definition:item(),amount:5}]]);
  const r=stage(f);
  assert.equal(r.ok,true,r.reason);
  const a=r.snapshot.accounts.find(x=>x.id==='receiver:minecraft:overworld|0,70,-40');
  assert.equal(a.total,0);
  assert.deepEqual(a.buckets,[]);
  assert.equal(a.legacyQ4.received,7);
  assert.equal(a.legacyQ4.delivered,7);
});


test('new worlds can create genuine Receiver and Bulk members without invented Q4 provenance',()=>{
  const empty=createEmptyUnifiedOrdinaryLedger({
    worldId:'minecraft:overworld:new-world',epoch:41
  });
  assert.equal(empty.ok,true);
  let s=empty.snapshot;
  const r=registerUnifiedEmptyAccount(s,{
    kind:'receiver',ownerId:'minecraft:overworld|10,70,10',
    expectedRevision:0,expectedEpoch:41
  });
  assert.equal(r.ok,true,r.reason);
  s=r.next;
  assert.equal(s.sourceReceivers.length,0);
  assert.equal(s.accounts[0].legacyQ4,undefined);
  assert.equal(inspectUnifiedOrdinaryLedger(s).ok,true);
  const b=registerUnifiedEmptyAccount(s,{
    kind:'bulk',ownerId:'minecraft:overworld|11,70,10',
    expectedRevision:1,expectedEpoch:41
  });
  assert.equal(b.ok,true,b.reason);
  assert.equal(b.next.revision,2);
  assert.equal(b.next.accounts.find(a=>a.kind==='bulk').capacity,200000);
  assert.equal(inspectUnifiedOrdinaryLedger(b.next).ok,true);
  hold(registerUnifiedEmptyAccount(s,{
    kind:'receiver',ownerId:'minecraft:overworld|10,70,10',
    expectedRevision:1,expectedEpoch:41
  }),'duplicate_account');
  hold(registerUnifiedEmptyAccount(s,{
    kind:'bulk',ownerId:'minecraft:overworld|11,70,10',
    expectedRevision:0,expectedEpoch:41
  }),'invalid_or_stale_registration');
});

test('new accounts coexist with imported Q4 accounts without changing imported source facts',()=>{
  const imported=stage(fixture()).snapshot;
  const r=registerUnifiedEmptyAccount(imported,{
    kind:'receiver',ownerId:'minecraft:overworld|99,70,-40',
    expectedRevision:imported.revision,expectedEpoch:imported.epoch
  });
  assert.equal(r.ok,true,r.reason);
  const s=r.next;
  assert.equal(s.accounts.filter(a=>a.kind==='receiver').length,3);
  assert.equal(s.sourceReceivers.length,2);
  assert.equal(s.total,36);
  assert.equal(inspectUnifiedOrdinaryLedger(s).ok,true);
  const a=registerUnifiedEmptyAccount(s,{
    kind:'bulk',ownerId:'bank-b2',
    expectedRevision:s.revision,expectedEpoch:s.epoch
  });
  assert.equal(a.ok,true,a.reason);
  assert.equal(a.next.total,36);
  assert.equal(inspectUnifiedOrdinaryLedger(a.next).ok,true);
  const tampered=structuredClone(a.next);
  tampered.accounts.find(x=>x.id==='receiver:minecraft:overworld|0,70,-40').legacyQ4=undefined;
  hold(inspectUnifiedOrdinaryLedger(tampered),'source_provenance_count_mismatch');
});


test('boundary deposit and withdraw drafts preserve conservation across the physical interface',()=>{
  const s=stage(fixture()).snapshot;
  const key=q5IdentityKey(item());
  const deposit=transitionUnifiedOrdinaryBoundary(s,{
    operationId:'ordinary-physical-in',accountId:'receiver:minecraft:overworld|0,70,-40',
    key,count:64,direction:'deposit',
    expectedRevision:s.revision,expectedEpoch:s.epoch
  });
  assert.equal(deposit.ok,true,deposit.reason);
  assert.equal(deposit.totalAfter,deposit.totalBefore+64);
  assert.equal(deposit.canWriteWorld,false);
  assert.equal(deposit.externalCustodyProofRequired,true);
  assert.equal(inspectUnifiedOrdinaryLedger(deposit.next).ok,true);
  const withdraw=transitionUnifiedOrdinaryBoundary(deposit.next,{
    operationId:'ordinary-physical-out',accountId:'receiver:minecraft:overworld|0,70,-40',
    key,count:36,direction:'withdraw',
    expectedRevision:deposit.next.revision,expectedEpoch:s.epoch
  });
  assert.equal(withdraw.ok,true,withdraw.reason);
  assert.equal(withdraw.next.total,s.total+28);
  assert.equal(inspectUnifiedOrdinaryLedger(withdraw.next).ok,true);
  assert.equal(s.total,36);
});
test('boundary refuses unauthenticated identity, stale epoch and over-capacity',()=>{
  const s=stage(fixture()).snapshot,key=q5IdentityKey(item());
  const base={operationId:'b-1',accountId:'receiver:minecraft:overworld|0,70,-40',
    key,count:1,direction:'deposit',
    expectedRevision:s.revision,expectedEpoch:s.epoch};
  hold(transitionUnifiedOrdinaryBoundary(s,{...base,key:'minecraft:stone'}),
    'invalid_or_stale_boundary_request');
  hold(transitionUnifiedOrdinaryBoundary(s,{...base,expectedEpoch:s.epoch+1}),
    'invalid_or_stale_boundary_request');
  hold(transitionUnifiedOrdinaryBoundary(s,{...base,count:250000}),
    'boundary_account_full');
  hold(transitionUnifiedOrdinaryBoundary(s,{...base,direction:'withdraw',
    count:100}),'boundary_insufficient_balance');
  hold(transitionUnifiedOrdinaryBoundary(s,{...base,direction:'withdraw',
    accountId:'bulk:bank-b1'}),'boundary_insufficient_balance');
});


test('original Q4 lifetime counters remain immutable while UCE Receiver delivery counts grow',()=>{
  const f=fixture();
  const s=stage(f).snapshot;
  const receiver='receiver:minecraft:overworld|0,70,-40';
  const key=q5IdentityKey(item());
  const before=s.accounts.find(a=>a.id===receiver);
  assert.deepEqual(before.lifetime,{received:27,delivered:7});
  const moved=move(s,receiver,'bulk:bank-b1',key,4);
  assert.equal(moved.ok,true,moved.reason);
  const after=moved.next.accounts.find(a=>a.id===receiver);
  assert.equal(after.lifetime.delivered,11);
  assert.equal(after.lifetime.received,27);
  assert.equal(after.legacyQ4.delivered,7);
  assert.equal(after.legacyQ4.received,27);
  const back=move(moved.next,'bulk:bank-b1',receiver,key,3,'return');
  assert.equal(back.ok,true,back.reason);
  const r=back.next.accounts.find(a=>a.id===receiver);
  assert.deepEqual(r.lifetime,{received:30,delivered:11});
  assert.equal(inspectUnifiedOrdinaryLedger(back.next).ok,true);
});
test('ordinary physical-boundary transfer advances Receiver lifetime counters once',()=>{
  const s=stage(fixture()).snapshot;
  const receiver='receiver:minecraft:overworld|0,70,-40';
  const key=q5IdentityKey(item());
  const inwards=transitionUnifiedOrdinaryBoundary(s,{
    operationId:'new-received',accountId:receiver,key,count:5,
    direction:'deposit',expectedRevision:s.revision,expectedEpoch:s.epoch
  });
  assert.equal(inwards.ok,true,inwards.reason);
  const after=inwards.next.accounts.find(a=>a.id===receiver);
  assert.deepEqual(after.lifetime,{received:32,delivered:7});
  const outgoing=transitionUnifiedOrdinaryBoundary(inwards.next,{
    operationId:'new-delivered',accountId:receiver,key,count:6,
    direction:'withdraw',expectedRevision:inwards.next.revision,expectedEpoch:s.epoch
  });
  assert.equal(outgoing.ok,true,outgoing.reason);
  const final=outgoing.next.accounts.find(a=>a.id===receiver);
  assert.deepEqual(final.lifetime,{received:32,delivered:13});
  assert.deepEqual(final.legacyQ4,{
    queueKey:'q1',fingerprint:after.legacyQ4.fingerprint,
    head:1,tail:2,next:3,received:27,delivered:7
  });
});


test('first registered Bulk member retains controller claim; later member cannot elect itself',()=>{
  const f=fixture([], {bulkMemberIds:[]});
  let s=createEmptyUnifiedOrdinaryLedger({worldId:'minecraft:overworld:bank',
    epoch:7}).snapshot;
  const first=registerUnifiedEmptyAccount(s,{
    kind:'bulk',ownerId:'member:first',
    expectedRevision:s.revision,expectedEpoch:7});
  assert.equal(first.ok,true,first.reason);
  assert.equal(first.next.accounts[0].role,'controller');
  assert.equal(first.next.accounts[0].controllerOwnerId,'member:first');
  const second=registerUnifiedEmptyAccount(first.next,{
    kind:'bulk',ownerId:'member:second',
    expectedRevision:first.next.revision,expectedEpoch:7});
  assert.equal(second.ok,true,second.reason);
  const member=second.next.accounts.find(a=>a.ownerId==='member:second');
  assert.equal(member.role,'member');
  assert.equal(member.controllerOwnerId,'member:first');
  assert.equal(inspectUnifiedOrdinaryLedger(second.next).ok,true);
  const forged=structuredClone(second.next);
  forged.accounts.find(a=>a.ownerId==='member:second').role='controller';
  hold(inspectUnifiedOrdinaryLedger(forged),'bulk_controller_conflict');
});
