// Frozen original-identity LAB only. An immutable source contribution belongs
// to exactly one side of the persisted phase switch. Old pages remain evidence.
import {scanQueue} from './q4Lab.js';
import {traceLegacy} from './trace.js';

const prefix='hartlab:handoff1_', control=prefix+'control';
function checked(ok,msg){if(!ok)throw Error(msg);}
function write(world,key,raw){
    world.setDynamicProperty(key,raw);
    checked(world.getDynamicProperty(key)===raw,'failed readback '+key);
}
function stage(world,key,raw,allowCreate){
    const previous=world.getDynamicProperty(key);
    if(previous===undefined && allowCreate)write(world,key,raw);
    else checked(previous===raw,'missing or disputed '+key);
}

export async function handoff(world,system,action,report){
    checked(['prepare','commit','status'].includes(action),'invalid action');
    const ids=world.getDynamicPropertyIds();
    checked(!ids.some(id=>/^hartsorter:(queue_journal_v1$|journal_v1$|q[23])/.test(id)),'unresolved journal or older queue');
    const pause=()=>new Promise(resolve=>system.runTimeout(resolve,1));
    const plan=await traceLegacy(world,world,system,'',()=>{},true);
    const registry=world.getDynamicProperty('hartsorter:logistics_v2');
    const saved=world.getDynamicProperty(control);
    const phase=saved===undefined?'new':JSON.parse(saved).phase;
    checked(['new','prepared','committed'].includes(phase),'invalid phase');
    checked(phase!=='new' || action==='prepare','run prepare first');
    const populate=phase==='new' && action==='prepare';
    const keys=ids.filter(id=>id.startsWith('hartsorter:q4m_')).sort();
    const manifest=[], expected=new Set([control]);
    const balances=new Map();
    let total=0,held=0;
    for(const metaId of keys){
        const key=metaId.slice('hartsorter:q4m_'.length);
        checked(/^q[0-9]+$/.test(key),'unrecognized queue '+key);
        const metaRaw=world.getDynamicProperty(metaId);
        const scan=scanQueue(world,'hartsorter:',key,true);
        let result=scan.next();
        while(!result.done){await pause();result=scan.next();}
        const {entries,total:quantity}=result.value;
        const decision=plan.find(row=>row.key===key);
        checked((decision?.quantity??0)===quantity,'changed quantity '+key);
        // Preserve source metadata even for empty queues to detect changed bounds.
        manifest.push([key,metaRaw,decision?.action??'empty',decision?.target??null,entries.size,decision?.source??null]);
        total+=quantity;
        if(!quantity)continue;
        if(decision.action==='hold')held+=quantity;
        else balances.set(decision.target,(balances.get(decision.target)??0)+quantity);
        let i=0;
        for(const [id,{raw,qty}] of entries){
            if(i++%8===0)await pause();
            // Definition bytes can already approach the property size limit.
            // Keep the count in its own property; keys are scoped per source.
            const def=prefix+'def_'+key+'_'+id, amount=prefix+'qty_'+key+'_'+id;
            expected.add(def);expected.add(amount);
            stage(world,def,raw,populate);
            stage(world,amount,qty,populate);
        }
    }
    const live=world.getDynamicPropertyIds();
    checked(live.filter(k=>k.startsWith('hartsorter:q4m_')).sort().join('|')===keys.join('|') &&
        manifest.every(([key,meta])=>world.getDynamicProperty('hartsorter:q4m_'+key)===meta) &&
        registry===world.getDynamicProperty('hartsorter:logistics_v2'),'source changed during scan');
    checked(live.every(k=>!k.startsWith(prefix)||expected.has(k)),'unexpected staged records');
    const record=p=>JSON.stringify({v:1,phase:p,manifest});
    if(saved!==undefined)checked(saved===record(phase),'plan or source differs from checkpoint');
    const next=action==='commit'?'committed':phase==='new'?'prepared':phase;
    if(next!==phase)write(world,control,record(next));
    for(const [target,qty] of balances)report('target='+target+' quantity='+qty);
    report('HANDOFF '+next+' source='+(next==='committed'?held:total)+' receiver='+
        (next==='committed'?total-held:0)+' held='+held+' total='+total);
}
