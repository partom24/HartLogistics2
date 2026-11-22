import './config-transfer-main.js';
import {world,system,ItemStack,ScriptEventSource} from '@minecraft/server';
import {rehearse} from './routed-rehearsal.js';
import {transferConfiguration} from './config-transfer.js';
import {prepareMigrationShipment,countMigrationItems} from './fresh-routing.js';
let busy=false;
const pause=()=>new Promise(resolve=>system.runTimeout(resolve,1));
system.afterEvents.scriptEventReceive.subscribe(event=>{
    if(event.id!=='hartlab:q4_route' || event.sourceType!==ScriptEventSource.Server)return;
    const args=/^(send|verify) (q\d+)$/.exec(event.message.trim());
    const report=s=>console.warn('[Hart Fresh migration LAB] '+s);
    if(!args || busy){report(busy?'Route trial already running':'Use q4_route send <queue> or verify <queue>');return;}
    busy=true;
    rehearse(world,args[2],args[1],pause,id=>new ItemStack(id,1),
        q=>transferConfiguration(world,q,false,pause),prepareMigrationShipment,countMigrationItems)
        .then(({audit,proof})=>report('ROUTE VERIFIED queue='+proof.queue+' item='+proof.type+' chest='+JSON.stringify(proof.position)+
            ' before='+proof.before+' after='+(proof.before+1)+' receiver='+audit.receiver+' held='+audit.held+
            ' barrel='+audit.barrel+' routed='+audit.routed+' total='+audit.total))
        .catch(e=>report('ROUTE HOLD '+e)).finally(()=>{busy=false;});
});
