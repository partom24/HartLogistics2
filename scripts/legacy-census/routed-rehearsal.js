import {routeOne} from './route-trial.js';

const witnessKey='hartlab:routed_destination1';
export async function rehearse(world,queue,command,pause,makeItem,checkSettings,prepare,count){
    if(!['send','verify'].includes(command))throw Error('Expected send or verify');
    const stored=world.getDynamicProperty(witnessKey);
    const witness=stored===undefined?undefined:JSON.parse(stored);
    if(witness && (witness.queue!==queue || witness.phase!=='confirmed'))throw Error('Unconfirmed destination; inspect lane before recovery');
    if(!witness && command==='verify')throw Error('No confirmed routed delivery');
    await checkSettings(queue);
    let shipment,record;
    const audit=await routeOne(world,pause,makeItem,queue,(address,item,source)=>{
        if(witness || command!=='send')throw Error('Inconsistent receipts; inspection required');
        shipment=prepare(address,item);
        record={queue,type:item.typeId,target:address,dimension:shipment.dimension,position:shipment.position,
            block:shipment.block,before:shipment.before,phase:'pending'};
        const raw=JSON.stringify(record);
        world.setDynamicProperty(witnessKey,raw);
        if(world.getDynamicProperty(witnessKey)!==raw)throw Error('Destination intent readback failed');
        shipment.send(source);
    });
    if(audit.routed!==1)throw Error('Routed debit unverified');
    if(shipment){
        await shipment.finish(pause);
        record.phase='confirmed';
        const raw=JSON.stringify(record);
        world.setDynamicProperty(witnessKey,raw);
        if(world.getDynamicProperty(witnessKey)!==raw)throw Error('Destination confirmation readback failed');
    }
    const proof=record??witness;
    if(!proof)throw Error('Issued receipt without destination evidence');
    const issued=JSON.parse(world.getDynamicProperty('hartlab:route_trial1'));
    if(issued.target!==proof.target || issued.type!==proof.type || issued.queue!==queue ||
        count(proof.dimension,proof.position,proof.block,makeItem(proof.type))!==proof.before+1)
        throw Error('Recorded destination evidence differs');
    return {audit,proof};
}
