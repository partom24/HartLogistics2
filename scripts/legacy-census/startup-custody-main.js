import {world,system} from '@minecraft/server';
import {migrateCustody} from './startup-custody.js';

const report=message=>console.warn('[Hart Fresh migration LAB] '+message);
system.beforeEvents.startup.subscribe(({blockComponentRegistry})=>{
    blockComponentRegistry.registerCustomComponent('hartlogistics:redstone_input',{onRedstoneUpdate(){}});
});
world.afterEvents.worldLoad.subscribe(()=>{
    system.run(()=>{
        migrateCustody(world,system,report)
            .then(()=>report('CUSTODY COMMITTED; routing remains paused'))
            .catch(error=>report('CUSTODY HOLD '+error));
    });
});
