const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync(require.resolve('../behavior_pack/scripts/q4Lab.js'),'utf8').replace(/^export /gm,'');
const receiver='hartlab:r_n_-22_60_78';
function open(disk,stop,after){
    let count=0;
    const context=vm.createContext({});
    vm.runInContext(src,context);
    const world={
        getDynamicProperty:k=>disk.get(k),
        getDynamicPropertyIds:()=>[...disk.keys()],
        setDynamicProperty(k,v){
            count++;
            if(count===stop && !after)throw Error('interrupt');
            disk.set(k,v);
            if(count===stop && after)throw Error('interrupt');
        }
    };
    return {step:a=>context.q4LabStep(world,receiver,a),census:k=>context.q4Census(world,k)};
}
const actions=['seed','prepare','commit'];
const expected=['phase=seeded source=32 receiver=249984 capacity=250000','phase=prepared source=32 receiver=249984 capacity=250016','phase=committed source=0 receiver=250016 capacity=250016'];
for(const [index,action] of actions.entries()){
    for(let stop=1;stop<=(index===0?6:1);stop++)for(const after of [false,true]){
        const disk=new Map();
        for(const prev of actions.slice(0,index))open(disk).step(prev);
        assert.throws(()=>open(disk,stop,after).step(action),/interrupt/);
        for(const next of actions.slice(index))assert.ok(open(disk).step(next).includes(expected[actions.indexOf(next)]));
        const saved=[...disk];
        for(const replay of [...actions,'status'])assert.ok(open(disk).step(replay).includes(expected[2]));
        assert.deepEqual([...disk],saved);
    }
}
const disk=new Map();
open(disk).step('seed');
assert.throws(()=>open(disk).step('commit'),/Prepare/);
const legacy=new Map([...disk].filter(([k])=>!k.includes('account_')).map(([k,v])=>[k.replace('hartlab:q4lab_','hartsorter:'),v]));
assert.match(open(legacy).census('r_n_-22_60_78'),/committed=32, definitions=1/);
const page=[...legacy.keys()].find(k=>k.includes('q4p_'));
legacy.delete(page);
assert.throws(()=>open(legacy).census('r_n_-22_60_78'),/Missing/);
disk.delete([...disk.keys()].find(k=>k.includes('account_')));
assert.throws(()=>open(disk).step('seed'),/Orphan/);
console.log('PASS: restart before and after every fixture write, replay, capacity reservation, read-only census and corrupt-state holds');
