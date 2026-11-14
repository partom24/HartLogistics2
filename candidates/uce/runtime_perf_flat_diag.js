/* Explicit OP-only indexing of the command-generated 1,387-Sorter
 * benchmark. No queue, filter, link, or custody writes. Not for production.
 * The coordinates are a test fixture, never a player build limit.
 */
let ucePerfFlatIndexRunning=false;
function ucePerfFlatIndex(origin){
    const player=origin?.sourceEntity;
    const say=m=>{if(player?.sendMessage)player.sendMessage(m);else log(m.replace(/§./g,''));};
    if(ucePerfFlatIndexRunning){say('§e[HL2 diagnostic] Index in progress.');return;}
    if(!ready||uceLegacyWriterBlocked()||registry.length!==0||
       logistics.collectors.length||logistics.receivers.length){
        say('§c[HL2 diagnostic] REFUSED: nonempty or unified logistics state.');return;
    }
    try{
        const keys=world.getDynamicPropertyIds();
        const meta=registryMeta(),raw=world.getDynamicProperty(REGISTRY_META_KEY);
        if((raw!==undefined&&(!meta||meta.count!==0))||
           keys.some(k=>/^hartsorter:(?:q[234]|journal|queue_journal)/.test(k))||
           keys.some(k=>/^hartlogistics:uce_/.test(k))){
            say('§c[HL2 diagnostic] REFUSED: persisted queue/authority state.');return;
        }
    }catch(_){say('§c[HL2 diagnostic] REFUSED: registry preflight unavailable.');return;}
    let dim;
    try{dim=world.getDimension('overworld');}catch(_){}
    if(!dim||typeof system.runJob!=='function'){
        say('§c[HL2 diagnostic] REFUSED: no world dimension or runJob.');return;
    }
    const epoch=ucePipeTopologyEpoch;
    ucePerfFlatIndexRunning=true;
    function* job(){
        try{
            const entries=[];
            let columns=0;
            for(let z=0;z<=34;z+=2){
                for(let x=0;x<=38;x+=2){
                    if(z===34&&x>12)continue;
                    const height=z===34&&x===12?3:4;
                    for(let y=-59;y<-59+height;y++){
                        let b;
                        try{b=dim.getBlock({x,y,z});}catch(_){}
                        if(!b||b.typeId!==SORTER_ID){
                            say('§c[HL2 diagnostic] REFUSED: missing Sorter '+x+','+y+','+z);return;
                        }
                        entries.push({d:dim.id,x,y,z,f:null,m:'wildcard'});
                    }
                    let hopper;
                    try{hopper=dim.getBlock({x,y:-59+height,z});}catch(_){}
                    if(!hopper||hopper.typeId!=='minecraft:hopper'){
                        say('§c[HL2 diagnostic] REFUSED: missing Hopper '+x+','+(-59+height)+','+z);return;
                    }
                    columns++;
                    if(columns%4===0)yield;
                }
            }
            if(columns!==347||entries.length!==1387||
               ucePipeTopologyEpoch!==epoch||registry.length!==0||
               !ready||uceLegacyWriterBlocked()||
               logistics.collectors.length||logistics.receivers.length){
                say('§c[HL2 diagnostic] REFUSED: world changed or grid mismatch.');return;
            }
            // Final live witness; no callback/yield between checks and commit.
            for(const e of entries){
                let b;
                try{b=dim.getBlock({x:e.x,y:e.y,z:e.z});}catch(_){}
                if(!b||b.typeId!==SORTER_ID){
                    say('§c[HL2 diagnostic] REFUSED: grid changed.');return;
                }
            }
            const prior=registry;
            registry=entries;
            try{
                saveRegistry(); // ONE two-generation registry transaction.
                dirty=true;
                say('§a[HL2 diagnostic] Registered 1387 Sorters in 347 columns. Restart BDS; verify ready; sorters=1387.');
            }catch(err){
                registry=prior;
                say('§c[HL2 diagnostic] Registry commit refused: '+String(err));
            }
        }catch(err){say('§c[HL2 diagnostic] REFUSED: '+String(err));}
        finally{ucePerfFlatIndexRunning=false;}
    }
    try{system.runJob(job());}
    catch(_){ucePerfFlatIndexRunning=false;say('§c[HL2 diagnostic] REFUSED: runJob failed.');}
}
