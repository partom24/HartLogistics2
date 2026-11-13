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
function uceInterbankBulkRouteVerified(authority,receiver,tx,direction){
    try{
        if(!authority||!receiver||!tx||
           !['withdraw','deposit'].includes(direction)||
           tx.worldId!==authority.worldId||
           tx.epoch!==authority.epoch||
           tx.fromAccount!=='receiver:'+receiver.id||
           !tx.toAccount?.startsWith('bulk:')||
           tx.fromShard!==uceOrdinaryAccountSource(
               authority,receiver.id)||
           tx.fromShard===tx.toShard||
           !tx.routeWitness?.startsWith('IBB1|'))
            return false;
        const def=JSON.parse(tx.key);
        if(inspectQ4OrdinaryDefinitionShape(def).ok!==true)
            return false;
        const item=new ItemStack(def.typeId,1);
        if(uceClassifyLiveStack(item)!=='ORDINARY')return false;
        const paths=uceLinkedBankBulkRoutes(
            receiver,item,authority,ucePipeRouteNetwork(receiver));
        if(!paths?.length)return false;
        const chosen=paths.find(route=>
            route.witness===tx.routeWitness&&
            tx.toAccount==='bulk:'+route.bankOwnerId&&
            tx.toShard===uceOrdinaryAccountSource(
                authority,route.leaderId));
        if(!chosen)return false;
        const group=[...new Set(chosen.graph.banks.map(
            b=>uceBulkOwnerId(b)))].sort();
        const reader=createUnifiedShardWriter({
            world,shardKey:tx.toShard,
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
            a.id===tx.toAccount&&a.kind==='bulk'&&
            a.ownerId===chosen.bankOwnerId);
        return !!account&&group.includes(account.controllerOwnerId)&&
            account.capacity-account.total>=tx.count;
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
        if(receiverOutputHopper(receiver)||
           blockIsRedstonePowered(receiverAt(receiver)))
            return {ok:true,status:'REMOTE_BULK_LEGACY_OUTPUT_PRIORITY'};
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
