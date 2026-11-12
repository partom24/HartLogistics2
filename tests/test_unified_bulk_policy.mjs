import test from 'node:test';
import assert from 'node:assert/strict';
import {q5IdentityKey} from '../candidates/transport/q5_bucket_core.mjs';
import {createEmptyUnifiedOrdinaryLedger,
  registerUnifiedEmptyAccount,inspectUnifiedOrdinaryLedger,
  transitionUnifiedOrdinaryAccounts} from
  '../candidates/transport/unified_ordinary_accounts.mjs';
import {planUnifiedBulkService,UCE_BULK_RECEIVER_RESERVE,
  UCE_BULK_MOVE_BATCH} from '../candidates/transport/unified_bulk_policy.mjs';
const key=q5IdentityKey({typeId:'minecraft:cobblestone',
  lore:[],ench:[],canDestroy:[],canPlaceOn:[]});
function fixture(r=249700,a=0,b=0){
  let s=createEmptyUnifiedOrdinaryLedger({
    worldId:'minecraft:overworld:bulk-play',epoch:11}).snapshot;
  for(const [kind,ownerId] of [['receiver','r1'],['bulk','bank-a'],
                                 ['bulk','bank-b']]){
    const x=registerUnifiedEmptyAccount(s,{kind,ownerId,
      expectedRevision:s.revision,expectedEpoch:s.epoch});
    assert.equal(x.ok,true,x.reason);s=x.next;
  }
  for(const [id,value] of [['receiver:r1',r],['bulk:bank-a',a],
                           ['bulk:bank-b',b]]){
    const account=s.accounts.find(a=>a.id===id);
    account.total=value;
    account.buckets=value?[{key,count:value}]:[];
  }
  s.total=r+a+b;
  assert.equal(inspectUnifiedOrdinaryLedger(s).ok,true);
  return s;
}
const options=s=>({snapshot:s,receiverOwnerId:'r1',
  connectedBankOwnerIds:['bank-a','bank-b']});
test('near-full Receiver spills one bounded internal revision into first connected Bulk',()=>{
  const s=fixture(),p=planUnifiedBulkService(options(s));
  assert.equal(p.ok,true,p.reason);
  assert.equal(p.status,'TRANSFER_DRAFT_ONLY');
  assert.equal(p.direction,'receiver_to_bulk');
  assert.equal(p.to,'bulk:bank-a');
  assert.equal(p.count,UCE_BULK_MOVE_BATCH);
  assert.equal(UCE_BULK_RECEIVER_RESERVE,512);
  const step=transitionUnifiedOrdinaryAccounts(s,{operationId:'overflow-1',
    from:p.from,to:p.to,key:p.key,count:p.count,
    expectedRevision:p.expectedRevision,expectedEpoch:p.expectedEpoch});
  assert.equal(step.ok,true,step.reason);
  assert.equal(step.next.total,s.total);
  assert.equal(step.next.accounts.find(a=>a.id==='bulk:bank-a').total,64);
});
test('full bank advances to next member, then all-full banks hold physical pressure',()=>{
  const s=fixture(249700,200000,0),p=planUnifiedBulkService(options(s));
  assert.equal(p.to,'bulk:bank-b');
  const all=fixture(249700,200000,200000);
  const r=planUnifiedBulkService(options(all));
  assert.equal(r.status,'IDLE');
  assert.equal(r.reason,'all_connected_banks_full');
});
test('Bulk refill only when Receiver empty, output matched and no Collector waiting',()=>{
  const s=fixture(0,400,0);
  assert.equal(planUnifiedBulkService({
    ...options(s),outputEligibleKeys:[]}).status,'IDLE');
  assert.equal(planUnifiedBulkService({
    ...options(s),sourceWaiting:true,outputEligibleKeys:[key]}).status,'IDLE');
  const r=planUnifiedBulkService({...options(s),outputEligibleKeys:[key]});
  assert.equal(r.direction,'bulk_to_receiver');
  assert.equal(r.count,64);
  const step=transitionUnifiedOrdinaryAccounts(s,{operationId:'refill-1',
    from:r.from,to:r.to,key:r.key,count:r.count,
    expectedRevision:r.expectedRevision,expectedEpoch:r.expectedEpoch});
  assert.equal(step.ok,true,step.reason);
  assert.equal(step.next.total,400);
  assert.equal(step.next.accounts.find(a=>a.id==='receiver:r1').total,64);
});
test('missing controller on loaded route fails closed rather than electing a member',()=>{
  const s=fixture(0,2,5);
  const r=planUnifiedBulkService({snapshot:s,receiverOwnerId:'r1',
    connectedBankOwnerIds:['bank-b'],outputEligibleKeys:[key]});
  assert.equal(r.status,'HOLD');
  assert.equal(r.reason,'bulk_controller_not_on_same_verified_network');
});
test('unregistered loaded bank or duplicate node refuses logical transfer',()=>{
  const s=fixture();
  const missing=planUnifiedBulkService({snapshot:s,receiverOwnerId:'r1',
    connectedBankOwnerIds:['bank-a','bank-unknown']});
  assert.equal(missing.status,'HOLD');
  assert.equal(missing.reason,'connected_bulk_account_unregistered');
  const duplicate=planUnifiedBulkService({snapshot:s,receiverOwnerId:'r1',
    connectedBankOwnerIds:['bank-a','bank-a']});
  assert.equal(duplicate.reason,'invalid_bulk_route_membership');
});
test('a usable filtered destination outranks Bulk storage even below high-water',()=>{
  const s=fixture(200,300,0);
  const r=planUnifiedBulkService({
    ...options(s),preferredOutputKeys:[key]});
  assert.equal(r.status,'IDLE');
  assert.equal(r.reason,'bulk_retains_custody_or_no_output');
});
test('unmatched ordinary items enter Bulk before any Wildcard route at low Receiver balance',()=>{
  const s=fixture(200,300,0);
  const r=planUnifiedBulkService(options(s));
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'TRANSFER_DRAFT_ONLY');
  assert.equal(r.direction,'receiver_to_bulk');
  assert.equal(r.from,'receiver:r1');
  assert.equal(r.to,'bulk:bank-a');
  assert.equal(r.count,64);
  const moved=transitionUnifiedOrdinaryAccounts(s,{
    operationId:'bulk-before-wildcard',from:r.from,to:r.to,
    key:r.key,count:r.count,expectedRevision:r.expectedRevision,
    expectedEpoch:r.expectedEpoch});
  assert.equal(moved.ok,true,moved.reason);
  assert.equal(moved.next.total,s.total);
});
test('continuous Collector ingress does not starve at low water; near-full spills safely',()=>{
  const low=fixture(200,300,0);
  const wait=planUnifiedBulkService({...options(low),sourceWaiting:true});
  assert.equal(wait.status,'IDLE');
  const high=fixture(249700,300,0);
  const spill=planUnifiedBulkService({...options(high),sourceWaiting:true});
  assert.equal(spill.status,'TRANSFER_DRAFT_ONLY');
  assert.equal(spill.count,64);
});
test('Bulk bank cannot refill an empty Receiver without an actual preferred route',()=>{
  const s=fixture(0,250,0);
  const without=planUnifiedBulkService({
    ...options(s),outputEligibleKeys:[]});
  assert.equal(without.status,'IDLE');
  const withFilter=planUnifiedBulkService({
    ...options(s),outputEligibleKeys:[key]});
  assert.equal(withFilter.status,'TRANSFER_DRAFT_ONLY');
  assert.equal(withFilter.direction,'bulk_to_receiver');
});
