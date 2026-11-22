// Copied LAB only. Preserve the established dispatch commands.
import './dispatch-main.js';
import {world,system,ScriptEventSource} from '@minecraft/server';
import {previewConfiguration} from './config-preview.js';
system.afterEvents.scriptEventReceive.subscribe(event=>{
    if(event.id!=='hartlab:q4_config' || event.sourceType!==ScriptEventSource.Server)return;
    try{
        const p=previewConfiguration(world,event.message.trim());
        console.warn('[Hart Fresh migration LAB] CONFIG PREVIEW target='+p.target+
            ' hoppers='+p.hoppers+' sorters='+p.sorters+' registeredIncomingLinks='+p.links+
            ' modes='+JSON.stringify(p.modesFound)+' writes=0');
    }catch(error){console.warn('[Hart Fresh migration LAB] CONFIG HOLD '+error);}
});
