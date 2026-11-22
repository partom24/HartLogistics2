// Original UUID compatibility entry for the Fresh controlled-dispatch test.
import {world,system,ItemStack,ScriptEventSource} from '@minecraft/server';
import {dispatchTrial} from './committedDispatch.js';
system.beforeEvents.startup.subscribe(({blockComponentRegistry})=>{
    blockComponentRegistry.registerCustomComponent('hartlogistics:redstone_input',{onRedstoneUpdate(){}});
});
const report=s=>console.warn('[Hart Fresh dispatch LAB] '+s);
let busy=false;
system.afterEvents.scriptEventReceive.subscribe(event=>{
    if(event.id!=='hartlab:q4_dispatch' || event.sourceType!==ScriptEventSource.Server)return;
    if(busy){report('Already scanning');return;}
    busy=true;
    report('Starting '+event.message);
    dispatchTrial(world,()=>new Promise(resolve=>system.runTimeout(resolve,1)),type=>new ItemStack(type,1),event.message.trim(),report)
        .catch(error=>report('HOLD '+error)).finally(()=>{busy=false;});
});
