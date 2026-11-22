// Read-only projection for one committed terminal. Installed beside Fresh topology.js.
import {discover} from './topology.js';

const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
const modes=['filter','wildcard','auto','bypass'];
const dims=new Map([['minecraft:overworld','o'],['minecraft:nether','n'],['minecraft:the_end','e']]);
const address=p=>[p.d,p.x,p.y,p.z].join('|');
const freshKey=(kind,p)=>'hartlab:'+kind+'_'+[dims.get(p.d),p.x,p.y,p.z].join('_');
function checkPosition(p){
    requireValue(p && dims.has(p.d) && [p.x,p.y,p.z].every(Number.isSafeInteger),'Invalid registry position');
}
function sorterRows(world){
    const get=k=>world.getDynamicProperty('hartsorter:'+k);
    const header=get('registry_v2');
    if(header===undefined){
        const rows=JSON.parse(get('registry_v1')??'null');
        requireValue(Array.isArray(rows),'Legacy Sorter registry unavailable');
        return rows;
    }
    const meta=JSON.parse(header);
    requireValue(meta?.version===2 && [0,1].includes(meta.gen) && Number.isSafeInteger(meta.shards) &&
        meta.shards>0 && meta.shards<=4096 && Number.isSafeInteger(meta.chars) && meta.chars>=2,'Invalid committed Sorter registry header');
    const parts=[];
    for(let i=0;i<meta.shards;i++){
        const part=get('r2_'+meta.gen+'_'+i);
        requireValue(typeof part==='string','Missing active Sorter shard '+i);
        parts.push(part);
    }
    const raw=parts.join('');
    requireValue(raw.length===meta.chars,'Sorter registry length mismatch');
    const rows=JSON.parse(raw);
    requireValue(Array.isArray(rows) && rows.length===meta.count,'Sorter registry count mismatch');
    return rows;
}
export function previewConfiguration(world,queue){
    const control=JSON.parse(world.getDynamicProperty('hartlab:handoff1_control')??'null');
    requireValue(/^q\d+$/.test(queue) && control?.phase==='committed' && control.v===1 &&
        Array.isArray(control.manifest),'Expected committed handoff and queue key');
    const contributions=control.manifest.filter(row=>row[0]===queue);
    requireValue(contributions.length===1 && ['transfer','retain'].includes(contributions[0][2]),'No spendable Receiver contribution for '+queue);
    const target=contributions[0][3];
    const registry=JSON.parse(world.getDynamicProperty('hartsorter:logistics_v2')??'null');
    requireValue(Array.isArray(registry?.collectors) && Array.isArray(registry.receivers),'Missing logistics registry');
    const owners=registry.receivers.filter(r=>r.id===target);
    requireValue(owners.length===1 && owners[0].present===true,'Missing or ambiguous terminal '+target);
    const receiver=owners[0];
    checkPosition(receiver);
    requireValue(address(receiver)===target,'Terminal address mismatch');
    const dimension=world.getDimension(receiver.d);
    let reads=0;
    const read=p=>{
        requireValue(++reads<=2048,'Terminal preview exceeds 2048 block reads');
        return dimension.getBlock({x:p.x,y:p.y,z:p.z});
    };
    requireValue(read(receiver)?.typeId==='hartsorter:receiver','Terminal missing or unloaded '+target);
    const inlet={x:receiver.x,y:receiver.y-1,z:receiver.z};
    requireValue(read(inlet)?.typeId==='minecraft:hopper','Legacy outlet missing or unloaded '+target);
    const net=discover(receiver,{inlet},read,'hartsorter:sorter');
    requireValue(net.spots.length>0,'Terminal lane has no unambiguous Sorters');
    const settings=new Map(), modesFound={filter:0,auto:0,wildcard:0,bypass:0};
    const terminalKey=freshKey('r',receiver);
    settings.set(terminalKey,{inlet});
    const positions=new Map();
    for(const row of sorterRows(world)){
        checkPosition(row);
        const id=address(row);
        requireValue(!positions.has(id),'Duplicate Sorter address '+id);
        positions.set(id,row);
    }
    for(const spot of net.spots){
        const id=address({...spot,d:receiver.d});
        const row=positions.get(id);
        requireValue(row && !row.nativeQuarantine,'Missing or quarantined Sorter '+id);
        const mode=row.m??(row.f?'filter':'wildcard');
        requireValue(modes.includes(mode),'Unknown Sorter mode '+id);
        requireValue(!row.f || typeof row.f.match?.typeId==='string','Unreadable filter '+id);
        settings.set(freshKey('s',row),{...row,m:mode});
        modesFound[mode]++;
    }
    let links=0;
    for(const collector of registry.collectors.filter(c=>c.link===target && c.present===true)){
        checkPosition(collector);
        const key=freshKey('c',collector);
        requireValue(address(collector)===collector.id && !settings.has(key),'Invalid or duplicate linked Collector '+key);
        settings.set(key,{receiver:terminalKey});
        links++;
    }
    for(const [key,value] of settings){
        const existing=world.getDynamicProperty(key);
        requireValue(existing===undefined || existing===JSON.stringify(value),'Existing Fresh configuration differs at '+key);
    }
    return {target,settings,modesFound,links,hoppers:net.lane.length,sorters:net.spots.length};
}
