import {world,system,ItemStack} from '@minecraft/server';
import {upgrade,releaseOne} from './upgrade.js';
import {startFreshRouting,offerMigratedAccount} from './fresh-runtime.js';
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
        const {accounts,totals,settings}=await upgrade(world,system,report);
        startFreshRouting();
        ready=true;
        for(const player of world.getAllPlayers())notify(player);
        let cursor=0;
        system.runInterval(()=>{
            if(!accounts.length)return;
            cursor%=accounts.length;
            const a=accounts[cursor];
            try{
                const moved=releaseOne(world,a,id=>new ItemStack(id,1),offerMigratedAccount);
                if(moved && a.spent===a.quantity){accounts.splice(cursor,1);return;}
            }catch(e){report('ACCOUNT HOLD '+a.progress+' '+e);accounts.splice(cursor,1);return;}
            cursor++;
        },8);
        report('MIGRATION READY '+JSON.stringify({...totals,settings,routing:'active'}));
    }catch(e){report('MIGRATION HOLD '+e);}
}));
