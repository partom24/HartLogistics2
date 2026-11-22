// One-shot, locked LAB consumer of a committed original-identity handoff.
import {scanQueue} from './q4Lab.js';

const prefix='hartlab:handoff1_', receiptKey='hartlab:dispatch_trial1';
const check=(condition,message)=>{if(!condition)throw Error(message);};

function ordinary(raw){
    const d=JSON.parse(raw);
    // Only inert vanilla building materials with a fully understood definition.
    return /^minecraft:(stone|cobblestone|cobbled_deepslate|deepslate|dirt|gravel|sand|netherrack|oak_planks|stonebrick|stone_bricks|granite|andesite|diorite|blackstone|basalt|end_stone)$/.test(d.typeId)
        && Object.keys(d).every(k=>['typeId','nameTag','lore','ench','canDestroy','canPlaceOn','dyn'].includes(k))
        && (d.nameTag===undefined || d.nameTag==='')
        && ['lore','ench','canDestroy','canPlaceOn'].every(k=>Array.isArray(d[k])&&!d[k].length)
        && (d.dyn===undefined || (d.dyn!==null && typeof d.dyn==='object' && !Array.isArray(d.dyn) && !Object.keys(d.dyn).length));
}

export async function dispatchTrial(world,pause,makeItem,command,report){
    const match=/^send (q\d+)$/.exec(command);
    check(match || command==='status','use status or send <queue>');
    const stored=world.getDynamicProperty(receiptKey);
    const receipt=stored===undefined?undefined:JSON.parse(stored);
    if(stored!==undefined)check(receipt?.v===1 && ['pending','delivered'].includes(receipt.phase) &&
        typeof receipt.queue==='string' && typeof receipt.id==='string','invalid dispatch receipt');
    const requested=match?.[1];
    if(receipt && requested)check(receipt.queue===requested,'one trial per checkpoint; already reserved '+receipt.queue);
    const queue=receipt?.queue??requested;
    const checkpoint=world.getDynamicProperty(prefix+'control');
    const control=JSON.parse(checkpoint??'null');
    check(control?.v===1 && control.phase==='committed' && Array.isArray(control.manifest),'committed handoff unavailable under this pack identity');
    const ids=world.getDynamicPropertyIds();
    check(!ids.some(k=>/^hartsorter:(queue_journal_v1$|journal_v1$|q[23])/.test(k)),'legacy journal or older queue present');
    const seen=new Set(), balances=new Map();
    let held=0,total=0,choice,chosenQuantity;
    for(const [key,meta,action,target,count] of control.manifest){
        check(/^q\d+$/.test(key)&&!seen.has(key),'invalid manifest queue '+key);
        seen.add(key);
        check(world.getDynamicProperty('hartsorter:q4m_'+key)===meta,'legacy metadata changed '+key);
        const scan=scanQueue(world,'hartsorter:',key,true);
        let result=scan.next();
        let slices=0;
        while(!result.done){
            if(++slices%8===0)await pause();
            result=scan.next();
        }
        const {entries,total:quantity}=result.value;
        check(entries.size===count,'definition count mismatch '+key);
        if(!quantity){check(action==='empty','invalid empty account');continue;}
        check(['hold','retain','transfer'].includes(action),'invalid account action');
        total+=quantity;
        if(action==='hold')held+=quantity;
        else{
            check(typeof target==='string','missing Receiver address');
            balances.set(target,(balances.get(target)??0)+quantity);
        }
        for(const [id,{raw,qty}] of entries){
            check(world.getDynamicProperty(prefix+'def_'+key+'_'+id)===raw &&
                world.getDynamicProperty(prefix+'qty_'+key+'_'+id)===qty,'staged record mismatch '+key+' '+id);
            if(key===queue && action!=='hold' && !choice && (!receipt || receipt.id===id) && ordinary(raw)){
                choice={queue:key,id,target,type:JSON.parse(raw).typeId};
                chosenQuantity=qty;
            }
        }
    }
    check(ids.filter(k=>k.startsWith('hartsorter:q4m_')).length===seen.size,'queue set changed');
    check(world.getDynamicProperty(prefix+'control')===checkpoint && world.getDynamicProperty(receiptKey)===stored,'checkpoint changed');
    let delivered=0;
    if(queue){
        check(choice,'no eligible plain material in selected Receiver contribution');
        if(receipt)check(receipt.target===choice.target && receipt.type===choice.type,'receipt identity mismatch');
        const [dim,x,y,z]=choice.target.split('|');
        const d=world.getDimension(dim),p={x:Number(x),y:Number(y),z:Number(z)};
        check(d.getBlock(p)?.typeId==='hartsorter:receiver','target Receiver unavailable '+choice.target);
        const barrel=d.getBlock({...p,y:p.y+1});
        check(barrel?.typeId==='minecraft:barrel','place a dedicated empty barrel directly above '+choice.target);
        const inv=barrel.getComponent('minecraft:inventory')?.container;
        check(inv?.size===27,'barrel unreadable');
        const item=makeItem(choice.type);
        check(item.amount===1 && item.typeId===choice.type && item.maxAmount>1,'cannot rebuild ordinary material');
        function verify(){
            const slot=inv.getItem(0);
            check(inv.emptySlotsCount===26 && slot?.amount===1 && slot.isStackableWith(item),'barrel evidence differs; keep receipt and inspect');
        }
        function record(phase){
            const raw=JSON.stringify({v:1,...choice,phase});
            world.setDynamicProperty(receiptKey,raw);
            check(world.getDynamicProperty(receiptKey)===raw,'dispatch receipt readback failed');
        }
        if(!receipt){
            check(inv.emptySlotsCount===27,'trial barrel must start empty');
            record('pending');
            inv.setItem(0,item);
        }
        verify(); // An uncertain prior write is never issued a second time.
        if(receipt?.phase!=='delivered')record('delivered');
        balances.set(choice.target,balances.get(choice.target)-1);
        delivered=1;
        report('barrel above '+choice.target+' contains 1 '+choice.type+' from '+queue);
    }
    for(const [target,remaining] of balances)report('target='+target+' remaining='+remaining);
    const receiver=[...balances.values()].reduce((a,b)=>a+b,0);
    check(Number.isSafeInteger(total)&&receiver+held+delivered===total,'custody mismatch');
    report('DISPATCH receiver='+receiver+' held='+held+' delivered='+delivered+' total='+total);
    return {choice, remaining:choice ? chosenQuantity-delivered : 0, receiver, held, delivered, total};
}
