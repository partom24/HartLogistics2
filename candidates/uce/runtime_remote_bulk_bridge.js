/*
 * UCE existing-ledger cross-BANK Bulk routing adapter.
 *
 * The only source of item custody is the already sealed ordinary Receiver
 * account; the only destination is the remote region's ALREADY REGISTERED
 * 200k Bulk account. This adapter never writes world properties, saves a
 * queue, elects controllers, moves native items, or introduces a scheduler.
 * executeUnifiedFederatedTransfer stays the one globally journaled writer.
 *
 * A source must first prove NO accepting preferred Sorter through the whole
 * loaded linked bank network. The remote Bulk controller, shard, capacity and
 * exact Collector route are reverified at both saved shard boundaries.
 */
/**
 * A remote bank refills a Receiver ONLY for a currently accepting native
 * Hopper or a verified Filter/seeded Auto Sorter output. Bulk counts never
 * bypass these original priorities into an unseeded Auto or Wildcard.
 * Unknown native Hopper shape stays unspendable.
 */
function uceRemoteBulkPreferredOutput(receiver,item){
    try{
        const root=receiverAt(receiver);
        if(!root||blockIsRedstonePowered(root))return false;
        const hopper=receiverOutputHopper(receiver);
        if(hopper)
            return !!hopper.container?.isValid&&!hopper.locked&&
                !!uceOrdinaryHopperCandidate(hopper.container,item);
        const below=root.dimension.getBlock({
            x:root.location.x,y:root.location.y-1,
            z:root.location.z});
        if(!below||below.typeId==='minecraft:hopper')return false;
        return !!uceChoosePipeDestination(
            receiver,item,true,undefined,true);
    }catch(_){return false;}
}
function uceInterbankBulkRouteVerified(authority,receiver,tx,direction){
    try{
        if(!authority||!receiver||!tx||
           !['withdraw','deposit'].includes(direction)||
           tx.worldId!==authority.worldId||
           tx.epoch!==authority.epoch||
           tx.fromShard===tx.toShard||
           !tx.routeWitness?.startsWith('IBB1|'))
            return false;
        const receiverAccount='receiver:'+receiver.id;
        const receiverShard=uceOrdinaryAccountSource(
            authority,receiver.id);
        const spill=tx.fromAccount===receiverAccount&&
            tx.toAccount?.startsWith('bulk:')&&
            tx.fromShard===receiverShard;
        const refill=tx.toAccount===receiverAccount&&
            tx.fromAccount?.startsWith('bulk:')&&
            tx.toShard===receiverShard;
        if(!receiverShard||(!spill&&!refill))return false;
        const def=JSON.parse(tx.key);
        if(inspectQ4OrdinaryDefinitionShape(def).ok!==true)
            return false;
        const item=new ItemStack(def.typeId,1);
        if(uceClassifyLiveStack(item)!=='ORDINARY')return false;
        if(refill&&!uceRemoteBulkPreferredOutput(receiver,item))
            return false;
        const routes=uceLinkedBankBulkRoutes(
            receiver,item,authority,ucePipeRouteNetwork(receiver),
            spill);
        if(!routes?.length)return false;
        const bulkAccount=spill?tx.toAccount:tx.fromAccount;
        const bulkShard=spill?tx.toShard:tx.fromShard;
        const chosen=routes.find(route=>
            route.witness===tx.routeWitness&&
            bulkAccount==='bulk:'+route.bankOwnerId&&
            bulkShard===uceOrdinaryAccountSource(
                authority,route.leaderId));
        if(!chosen||bulkShard===receiverShard)return false;
        const group=[...new Set(chosen.graph.banks.map(
            b=>uceBulkOwnerId(b)))].sort();
        const reader=createUnifiedShardWriter({
            world,shardKey:bulkShard,
            worldId:authority.worldId,epoch:authority.epoch,
            externalFence:()=>false
        });
        if(!reader.ok)return false;
        const inspected=reader.inspect();
        if(!inspected.ok)return false;
        const governed=planUnifiedBulkService({
            snapshot:inspected.snapshot,
            receiverOwnerId:chosen.leaderId,
            connectedBankOwnerIds:group,sourceWaiting:true,
            preferredOutputKeys:[],outputEligibleKeys:[]
        });
        if(!governed.ok)return false;
        const account=inspected.snapshot.accounts.find(a=>
            a.id===bulkAccount&&a.kind==='bulk'&&
            a.ownerId===chosen.bankOwnerId);
        if(!account||!group.includes(account.controllerOwnerId))
            return false;
        if(spill)return account.capacity-account.total>=tx.count;
        return (account.buckets.find(b=>b.key===tx.key)?.count||0)>=
            tx.count;
    }catch(_){return false;}
}
function ucePlanInterbankBulkTransfer(authority,receiver,shardKey,entry){
    const hold=reason=>({ok:false,status:'HOLD',reason});
    try{
        if(!entry||typeof entry.key!=='string'||
           !Number.isSafeInteger(entry.count)||entry.count<1)
            return hold('interbank_bulk_item_missing');
        const def=JSON.parse(entry.key);
        if(inspectQ4OrdinaryDefinitionShape(def).ok!==true)
            return hold('interbank_bulk_identity_uncertified');
        const item=new ItemStack(def.typeId,1);
        if(uceClassifyLiveStack(item)!=='ORDINARY')
            return hold('interbank_bulk_not_ordinary');
        const options=uceLinkedBankBulkRoutes(
            receiver,item,authority,ucePipeRouteNetwork(receiver));
        if(options===undefined)
            return hold('interbank_bulk_route_unknown');
        for(const target of options){
            const toShard=uceOrdinaryAccountSource(
                authority,target.leaderId);
            // Same-shard remote graph has not established an internal
            // writer route. Never fabricate a cross-shard debit for it.
            if(!toShard||toShard===shardKey)
                return hold('interbank_bulk_shard_owner_ambiguous');
            const reader=createUnifiedShardWriter({
                world,shardKey:toShard,worldId:authority.worldId,
                epoch:authority.epoch,externalFence:()=>false
            });
            if(!reader.ok)return hold('interbank_bulk_shard_unreadable');
            const inspected=reader.inspect();
            if(!inspected.ok)return hold('interbank_bulk_ledger_unreadable');
            const group=[...new Set(target.graph.banks.map(
                b=>uceBulkOwnerId(b)))].sort();
            const governed=planUnifiedBulkService({
                snapshot:inspected.snapshot,
                receiverOwnerId:target.leaderId,
                connectedBankOwnerIds:group,sourceWaiting:true,
                preferredOutputKeys:[],outputEligibleKeys:[]
            });
            if(!governed.ok)
                return hold('interbank_bulk_controller_unverified');
            const account=inspected.snapshot.accounts.find(a=>
                a.id==='bulk:'+target.bankOwnerId&&a.kind==='bulk');
            if(!account||!group.includes(account.controllerOwnerId))
                return hold('interbank_bulk_account_unverified');
            const free=account.capacity-account.total;
            if(free<=0)continue;
            const count=Math.min(64,entry.count,free);
            if(!Number.isSafeInteger(count)||count<1)
                return hold('interbank_bulk_count_invalid');
            return {ok:true,status:'REMOTE_BULK_TRANSFER_DRAFT',
                from:'receiver:'+receiver.id,
                to:account.id,key:entry.key,count,toShard,
                witness:target.witness};
        }
        return {ok:true,status:'NO_VERIFIED_REMOTE_BULK_CAPACITY'};
    }catch(_){return hold('interbank_bulk_planner_ambiguous');}
}

/*
 * Called ONLY by uceOrdinaryServiceTick, after the local/physical-shared
 * Bulk planner has had first claim. One successful remote transaction uses
 * the SAME source shard, global federated intent, destination shard and
 * exact readback/receipt protocol as every other ordinary ledger transfer.
 */
function uceTryRemoteBulkTransfer(authority,receiver,shardKey,
                                  shardWriter,account,sourceWaiting=false){
    const hold=reason=>({ok:false,status:'HOLD',reason});
    try{
        if(!authority||!receiver||!shardKey||!shardWriter||
           !account||!Array.isArray(account.buckets))
            return hold('remote_bulk_binding_invalid');
        if(account.total<=0||!account.buckets.length)
            return {ok:true,status:'REMOTE_BULK_IDLE_EMPTY'};
        if(sourceWaiting&&account.total<account.capacity-512)
            return {ok:true,status:'REMOTE_BULK_SOURCE_PRIORITY'};
        if(blockIsRedstonePowered(receiverAt(receiver)))
            return {ok:true,status:'REMOTE_BULK_LEGACY_OUTPUT_PRIORITY'};
        const hopper=receiverOutputHopper(receiver);
        if(hopper&&!hopper.container?.isValid)
            return hold('remote_bulk_output_hopper_unverified');
        for(const entry of account.buckets){
            let item;
            try{
                const def=JSON.parse(entry.key);
                if(inspectQ4OrdinaryDefinitionShape(def).ok!==true)
                    continue;
                item=new ItemStack(def.typeId,1);
                if(uceClassifyLiveStack(item)!=='ORDINARY')
                    continue;
            }catch(_){continue;}
            // An ACCEPTING original Hopper retains native egress priority.
            // A verified full/locked Hopper is backpressure, not a reason
            // to strand ordinary balance when remote Bulk is available.
            if(hopper&&!hopper.locked&&
               uceOrdinaryHopperCandidate(hopper.container,item))
                continue;
            // An actually selected local preferred destination must retain
            // first claim, including when this Receiver has no Bulk member.
            if(uceChoosePipeDestination(receiver,item,true,
                                        undefined,true))
                continue;
            const planned=ucePlanInterbankBulkTransfer(
                authority,receiver,shardKey,entry);
            if(!planned.ok)
                return hold('remote_bulk_plan:'+planned.reason);
            if(planned.status!=='REMOTE_BULK_TRANSFER_DRAFT')
                continue;
            const operationId=uceNativeReceiptId();
            if(!operationId)return hold('remote_bulk_receipt_exhausted');
            const externalFence=()=>uceLegacyWriterBlocked()&&
                !!uceAuthoritySnapshot();
            const proof=(tx,direction)=>
                uceInterbankBulkRouteVerified(
                    authority,receiver,tx,direction);
            const targetWriter=createUnifiedShardWriter({
                world,shardKey:planned.toShard,
                worldId:authority.worldId,epoch:authority.epoch,
                externalFence,verifyFederatedRoute:proof
            });
            if(!targetWriter.ok)
                return hold('remote_bulk_destination_writer:'+
                    targetWriter.reason);
            const result=ucePerfTimedOperation('federated',()=>
                executeUnifiedFederatedTransfer({
                    world,worldId:authority.worldId,epoch:authority.epoch,
                    operationId,routeWitness:planned.witness,
                    sourceWriter:shardWriter,
                    destinationWriter:targetWriter,
                    fromShard:shardKey,toShard:planned.toShard,
                    fromAccount:planned.from,toAccount:planned.to,
                    key:planned.key,count:planned.count,
                    externalFence,verifyRoute:tx=>proof(tx,'withdraw')
                }));
            if(!result.ok)
                return hold('remote_bulk_federated:'+result.reason);
            return {ok:true,status:'REMOTE_BULK_TRANSFER_COMMITTED',
                count:planned.count,toAccount:planned.to,
                operationId,canReplay:false};
        }
        return {ok:true,status:'REMOTE_BULK_NO_SPENDABLE_ROUTE'};
    }catch(_){return hold('remote_bulk_transfer_unexpected');}
}

/*
 * Reverse side of the SAME federated Receiver<->Bulk custody contract.
 * Read-only physical link census finds reachable bank owners first, then
 * validates each candidate ordinary item against its actual Filter/Auto/
 * Hopper output. Neither the census nor the planner creates storage or
 * reconstructs a metadata-rich ItemStack. A real transfer is staged once
 * in the original global PREPARED journal, then both shards receive an
 * exact readback receipt. Interrupted state remains global HOLD.
 */
function uceTryRemoteBulkRefill(authority,receiver,shardKey,
                                shardWriter,account,sourceWaiting=false){
    const hold=reason=>({ok:false,status:'HOLD',reason});
    try{
        if(!authority||!receiver||!shardKey||!shardWriter||
           !account||!Array.isArray(account.buckets))
            return hold('remote_bulk_refill_binding_invalid');
        if(sourceWaiting||account.total!==0)
            return {ok:true,status:'REMOTE_BULK_REFILL_RECEIVER_BUSY'};
        if(blockIsRedstonePowered(receiverAt(receiver)))
            return {ok:true,status:'REMOTE_BULK_REFILL_RECEIVER_POWERED'};
        const currentGraph=ucePipeRouteNetwork(receiver);
        if(!currentGraph)return hold('remote_bulk_refill_graph_unverified');
        // No candidate item identity is needed to census all physical
        // linked-bank Bulk members; the chosen item and exact link path
        // are PROVED again below and at both shard write boundaries.
        const candidates=uceLinkedBankBulkRoutes(
            receiver,undefined,authority,currentGraph,false);
        if(!candidates)return hold('remote_bulk_refill_path_unknown');
        const inspectedShards=new Map();
        for(const bankRoute of candidates){
            const remoteShard=uceOrdinaryAccountSource(
                authority,bankRoute.leaderId);
            if(!remoteShard)return hold('remote_bulk_refill_owner_unknown');
            if(remoteShard===shardKey)continue;
            let inspection=inspectedShards.get(remoteShard);
            if(!inspection){
                const reader=createUnifiedShardWriter({
                    world,shardKey:remoteShard,
                    worldId:authority.worldId,epoch:authority.epoch,
                    externalFence:()=>false
                });
                if(!reader.ok)return hold(
                    'remote_bulk_refill_shard:'+reader.reason);
                const view=reader.inspect();
                if(!view.ok)return hold(
                    'remote_bulk_refill_readback:'+view.reason);
                inspection={view,reader};
                inspectedShards.set(remoteShard,inspection);
            }
            const bank=inspection.view.snapshot.accounts.find(a=>
                a.id==='bulk:'+bankRoute.bankOwnerId&&a.kind==='bulk');
            if(!bank)return hold('remote_bulk_refill_bank_missing');
            const group=[...new Set(bankRoute.graph.banks.map(
                b=>uceBulkOwnerId(b)))].sort();
            const governance=planUnifiedBulkService({
                snapshot:inspection.view.snapshot,
                receiverOwnerId:bankRoute.leaderId,
                connectedBankOwnerIds:group,sourceWaiting:true,
                preferredOutputKeys:[],outputEligibleKeys:[]
            });
            if(!governance.ok||
               !group.includes(bank.controllerOwnerId))
                return hold('remote_bulk_refill_controller_unverified');
            for(const bucket of bank.buckets){
                let item;
                try{
                    const def=JSON.parse(bucket.key);
                    if(inspectQ4OrdinaryDefinitionShape(def).ok!==true)
                        return hold('remote_bulk_refill_identity_uncertain');
                    item=new ItemStack(def.typeId,1);
                    if(uceClassifyLiveStack(item)!=='ORDINARY')
                        return hold('remote_bulk_refill_not_ordinary');
                }catch(_){return hold('remote_bulk_refill_key_unreadable');}
                if(!uceRemoteBulkPreferredOutput(receiver,item))
                    continue;
                const fresh=uceLinkedBankBulkRoutes(
                    receiver,item,authority,
                    ucePipeRouteNetwork(receiver),false);
                if(!fresh)return hold(
                    'remote_bulk_refill_item_route_unverified');
                const selected=fresh.find(p=>
                    p.leaderId===bankRoute.leaderId&&
                    p.bankOwnerId===bankRoute.bankOwnerId);
                if(!selected)continue;
                const count=Math.min(64,bucket.count,
                    account.capacity-account.total);
                if(!Number.isSafeInteger(count)||count<1)
                    return hold('remote_bulk_refill_capacity_unverified');
                const op=uceNativeReceiptId();
                if(!op)return hold('remote_bulk_refill_receipt_exhausted');
                const externalFence=()=>uceLegacyWriterBlocked()&&
                    !!uceAuthoritySnapshot();
                const proof=(tx,direction)=>
                    uceInterbankBulkRouteVerified(
                        authority,receiver,tx,direction);
                const remoteWriter=createUnifiedShardWriter({
                    world,shardKey:remoteShard,
                    worldId:authority.worldId,epoch:authority.epoch,
                    externalFence,verifyFederatedRoute:proof
                });
                if(!remoteWriter.ok)return hold(
                    'remote_bulk_refill_writer:'+remoteWriter.reason);
                const result=ucePerfTimedOperation('federated',()=>
                    executeUnifiedFederatedTransfer({
                        world,worldId:authority.worldId,
                        epoch:authority.epoch,
                        operationId:op,routeWitness:selected.witness,
                        sourceWriter:remoteWriter,
                        destinationWriter:shardWriter,
                        fromShard:remoteShard,toShard:shardKey,
                        fromAccount:bank.id,
                        toAccount:'receiver:'+receiver.id,
                        key:bucket.key,count,
                        externalFence,
                        verifyRoute:tx=>proof(tx,'withdraw')
                    }));
                if(!result.ok)return hold(
                    'remote_bulk_refill_federated:'+result.reason);
                return {ok:true,status:'REMOTE_BULK_REFILL_COMMITTED',
                    count,fromAccount:bank.id,operationId:op,
                    canReplay:false};
            }
        }
        return {ok:true,status:'REMOTE_BULK_REFILL_NO_PREFERRED_OUTPUT'};
    }catch(_){return hold('remote_bulk_refill_unexpected');}
}
