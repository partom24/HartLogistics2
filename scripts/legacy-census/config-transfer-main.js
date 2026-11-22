import './config-main.js';
import {world,system,ScriptEventSource} from '@minecraft/server';
import {transferConfiguration} from './config-transfer.js';
let running=false;
system.afterEvents.scriptEventReceive.subscribe(event=>{
    if(event.id!=='hartlab:q4_settings' || event.sourceType!==ScriptEventSource.Server)return;
    const args=/^(apply|verify) (q\d+)$/.exec(event.message.trim());
    const report=s=>console.warn('[Hart Fresh migration LAB] '+s);
    if(!args){report('Use q4_settings apply <queue> or verify <queue>');return;}
    if(running){report('Settings operation in progress');return;}
    running=true;
    transferConfiguration(world,args[2],args[1]==='apply',()=>new Promise(resolve=>system.runTimeout(resolve,1)))
        .then(r=>report('CONFIG VERIFIED target='+r.target+' settings='+r.settings+' settingsWritten='+r.written))
        .catch(error=>report('CONFIG HOLD '+error)).finally(()=>{running=false;});
});
