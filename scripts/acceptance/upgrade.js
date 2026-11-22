import {migrateCustody} from './startup-custody.js';
import {sorterRows} from './config-preview.js';
import {ordinary} from './committedDispatch.js';

const phaseKey='hartlab:upgrade_phase_v1';
const prefix='hartlab:handoff1_';
const dimCodes={'minecraft:overworld':'o','minecraft:nether':'n','minecraft:the_end':'e',overworld:'o',nether:'n',the_end:'e'};
function key(kind,row){
    const d=dimCodes[row.d];
    if(!d || ![row.x,row.y,row.z].every(Number.isSafeInteger))throw Error('Invalid legacy block address');
    return 'hartlab:'+kind+'_'+[d,row.x,row.y,row.z].join('_');
}
function checkedWrite(world,k,v){
    world.setDynamicProperty(k,v);
    if(world.getDynamicProperty(k)!==v)throw Error('Write readback failed '+k);
}
async function migrateSettings(world,pause){
    const registry=JSON.parse(world.getDynamicProperty('hartsorter:logistics_v2'));
    const targets=new Map(), settings=new Map();
    function add(k,value){
        if(settings.has(k))throw Error('Duplicate configuration '+k);
        settings.set(k,JSON.stringify(value));
    }
    for(const row of registry.receivers){
        if(!row.present)continue;
        const k=key('r',row);
        if(row.id!==[row.d,row.x,row.y,row.z].join('|'))throw Error('Receiver ID mismatch');
        targets.set(row.id,k);
        add(k,{inlet:{x:row.x,y:row.y-1,z:row.z}});
    }
    for(const row of registry.collectors){
        if(!row.present || !row.link)continue;
        const target=targets.get(row.link);
        // Preserve a stale link without relinking it to an unrelated bank.
        const old=target??registry.receivers.find(r=>r.id===row.link);
        if(!old)throw Error('Unregistered Collector destination '+row.link);
        add(key('c',row),{receiver:target??key('r',old)});
    }
    for(const row of sorterRows(world)){
        const mode=row.m??(row.f?'filter':'wildcard');
        if(!['filter','auto','wildcard','bypass'].includes(mode))throw Error('Unrecognized Sorter mode');
        add(key('s',row),{...row,m:row.nativeQuarantine?'filter':mode});
    }
    let n=0;
    for(const [k,v] of settings){
        if(++n%16===0)await pause();
        const existing=world.getDynamicProperty(k);
        if(existing===undefined)checkedWrite(world,k,v);
        else if(existing!==v)throw Error('Conflicting setting '+k);
    }
    return settings.size;
}

export async function upgrade(world,system,report){
    const pause=()=>new Promise(resolve=>system.runTimeout(resolve,1));
    const state=world.getDynamicProperty(phaseKey);
    if(state!==undefined && !['locked','ready'].includes(state))throw Error('Invalid migration phase');
    let settings;
    if(state!=='ready'){
        checkedWrite(world,phaseKey,'locked');
        await migrateCustody(world,system,report);
        settings=await migrateSettings(world,pause);
    }
    const control=JSON.parse(world.getDynamicProperty(prefix+'control'));
    if(control.phase!=='committed')throw Error('Custody missing');
    const rows=new Map(control.manifest.map(row=>[row[0],row]));
    const accounts=[];
    const totals={sourceHeld:0,receiver:0,issued:0,uncertain:0,definitionHeld:0,total:0};
    let n=0;
    for(const k of world.getDynamicPropertyIds()){
        if(!k.startsWith(prefix+'qty_'))continue;
        if(++n%16===0)await pause();
        const suffix=k.slice((prefix+'qty_').length), split=suffix.indexOf('_'), row=rows.get(suffix.slice(0,split));
        if(!row)throw Error('Unknown staged contribution '+k);
        const quantity=world.getDynamicProperty(k);
        if(!Number.isSafeInteger(quantity)||quantity<=0)throw Error('Invalid quantity '+k);
        totals.total+=quantity;
        if(row[2]==='hold'){totals.sourceHeld+=quantity;continue;}
        if(!row[3] || !['transfer','retain'].includes(row[2]))throw Error('Invalid account owner');
        const raw=world.getDynamicProperty(prefix+'def_'+suffix);
        const progress='hartlab:upgrade_spent_'+suffix;
        const saved=JSON.parse(world.getDynamicProperty(progress)??'{"spent":0,"pending":0}');
        if(![saved.spent,saved.pending].every(v=>Number.isSafeInteger(v)&&v>=0) || saved.spent+saved.pending>quantity)throw Error('Invalid debit '+suffix);
        const remaining=quantity-saved.spent-saved.pending;
        totals.issued+=saved.spent;totals.uncertain+=saved.pending;totals.receiver+=remaining;
        if(saved.pending || !ordinary(raw)){totals.definitionHeld+=remaining;continue;}
        if(remaining)accounts.push({target:row[3],type:JSON.parse(raw).typeId,quantity,progress,spent:saved.spent});
    }
    const original=control.manifest.reduce((sum,row)=>sum+JSON.parse(row[1]).q,0);
    if(original!==totals.total || totals.sourceHeld+totals.receiver+totals.issued+totals.uncertain!==original)throw Error('Custody reconciliation failed');
    if(state!=='ready')checkedWrite(world,phaseKey,'ready');
    return {accounts,totals,settings};
}

export function releaseOne(world,a,makeItem,offer){
    const saved=JSON.parse(world.getDynamicProperty(a.progress)??'{"spent":0,"pending":0}');
    if(saved.pending || saved.spent!==a.spent)throw Error('Debit needs reconciliation '+a.progress);
    const item=makeItem(a.type);
    item.amount=Math.min(item.maxAmount,a.quantity-a.spent);
    const amount=item.amount;
    let available=true;
    const source={getItem:()=>available?item.clone():undefined,transferItem(slot,dest){
        if(slot!==0 || !available)throw Error('Stale account offer');
        checkedWrite(world,a.progress,JSON.stringify({spent:a.spent,pending:amount}));
        available=false;
        if(dest.addItem(item))throw Error('Uncertain partial admission');
        checkedWrite(world,a.progress,JSON.stringify({spent:a.spent+amount,pending:0}));
        a.spent+=amount;
    }};
    offer(a.target,item,source);
    if(!available && JSON.parse(world.getDynamicProperty(a.progress)).pending)throw Error('Uncertain physical transfer '+a.progress);
    return !available;
}
