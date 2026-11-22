// Inspect the fixed hopper bus and its registered Collector links on a legacy LAB copy.
const HOPPER='minecraft:hopper', RECEIVER='hartsorter:receiver', COLLECTOR='hartsorter:collector';
const offsets=[[0,-1,0],[0,-1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
const address=p=>[p.d,p.x,p.y,p.z].join('|');
const step=(p,[x,y,z])=>({d:p.d,x:p.x+x,y:p.y+y,z:p.z+z});
function unique(rows, label){
    if(rows.length!==1)throw Error(label+' entries='+rows.length);
    return rows[0];
}
function checkEntry(entry){
    if(typeof entry.d!=='string' || ![entry.x,entry.y,entry.z].every(Number.isSafeInteger) ||
        entry.id!==address(entry))throw Error('invalid registry address '+entry.id);
    if(entry.present!==true)throw Error('registered absent '+entry.id);
}

export async function traceQueue(registry,key,read,pause,report){
    let receiver=unique(registry.receivers.filter(r=>r.queueKey===key),'queue '+key);
    const seen=new Set();
    function visit(p){
        const id=address(p);
        if(seen.has(id))throw Error('cycle at '+id);
        if(seen.size>=4096)throw Error('trace limit at '+id);
        seen.add(id);
    }
    while(true){
        checkEntry(receiver);
        unique(registry.receivers.filter(r=>r.id===receiver.id),'Receiver '+receiver.id);
        visit(receiver);
        if((await read(receiver)).typeId!==RECEIVER)throw Error('missing Receiver '+receiver.id);
        let p=step(receiver,offsets[0]), columns=0, hops=0;
        let block=await read(p);
        while(block.typeId===HOPPER){
            visit(p);
            if(++hops%8===0)await pause();
            const direction=block.permutation.getState('facing_direction');
            const offset=offsets[direction];
            if(!offset)throw Error('unknown hopper direction at '+address(p));
            const lower=await read(step(p,offsets[0]));
            if(direction>1 && lower.typeId===HOPPER)throw Error('competing downward hopper at '+address(p));
            if(lower.typeId==='hartsorter:sorter')columns++;
            p=step(p,offset);
            block=await read(p);
        }
        report('Receiver '+receiver.id+' hoppers='+hops+' Sorter columns='+columns+' output='+block.typeId+' at '+address(p));
        if(!hops)throw Error('missing output hopper at '+address(p));
        if(block.typeId===COLLECTOR){
            const c=unique(registry.collectors.filter(c=>c.id===address(p)),'Collector '+address(p));
            checkEntry(c);
            report('Collector '+c.id+' links to '+c.link);
            receiver=unique(registry.receivers.filter(r=>r.id===c.link),'linked Receiver '+c.link);
            await pause();
            continue;
        }
        if(!columns)throw Error('no Sorter column on final lane '+receiver.id);
        if(!['minecraft:chest','minecraft:trapped_chest','minecraft:barrel'].includes(block.typeId))
            throw Error('unresolved lane end '+address(p));
        if(block.getComponent('minecraft:inventory')?.container?.size!==27)
            throw Error('unresolved container size at '+address(p));
        if((await read(step(p,offsets[0]))).typeId===HOPPER)
            throw Error('storage has downstream hopper at '+address(p));
        return receiver.id;
    }
}

export async function traceLegacy(reader,world,system,selection,report){
    if(selection && !/^q\d+$/.test(selection))throw Error('expected queue key, e.g. q2');
    const registry=JSON.parse(reader.getDynamicProperty('hartsorter:logistics_v2'));
    if(!Array.isArray(registry?.receivers) || !Array.isArray(registry.collectors))throw Error('invalid registry');
    const ids=reader.getDynamicPropertyIds().filter(id=>id.startsWith('hartsorter:q4m_')).sort();
    const prefix='hartsorter:q4m_', keys=selection?[selection]:ids.map(id=>id.slice(prefix.length));
    if(!keys.length)throw Error('no visible queues');
    const pause=()=>new Promise(resolve=>system.runTimeout(resolve,1));
    let candidates=0,held=0,items=0;
    for(const key of keys){
        const meta=JSON.parse(reader.getDynamicProperty(prefix+key));
        if(meta?.v!==4 || !Number.isSafeInteger(meta.q) || meta.q<0 ||
            !Number.isSafeInteger(meta.r) || !Number.isSafeInteger(meta.d) || meta.r-meta.d!==meta.q)
            throw Error('invalid Q4 metadata '+key);
        if(!meta.q){if(selection)report(key+' empty');continue;}
        items+=meta.q;
        const areas=new Set();
        async function read(p){
            const dim=world.getDimension(p.d), point={x:p.x,y:p.y,z:p.z};
            function tryRead(){try{return dim.getBlock(point);}catch{return undefined;}}
            let block=tryRead();
            if(block)return block;
            const manager=world.tickingAreaManager;
            const options={dimension:dim,from:point,to:point};
            const id='hart_trace_'+p.d.replace(/[^a-z0-9_]/gi,'_')+'_'+Math.floor(p.x/16)+'_'+Math.floor(p.z/16);
            if(!areas.has(id)){
                if(!manager || areas.size>=16 || !manager.hasCapacity(options))throw Error('unreadable '+address(p));
                await manager.createTickingArea(id,options);
                areas.add(id);
            }
            block=tryRead();
            if(!block)throw Error('unreadable '+address(p)+' after chunk request');
            return block;
        }
        try{
            const target=await traceQueue(registry,key,read,pause,msg=>report(key+' '+msg));
            candidates++;
            report(key+' items='+meta.q+' terminal candidate='+target);
        }catch(error){held++;report(key+' items='+meta.q+' HOLD '+String(error));}
        finally{
            const errors=[];
            for(const id of areas)try{world.tickingAreaManager.removeTickingArea(id);}catch(error){errors.push(id+' '+error);}
            if(errors.length)throw Error('temporary area cleanup: '+errors.join(', '));
        }
        await pause();
    }
    report('TRACE COMPLETE committed='+items+' candidates='+candidates+' holds='+held);
}
