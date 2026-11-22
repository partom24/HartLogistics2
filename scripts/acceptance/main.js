import {world,system} from '@minecraft/server';
import {upgrade} from './upgrade.js';
import {startFreshRouting} from './fresh-runtime.js';

const report=s=>console.warn('[Hart migration acceptance] '+s);
let ready=false;
function notify(player){
    if(player.getDynamicProperty('hartlab:upgrade_notice_v1'))return;
    player.sendMessage(ready?'Hart Logistics migration completed. Routing is active.':'Hart Logistics is upgrading storage. Routing is paused during migration.');
    player.setDynamicProperty('hartlab:upgrade_notice_v1',true);
}
world.afterEvents.playerSpawn.subscribe(ev=>{if(ev.initialSpawn)notify(ev.player);});
world.afterEvents.worldLoad.subscribe(()=>system.run(async()=>{
    try{
        const {totals,settings}=await upgrade(world,system,report);
        startFreshRouting();
        ready=true;
        for(const player of world.getAllPlayers())notify(player);
        report('Q4 STORAGE COMMITTED '+JSON.stringify(totals));
        report('MIGRATION READY '+JSON.stringify({...totals,settings,routing:'active'}));
    }catch(e){report('MIGRATION HOLD '+e);}
}));
