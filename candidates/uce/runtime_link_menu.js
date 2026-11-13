/*
 * HL2 Collector/Receiver menu for the existing ONE UCE link writer.
 * Source-only overlay; NO world mutation or secondary link registry.
 * PG08 established the player interaction contract in BDS: explicit
 * Link / Relink selection, Receiver-side confirmation, cancel and stale HOLD.
 * Every confirmed operation still executes uceUseReceiverLinkOrStatus,
 * which owns its cold seal, native waiting-ticket and revision fences.
 */
const UCE_LINK_MENU_TIMEOUT_TICKS=1200;
const uceLinkMenuOpen=new Map();
const uceLinkMenuTickets=new Map();

function uceLinkMenuSnapshot(collectorId){
    try{
        const raw=world.getDynamicProperty(LOGISTICS_KEY);
        // Genuine fresh zero-Q4 worlds may not yet have a link registry.
        // The existing authenticated writer separately proves that origin.
        if(raw===undefined)return {revision:0,link:null,
            collectorPresent:false};
        const parsed=JSON.parse(raw);
        if(!parsed||!Array.isArray(parsed.collectors)||
           !Number.isSafeInteger(parsed.uceLinkRevision??0))
            return undefined;
        const matches=parsed.collectors.filter(c=>c?.id===collectorId);
        if(matches.length>1)return undefined;
        return {revision:parsed.uceLinkRevision??0,
            link:matches[0]?.link??null,
            collectorPresent:matches.length===1};
    }catch(_){return undefined;}
}
function uceLinkMenuNotify(player,message){
    try{player.sendMessage(message);}catch(_){}
}
async function uceLinkMenuShow(player,form){
    try{
        const response=await form.show(player);
        return response&&!response.canceled?response.selection:undefined;
    }catch(_){
        uceLinkMenuNotify(player,
            '§c[Hart Logistics] Form unavailable; no links changed.');
        return undefined;
    }
}
function uceLinkMenuBegin(player){
    if(!player?.id||uceLinkMenuOpen.has(player.id))return undefined;
    const token={};
    uceLinkMenuOpen.set(player.id,token);
    return token;
}
function uceLinkMenuEnd(player,token){
    if(uceLinkMenuOpen.get(player?.id)===token)
        uceLinkMenuOpen.delete(player.id);
}
async function uceCollectorLinkMenu(player,block){
    if(!player||block?.typeId!==COLLECTOR_ID)return;
    const token=uceLinkMenuBegin(player);
    if(!token)return;
    try{
        // Simply opening a Collector menu must never retain a prior armed
        // selection; leaving or canceling cannot unexpectedly relink later.
        ucePendingLinkBlocks.delete(player.id);
        uceLinkMenuTickets.delete(player.id);
        const p=block.location;
        const collectorId=logisticsId(block.dimension.id,p.x,p.y,p.z);
        const before=uceLinkMenuSnapshot(collectorId);
        if(!before){
            uceLinkMenuNotify(player,
                '§c[Collector] Saved link registry unreadable; HOLD.');
            return;
        }
        const choice=await uceLinkMenuShow(player,new ActionFormData()
            .title('Hart Collector')
            .body('Linked Receiver: '+(before.link||'unlinked'))
            .button('Link / Relink Receiver')
            .button('Details')
            .button('Close'));
        if(uceLinkMenuOpen.get(player.id)!==token)return;
        if(choice===1){
            uceShowCollectorLinkedStatus(player,block);
            return;
        }
        if(choice!==0)return;
        const live=collectorAt({
            id:collectorId,d:block.dimension.id,x:p.x,y:p.y,z:p.z
        });
        const current=uceLinkMenuSnapshot(collectorId);
        if(!live||!uceSameLoadedBlock(live,block)||
           !current||current.revision!==before.revision||
           current.link!==before.link||
           current.collectorPresent!==before.collectorPresent){
            uceLinkMenuNotify(player,
                '§c[Collector] Link selection changed; reopen menu.');
            return;
        }
        // Reuse the original authenticated, read-only arming routine.
        uceSelectCollectorForLink(player,block);
        const pending=ucePendingLinkBlocks.get(player.id);
        if(pending?.id!==collectorId)return;
        uceLinkMenuTickets.set(player.id,{collectorId,
            revision:current.revision,link:current.link,
            collectorPresent:current.collectorPresent,
            expires:system.currentTick+UCE_LINK_MENU_TIMEOUT_TICKS});
    }finally{uceLinkMenuEnd(player,token);}
}
async function uceReceiverLinkMenu(player,block){
    if(!player||block?.typeId!==RECEIVER_ID)return;
    const ticket=uceLinkMenuTickets.get(player.id);
    const pending=ucePendingLinkBlocks.get(player.id);
    if(!ticket||!pending){
        // Receiver status is still read-only in the absence of a link arm.
        uceLinkMenuTickets.delete(player.id);
        ucePendingLinkBlocks.delete(player.id);
        uceShowReceiverLinkedStatus(player,block);
        return;
    }
    const token=uceLinkMenuBegin(player);
    if(!token)return;
    try{
        const p=block.location;
        const receiverId=logisticsId(block.dimension.id,p.x,p.y,p.z);
        const snapshot=uceLinkMenuSnapshot(ticket.collectorId);
        if(!snapshot||ticket.expires<system.currentTick||
           pending.id!==ticket.collectorId||
           ticket.revision!==snapshot.revision||
           ticket.link!==snapshot.link||
           ticket.collectorPresent!==snapshot.collectorPresent){
            uceLinkMenuNotify(player,
                '§c[Collector] Selection expired or changed; no link written.');
            return;
        }
        const choice=await uceLinkMenuShow(player,new MessageFormData()
            .title('Confirm Receiver Link')
            .body('Link Collector '+ticket.collectorId+
                ' to Receiver '+receiverId+'?')
            .button1('Cancel')
            .button2('Confirm Link'));
        if(uceLinkMenuOpen.get(player.id)!==token||choice!==1)return;
        const fresh=uceLinkMenuSnapshot(ticket.collectorId);
        if(!fresh||ticket.expires<system.currentTick||
           ucePendingLinkBlocks.get(player.id)!==pending||
           fresh.revision!==ticket.revision||
           fresh.link!==ticket.link||
           fresh.collectorPresent!==ticket.collectorPresent||
           !receiverAt({
               id:receiverId,d:block.dimension.id,x:p.x,y:p.y,z:p.z
           })){
            uceLinkMenuNotify(player,
                '§c[Collector] Confirmation stale; no link written.');
            return;
        }
        // This is the ONLY write point. Its existing native waiting-host
        // quarantine and link registry compare/readback remain authoritative.
        uceUseReceiverLinkOrStatus(player,block);
    }finally{
        // A player may disconnect and reconnect while a form Promise is
        // unresolved. Never delete a NEW session's ticket when this older
        // form finally settles.
        if(uceLinkMenuOpen.get(player.id)===token){
            uceLinkMenuTickets.delete(player.id);
            ucePendingLinkBlocks.delete(player.id);
            uceLinkMenuEnd(player,token);
        }
    }
}
world.afterEvents?.playerLeave?.subscribe(event=>{
    uceLinkMenuOpen.delete(event.playerId);
    uceLinkMenuTickets.delete(event.playerId);
    ucePendingLinkBlocks.delete(event.playerId);
});
