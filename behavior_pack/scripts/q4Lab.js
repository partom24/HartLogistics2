// Explicit LAB commands only. No startup or tick subscriber. The 1.4.1
// namespace is read-only; each synthetic experiment has a separate namespace.
const BASE = 250000;
const seedBalance = 249984;
const definition = {typeId:'minecraft:oak_planks',lore:[],ench:[],canDestroy:[],canPlaceOn:[]};
const signature = JSON.stringify(definition);

function requireState(ok,message){
    if(!ok)throw Error(message);
}

// Same two-byte FNV-1a convention as the original queueDefinitionHash.
function definitionHash(raw){
    let h=0x811c9dc5;
    for(let i=0;i<raw.length;i++){
        const c=raw.charCodeAt(i);
        h=Math.imul(h^(c&255),0x01000193);
        h=Math.imul(h^(c>>>8),0x01000193);
    }
    return (h>>>0).toString(36);
}
const defId=definitionHash(signature);

function writeChecked(world,key,value){
    const raw=JSON.stringify(value);
    world.setDynamicProperty(key,raw);
    requireState(world.getDynamicProperty(key)===raw,'Write readback failed: '+key);
}
function readRaw(world,key){
    const raw=world.getDynamicProperty(key);
    requireState(typeof raw==='string','Missing or unreadable: '+key);
    return raw;
}

// Read only committed rows. Quantity totals and the *full* definition are
// checked independently of the compact row reference. No legacy repair calls.
function readQueue(world,prefix,key){
    const meta=JSON.parse(readRaw(world,prefix+'q4m_'+key));
    requireState(meta?.v===4 && ['h','t','n','q','r','d'].every(k=>
        Number.isSafeInteger(meta[k]) && meta[k]>=0) && meta.n>meta.t &&
        meta.r-meta.d===meta.q && meta.q<=BASE,'Invalid Q4 metadata or totals');
    const entries=new Map();
    if(!meta.q){
        requireState(!meta.h && !meta.t,'Invalid empty Q4 bounds');
        return {total:0,entries};
    }
    requireState(meta.h>0 && meta.t>=meta.h && meta.t-meta.h+1<=meta.q,'Invalid Q4 range');
    // This synchronous LAB reader handles only small queues. Larger queues
    // need a budgeted census before any production migration.
    requireState(meta.t-meta.h<256,'HOLD: queue exceeds the LAB census window');
    let total=0;
    for(let seq=meta.h;seq<=meta.t;){
        const page=Math.floor((seq-1)/64),start=(seq-1)%64;
        const [offset,rows]=JSON.parse(readRaw(world,prefix+'q4p_'+key+'_'+page));
        const count=Math.min(64-start,meta.t-seq+1);
        requireState(offset===start && Array.isArray(rows) && rows.length===count,'Invalid committed page '+page);
        for(const row of rows){
            requireState(Array.isArray(row) && row.length===2,'Invalid Q4 row');
            const [id,qty]=row;
            requireState(typeof id==='string' && /^[a-z0-9]+(?:_[0-9]+)?$/.test(id) &&
                Number.isSafeInteger(qty) && qty>0,'Invalid definition reference or quantity');
            if(!entries.has(id)){
                const raw=readRaw(world,prefix+'q4d_'+key+'_'+id);
                requireState(id.split('_')[0]===definitionHash(raw) && typeof JSON.parse(raw)?.typeId==='string','Invalid Q4 definition '+id);
                entries.set(id,{raw,qty:0});
            }
            entries.get(id).qty+=qty;
            total+=qty;
            requireState(total<=meta.q,'Q4 rows exceed committed quantity');
        }
        seq+=count;
    }
    requireState(total===meta.q,'Q4 rows differ from committed total');
    return {total,entries};
}

export function q4Census(world,queueKey){
    const ids=world.getDynamicPropertyIds().filter(id=>id.startsWith('hartsorter:'));
    const keys=ids.filter(id=>id.startsWith('hartsorter:q4m_')).map(id=>id.slice('hartsorter:q4m_'.length));
    const sidecars=ids.filter(id=>/^hartsorter:q[23]/.test(id)).length;
    const journals=ids.filter(id=>id==='hartsorter:queue_journal_v1' || id==='hartsorter:journal_v1').length;
    if(!queueKey)return 'Visible legacy keys='+ids.length+', Q4 Receivers='+keys.length+
        ', Q2/Q3 properties='+sidecars+', journal properties='+journals+
        (keys.length?' (first keys: '+keys.slice(0,5).join(', ')+')':' (legacy custody unknown)');
    requireState(keys.includes(queueKey),'Q4 metadata unavailable under this pack identity');
    const q=readQueue(world,'hartsorter:',queueKey);
    return 'Read-only Q4 '+queueKey+' committed='+q.total+', definitions='+q.entries.size+
        ', visible journal properties='+journals+', Q2/Q3 properties='+sidecars;
}

export function q4LabStep(world,receiver,action){
    requireState(/^hartlab:r_[one]_-?\d+_-?\d+_-?\d+$/.test(receiver),'Invalid Receiver key');
    requireState(['seed','prepare','commit','status'].includes(action),'Unknown action');
    receiver=receiver.slice('hartlab:'.length);
    const prefix='hartlab:q4lab_',control=prefix+'account_'+receiver;
    const meta={v:4,h:64,t:65,n:66,q:32,r:32,d:0};
    // Span a real 64-row page boundary; original definition bytes stay frozen.
    const fixture=[
        [prefix+'q4d_'+receiver+'_'+defId,definition],
        [prefix+'q4p_'+receiver+'_0',[63,[[defId,16]]]],
        [prefix+'q4p_'+receiver+'_1',[0,[[defId,16]]]],
        [prefix+'q4m_'+receiver,meta]
    ];
    if(world.getDynamicProperty(control)===undefined){
        requireState(action==='seed','No synthetic account. Run q4_seed first.');
        requireState(fixture.every(([key])=>world.getDynamicProperty(key)===undefined),'Orphan fixture shards');
        writeChecked(world,control,{v:1,receiver,phase:'initializing'});
    }
    let account=JSON.parse(readRaw(world,control));
    if(account?.phase==='initializing'){
        requireState(account.v===1 && account.receiver===receiver,'Disputed initialization');
        requireState(action==='seed','Initialization interrupted. Resume with q4_seed.');
        for(const [key,value] of fixture){
            const previous=world.getDynamicProperty(key);
            requireState(previous===undefined || previous===JSON.stringify(value),'Disputed fixture shard: '+key);
            if(previous===undefined)writeChecked(world,key,value);
        }
        account={v:1,receiver,phase:'seeded',sourceRemaining:meta.q,
            capacity:BASE,balance:{definition,amount:seedBalance},receipt:null};
        writeChecked(world,control,account);
    }
    const q=readQueue(world,prefix,receiver);
    requireState(q.entries.size===1 && q.entries.get(defId)?.raw===signature &&
        q.total===32 && fixture.every(([key,v])=>world.getDynamicProperty(key)===JSON.stringify(v)),
        'Disputed synthetic source evidence');
    const sourceMeta=JSON.parse(readRaw(world,prefix+'q4m_'+receiver));
    const receipt={source:receiver,head:sourceMeta.h,tail:sourceMeta.t,defId,quantity:q.total};
    const credited=account?.phase==='committed';
    requireState(account?.v===1 && account.receiver===receiver &&
        ['seeded','prepared','committed'].includes(account.phase) &&
        account.sourceRemaining===(credited?0:q.total) &&
        account.balance?.amount===seedBalance+(credited?q.total:0) &&
        JSON.stringify(account.balance.definition)===signature &&
        account.capacity===(account.phase==='seeded'?BASE:Math.max(BASE,seedBalance+q.total)) &&
        JSON.stringify(account.receipt)===JSON.stringify(account.phase==='seeded'?null:receipt),
        'Disputed Receiver control record');
    if(action==='prepare' && account.phase==='seeded'){
        account.capacity=Math.max(BASE,account.balance.amount+q.total);
        account.receipt=receipt;
        account.phase='prepared';
        writeChecked(world,control,account);
    }
    if(action==='commit'){
        requireState(account.phase!=='seeded','Prepare the transfer before committing');
        if(account.phase==='prepared'){
            // One persisted control record owns both balances. A rolled-back
            // commit still has the entire source balance and can be retried.
            account.balance.amount+=account.sourceRemaining;
            account.sourceRemaining=0;
            account.phase='committed';
            writeChecked(world,control,account);
        }
    }
    return receiver+' phase='+account.phase+' source='+account.sourceRemaining+' receiver='+account.balance.amount+
        ' capacity='+account.capacity+' total='+(account.sourceRemaining+account.balance.amount);
}
