// Startup orchestration for the isolated, original-identity migration pack.
import {handoff} from './handoff.js';

export async function migrateCustody(world,system,report){
    const receiptKeys=['hartlab:dispatch_trial1','hartlab:route_trial1','hartlab:routed_destination1'];
    if(receiptKeys.some(key=>world.getDynamicProperty(key)!==undefined))
        throw Error('Restore a pre-rehearsal world before automatic custody migration');
    const checkpoint=world.getDynamicProperty('hartlab:handoff1_control');
    if(checkpoint===undefined)await handoff(world,system,'prepare',report);
    await handoff(world,system,'commit',report);
}
