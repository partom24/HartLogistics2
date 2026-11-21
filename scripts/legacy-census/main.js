// Optional offline-copy inspection under the original behavior pack identity.
import {world,system} from '@minecraft/server';
import {q4Census} from './q4Lab.js';

const reader={
    getDynamicPropertyIds:()=>world.getDynamicPropertyIds(),
    getDynamicProperty:key=>world.getDynamicProperty(key)
};
system.beforeEvents.startup.subscribe(event=>{
    event.blockComponentRegistry.registerCustomComponent('hartlogistics:redstone_input',{onRedstoneUpdate(){}});
});
system.afterEvents.scriptEventReceive.subscribe(event=>{
    if(event.id!=='hartlab:q4_census')return;
    let message;
    try{message=q4Census(reader,event.message.trim());}
    catch(error){message='HOLD '+String(error);}
    console.warn('[Hart legacy census] '+message);
    event.sourceEntity?.sendMessage(message);
});
