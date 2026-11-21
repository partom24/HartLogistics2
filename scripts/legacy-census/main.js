// Optional offline-copy inspection under the original behavior pack identity.
import {world,system} from '@minecraft/server';
import {q4Census,scanLegacyQueues} from './q4Lab.js';

const reader={
    getDynamicPropertyIds:()=>world.getDynamicPropertyIds(),
    getDynamicProperty:key=>world.getDynamicProperty(key)
};
system.beforeEvents.startup.subscribe(event=>{
    event.blockComponentRegistry.registerCustomComponent('hartlogistics:redstone_input',{onRedstoneUpdate(){}});
});
let running=false;
system.afterEvents.scriptEventReceive.subscribe(event=>{
    if(event.id!=='hartlab:q4_census' && event.id!=='hartlab:q4_census_all')return;
    const source=event.sourceEntity;
    function report(message){
        console.warn('[Hart legacy census] '+message);
        try{source?.sendMessage(message);}catch{} // Console remains available after logout.
    }
    if(event.id==='hartlab:q4_census_all'){
        if(running){report('Already scanning');return;}
        running=true;
        const scan=scanLegacyQueues(reader,report);
        function advance(){
            try{
                if(!scan.next().done){system.runTimeout(advance,1);return;}
            }catch(error){report('HOLD '+String(error));}
            running=false;
        }
        advance();
        return;
    }
    try{report(q4Census(reader,event.message.trim()));}
    catch(error){report('HOLD '+String(error));}
});
