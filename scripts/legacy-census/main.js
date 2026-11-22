// Optional offline-copy inspection under the original behavior pack identity.
import {world,system,ScriptEventSource} from '@minecraft/server';
import {q4Census,scanLegacyQueues} from './q4Lab.js';

import {handoff} from './handoff.js';
import {traceLegacy} from './trace.js';

const reader={
    getDynamicPropertyIds:()=>world.getDynamicPropertyIds(),
    getDynamicProperty:key=>world.getDynamicProperty(key)
};
system.beforeEvents.startup.subscribe(event=>{
    event.blockComponentRegistry.registerCustomComponent('hartlogistics:redstone_input',{onRedstoneUpdate(){}});
});
// Inspect the registered inputs and the actual first hopper under each
// cargo-owning Receiver. A saved coordinate alone cannot prove a terminal.
function* mapSources(reader,report){
    const registry=JSON.parse(reader.getDynamicProperty('hartsorter:logistics_v2'));
    if(!Array.isArray(registry?.receivers) || !Array.isArray(registry.collectors))
        throw Error('Invalid legacy logistics registry');
    const ids=reader.getDynamicPropertyIds().filter(id=>id.startsWith('hartsorter:q4m_')).sort();
    if(!ids.length)throw Error('No visible Q4 queues');
    let nonempty=0,total=0,holds=0;
    for(const id of ids){
        yield;
        const key=id.slice('hartsorter:q4m_'.length);
        const meta=JSON.parse(reader.getDynamicProperty(id));
        if(meta?.v!==4 || !Number.isSafeInteger(meta.q) || meta.q<0 ||
            !Number.isSafeInteger(meta.r) || !Number.isSafeInteger(meta.d) || meta.r-meta.d!==meta.q)
            throw Error('Invalid metadata '+key);
        if(!meta.q)continue;
        total+=meta.q;
        nonempty++;
        const owners=registry.receivers.filter(r=>r.queueKey===key);
        if(owners.length!==1){
            holds++;
            report(key+' items='+meta.q+' HOLD registry owners='+owners.length);
            continue;
        }
        const r=owners[0];
        const valid=[r.x,r.y,r.z].every(Number.isSafeInteger) &&
            r.id===[r.d,r.x,r.y,r.z].join('|') &&
            registry.receivers.filter(other=>other.id===r.id).length===1;
        const inputs=registry.collectors.filter(c=>c.present===true && c.link===r.id);
        let state='HOLD invalid Receiver address';
        if(valid && r.present!==true)state='HOLD registered absent';
        if(valid && r.present===true){
            try{
                const dim=world.getDimension(r.d);
                const block=dim.getBlock({x:r.x,y:r.y,z:r.z});
                const below=dim.getBlock({x:r.x,y:r.y-1,z:r.z});
                if(!block || !below)state='HOLD blocks unreadable';
                else if(block.typeId!=='hartsorter:receiver')state='HOLD block='+block.typeId;
                else if(below.typeId!=='minecraft:hopper')state='HOLD below='+below.typeId;
                else state='Receiver and output hopper verified';
            }catch(error){state='HOLD block read: '+String(error);}
        }
        if(state.startsWith('HOLD'))holds++;
        report(key+' items='+meta.q+' receiver='+r.id+' linked present Collectors='+inputs.length+' '+state);
    }
    report('SOURCE MAP queues='+ids.length+' nonempty='+nonempty+' committed='+total+' source holds='+holds);
}

let running=false;
system.afterEvents.scriptEventReceive.subscribe(event=>{
    if(!['hartlab:q4_census','hartlab:q4_census_all','hartlab:q4_sources','hartlab:q4_trace','hartlab:q4_plan','hartlab:q4_handoff'].includes(event.id))return;
    const source=event.sourceEntity;
    function report(message){
        console.warn('[Hart legacy census] '+message);
        try{source?.sendMessage(message);}catch{} // Console remains available after logout.
    }
    if(event.id!=='hartlab:q4_census'){
        if(running){report('Already scanning');return;}
        if(event.id==='hartlab:q4_handoff' && event.sourceType!==ScriptEventSource.Server){
            report('Run handoff from the BDS console');return;
        }
        running=true;
        if(event.id==='hartlab:q4_handoff'){
            handoff(world,system,event.message.trim(),report)
                .catch(error=>report('HOLD '+String(error))).finally(()=>{running=false;});
            return;
        }
        if(event.id==='hartlab:q4_trace' || event.id==='hartlab:q4_plan'){
            traceLegacy(reader,world,system,event.message.trim(),report,event.id==='hartlab:q4_plan')
                .catch(error=>report('HOLD '+String(error))).finally(()=>{running=false;});
            return;
        }
        const scan=event.id==='hartlab:q4_sources'?mapSources(reader,report):scanLegacyQueues(reader,report);
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
