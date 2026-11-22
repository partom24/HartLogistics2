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
    const first=unique(registry.receivers.filter(r=>r.queueKey===key),'queue '+key);
    const pending=[], edges=new Map(), incoming=new Map(), targets=new Set(), holds=new Set();
    function enqueue(receiver,p,sorted,from){
        const id=JSON.stringify([receiver.id,address(p),sorted]);
        if(!edges.has(id)){
            if(edges.size>=4096)throw Error('trace limit at '+address(p));
            edges.set(id,[]);
            incoming.set(id,0);
            pending.push({receiver,p,sorted,id});
        }
        if(from!==undefined){
            edges.get(from).push(id);
            incoming.set(id,incoming.get(id)+1);
        }
    }
    enqueue(first,first,false);
    for(let i=0;i<pending.length;i++){
        if(i%8===0)await pause();
        const {receiver,p,sorted,id}=pending[i];
        try{
            if(p===receiver){
                checkEntry(receiver);
                unique(registry.receivers.filter(r=>r.id===receiver.id),'Receiver '+receiver.id);
                if((await read(p)).typeId!==RECEIVER)throw Error('missing Receiver '+address(p));
                const below=step(p,offsets[0]);
                if((await read(below)).typeId!==HOPPER)throw Error('missing output hopper at '+address(below));
                enqueue(receiver,below,false,id);
                continue;
            }
            const block=await read(p);
            if(block.typeId===HOPPER){
                const lower=step(p,offsets[0]), lowerType=(await read(lower)).typeId;
                const direction=block.permutation.getState('facing_direction');
                if(!offsets[direction])throw Error('unknown hopper direction at '+address(p));
                const forward=step(p,offsets[direction]);
                if(direction>1 && lowerType===HOPPER){
                    const forwardType=(await read(forward)).typeId;
                    report('split at '+address(p)+' forward='+forwardType+' at '+address(forward)+' lower hopper='+address(lower));
                    enqueue(receiver,lower,sorted,id);
                    // An air block cannot receive the forward transfer.
                    if(forwardType==='minecraft:air')continue;
                }
                enqueue(receiver,forward,sorted || lowerType==='hartsorter:sorter',id);
                continue;
            }
            if(block.typeId===COLLECTOR){
                const c=unique(registry.collectors.filter(c=>c.id===address(p)),'Collector '+address(p));
                checkEntry(c);
                report('Receiver '+receiver.id+' via Collector '+c.id+' links to '+c.link);
                const next=unique(registry.receivers.filter(r=>r.id===c.link),'linked Receiver '+c.link);
                enqueue(next,next,false,id);
                continue;
            }
            if(['minecraft:chest','minecraft:trapped_chest','minecraft:barrel'].includes(block.typeId)){
                if(block.getComponent('minecraft:inventory')?.container?.size!==27)
                    throw Error('unresolved container size at '+address(p));
                const lower=step(p,offsets[0]);
                if((await read(lower)).typeId===HOPPER){
                    enqueue(receiver,lower,sorted,id);
                    continue;
                }
            }else if(block.typeId!=='minecraft:air'){
                throw Error('unresolved '+block.typeId+' at '+address(p));
            }
            report('Receiver '+receiver.id+' lane end='+block.typeId+' at '+address(p)+' Sorter observed='+sorted);
            if(!sorted)throw Error('no Sorter column on final lane '+receiver.id+' ending at '+address(p));
            targets.add(receiver.id);
        }catch(error){
            holds.add(String(error));
        }
    }
    // Shared downstream paths can merge. Only a directed cycle prevents
    // repeatedly removing nodes with no remaining inbound edges.
    const roots=[...incoming.keys()].filter(id=>incoming.get(id)===0);
    for(let i=0;i<roots.length;i++){
        for(const next of edges.get(roots[i])){
            const count=incoming.get(next)-1;
            incoming.set(next,count);
            if(count===0)roots.push(next);
        }
    }
    if(roots.length!==edges.size)holds.add('cycle in reachable route from '+first.id);
    if(targets.size>1)holds.add('different terminal Receivers '+[...targets].join(', '));
    if(holds.size)throw Error([...holds].join(' | '));
    return unique([...targets],'terminal Receiver');
}

async function planQueue(registry,key,read,pause){
    let owner;
    try{
        owner=unique(registry.receivers.filter(r=>r.queueKey===key),'queue '+key);
        checkEntry(owner);
        unique(registry.receivers.filter(r=>r.id===owner.id),'Receiver '+owner.id);
        if((await read(owner)).typeId!==RECEIVER)throw Error('missing Receiver '+owner.id);
    }catch(error){
        return {action:'hold',detail:String(error)};
    }
    try{
        const target=await traceQueue(registry,key,read,pause,()=>{});
        return {source:owner.id,target,action:target===owner.id?'retain':'transfer',detail:'source='+owner.id+' target='+target};
    }catch(error){
        return {source:owner.id,target:owner.id,action:'retain',detail:'target='+owner.id+' downstream unresolved: '+String(error).split(' | ')[0]};
    }
}

export async function traceLegacy(reader,world,system,selection,report,plan=false){
    if(selection && !/^q\d+$/.test(selection))throw Error('expected queue key, e.g. q2');
    const registry=JSON.parse(reader.getDynamicProperty('hartsorter:logistics_v2'));
    if(!Array.isArray(registry?.receivers) || !Array.isArray(registry.collectors))throw Error('invalid registry');
    const ids=reader.getDynamicPropertyIds().filter(id=>id.startsWith('hartsorter:q4m_')).sort();
    const prefix='hartsorter:q4m_', keys=selection?[selection]:ids.map(id=>id.slice(prefix.length));
    if(!keys.length)throw Error('no visible queues');
    const pause=()=>new Promise(resolve=>system.runTimeout(resolve,1));
    const totals={transfer:0,retain:0,hold:0};
    const decisions=[];
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
            if(plan){
                const {action,detail,source,target}=await planQueue(registry,key,read,pause);
                decisions.push({key,action,source,target,quantity:meta.q});
                totals[action]+=meta.q;
                report(key+' items='+meta.q+' '+action.toUpperCase()+' '+detail);
            }else{
                const target=await traceQueue(registry,key,read,pause,msg=>report(key+' '+msg));
                candidates++;
                report(key+' items='+meta.q+' terminal candidate='+target);
            }
        }catch(error){if(plan)throw error;held++;report(key+' items='+meta.q+' HOLD '+String(error));}
        finally{
            const errors=[];
            for(const id of areas)try{world.tickingAreaManager.removeTickingArea(id);}catch(error){errors.push(id+' '+error);}
            if(errors.length)throw Error('temporary area cleanup: '+errors.join(', '));
        }
        await pause();
    }
    if(plan){
        if(!Number.isSafeInteger(items) || totals.transfer+totals.retain+totals.hold!==items)throw Error('plan total mismatch');
        report('PLAN COMPLETE committed='+items+' transfer='+totals.transfer+' retain='+totals.retain+' hold='+totals.hold);
        return decisions;
    }
    report('TRACE COMPLETE committed='+items+' candidates='+candidates+' holds='+held);
}
