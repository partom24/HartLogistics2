// Offline integration entry only. Called with a frozen original-identity world
// and a synchronous offer into the normal Fresh routing path.
import {dispatchTrial} from './route-audit.js';

const firstKey='hartlab:dispatch_trial1';
const routeKey='hartlab:route_trial1';
const controlKey='hartlab:handoff1_control';

export async function routeOne(world,pause,makeItem,queue,offer) {
    const first=world.getDynamicProperty(firstKey);
    const control=world.getDynamicProperty(controlKey);
    const receipt=first && JSON.parse(first);
    if(receipt?.phase!=='delivered' || receipt.queue!==queue)
        throw Error('Prior barrel delivery must be verified for this queue');
    const audit=await dispatchTrial(world,pause,makeItem,'status',()=>{});
    if(world.getDynamicProperty(firstKey)!==first || world.getDynamicProperty(controlKey)!==control)
        throw Error('Committed checkpoint changed');
    const {choice,remaining}=audit;
    if(!choice || choice.queue!==queue || remaining<1)throw Error('No second unit available');
    const issued=JSON.stringify({v:1,...choice,phase:'issued'});
    const prior=world.getDynamicProperty(routeKey);
    if(prior!==undefined && prior!==issued)throw Error('Unresolved route receipt; inspect original lane');
    if(prior===undefined){
        const item=makeItem(choice.type);
        let available=true;
        const source={
            getItem:()=>available ? item.clone() : undefined,
            transferItem(slot,destination){
                if(slot!==0 || !available || world.getDynamicProperty(routeKey)!==undefined)
                    throw Error('Source already reserved');
                const pending=JSON.stringify({v:1,...choice,phase:'pending'});
                world.setDynamicProperty(routeKey,pending);
                if(world.getDynamicProperty(routeKey)!==pending)throw Error('Reservation readback failed');
                available=false;
                if(destination.addItem(item))throw Error('Uncertain lane admission');
                world.setDynamicProperty(routeKey,issued);
                if(world.getDynamicProperty(routeKey)!==issued)throw Error('Debit readback failed');
            }
        };
        offer(choice.target,item,source);
    }
    const record=world.getDynamicProperty(routeKey);
    if(record!==undefined && record!==issued)throw Error('Unresolved route receipt; inspect original lane');
    const routed=Number(record===issued);
    return {receiver:audit.receiver-routed,held:audit.held,barrel:audit.delivered,routed,total:audit.total};
}
