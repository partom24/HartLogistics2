import assert from 'node:assert/strict';
import {dispatchTrial} from '../behavior_pack/scripts/committedDispatch.js';
import {q4LabStep} from '../behavior_pack/scripts/q4Lab.js';

const seed=new Map(), stage='hartlab:handoff1_', target='minecraft:overworld|8|1|0';
q4LabStep({getDynamicProperty:k=>seed.get(k),setDynamicProperty:(k,v)=>seed.set(k,v)},'hartlab:r_o_0_1_0','seed');
const base=new Map(),manifest=[];
for(const [queue,action] of [['q1','transfer'],['q9','hold']]){
    for(const [k,v] of seed){
        if(!k.includes('q4lab_q4'))continue;
        base.set(k.replace('hartlab:q4lab_','hartsorter:').replace('r_o_0_1_0',queue),v);
        if(k.includes('q4d_')){
            const id=k.split('_').at(-1);
            base.set(stage+'def_'+queue+'_'+id,v);
            base.set(stage+'qty_'+queue+'_'+id,32);
        }
    }
    manifest.push([queue,base.get('hartsorter:q4m_'+queue),action,action==='hold'?null:target,1]);
}
base.set(stage+'control',JSON.stringify({v:1,phase:'committed',manifest}));
const item=typeId=>({typeId,amount:1,maxAmount:64,isStackableWith:b=>b.typeId===typeId});
function setup(){
    const disk=new Map(base);
    const state={slot:undefined,writes:0,kill:''};
    const inv={size:27,get emptySlotsCount(){return state.slot?26:27;},getItem:()=>state.slot,
        setItem(i,s){
            if(state.kill==='before inventory')throw Error('stop');
            state.slot=s;state.writes++;
            if(state.kill==='after inventory')throw Error('stop');
        }};
    async function run(command){
        const world={getDynamicProperty:k=>disk.get(k),getDynamicPropertyIds:()=>[...disk.keys()],
            setDynamicProperty(k,v){
                const phase=JSON.parse(v).phase;
                if(state.kill==='before '+phase)throw Error('stop');
                disk.set(k,v);
                if(state.kill==='after '+phase)throw Error('stop');
            },getDimension:()=>({getBlock:p=>p.y===1?{typeId:'hartsorter:receiver'}:
                {typeId:'minecraft:barrel',getComponent:()=>({container:inv})}})};
        const lines=[];
        await dispatchTrial(world,async()=>{},item,command,s=>lines.push(s));
        return lines.at(-1);
    }
    return {run,state,disk};
}
for(const kill of ['before pending','after pending','before inventory','after inventory','before delivered','after delivered','']){
    const {run,state}=setup();
    assert.match(await run('status'),/receiver=32 held=32 delivered=0 total=64/);
    state.kill=kill;
    if(kill)await assert.rejects(run('send q1'),/stop/);
    state.kill='';
    if(kill==='after pending'||kill==='before inventory'){
        await assert.rejects(run('send q1'),/barrel evidence/);
        assert.equal(state.writes,0);
        continue;
    }
    await run('send q1');
    assert.match(await run('status'),/receiver=31 held=32 delivered=1 total=64/);
    assert.match(await run('send q1'),/receiver=31 held=32 delivered=1 total=64/);
    assert.equal(state.writes,1);
    state.slot=undefined;
    await assert.rejects(run('send q1'),/barrel evidence/);
    assert.equal(state.writes,1);
}
const {run,disk,state}=setup();
await assert.rejects(run('send q9'),/no eligible/);
const def=[...disk.keys()].find(k=>k.startsWith(stage+'def_'));
disk.set(def,'{}');
await assert.rejects(run('send q1'),/mismatch/);
assert.equal(state.writes,0);
console.log('PASS controlled dispatch, write interruptions, restart/replay, missing evidence, held source and corrupt definitions');
