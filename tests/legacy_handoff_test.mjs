import assert from 'node:assert/strict';
import {mkdtempSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const dir=mkdtempSync(join(tmpdir(),'hart-handoff-'));
try{
    for(const name of ['handoff','trace','q4Lab','startup-custody']){
        const source=name==='q4Lab'?'behavior_pack/scripts':'scripts/legacy-census';
        copyFileSync(source+'/'+name+'.js',join(dir,name+'.js'));
    }
    for(const name of ['config-preview','topology','committedDispatch']){
        copyFileSync('behavior_pack/scripts/'+name+'.js',join(dir,name+'.js'));
    }
    copyFileSync('scripts/acceptance/upgrade.js',join(dir,'upgrade.js'));
    const {upgrade}=await import(pathToFileURL(join(dir,'upgrade.js')));
    const {handoff}=await import(pathToFileURL(join(dir,'handoff.js')));
    const {migrateCustody}=await import(pathToFileURL(join(dir,'startup-custody.js')));
    const {q4LabStep}=await import(pathToFileURL(join(dir,'q4Lab.js')));
    const source=new Map(),box={getDynamicProperty:k=>source.get(k),setDynamicProperty:(k,v)=>source.set(k,v)};
    q4LabStep(box,'hartlab:r_o_0_1_0','seed');
    const seed=new Map();
    const receivers=[0,1].map((x,i)=>({x,y:1,z:0,d:'overworld',id:'overworld|'+x+'|1|0',present:!i,queueKey:'q'+i}));
    for(const r of receivers)for(const [k,v] of source)if(k.includes('q4lab_q4'))
        seed.set(k.replace('hartlab:q4lab_','hartsorter:').replace('r_o_0_1_0',r.queueKey),v);
    const target={...receivers[0],x:8,id:'overworld|8|1|0',queueKey:'q8'};
    receivers.push(target);
    const collector={...receivers[0],x:1,y:0,id:'overworld|1|0|0',link:target.id};
    seed.set('hartsorter:logistics_v2',JSON.stringify({receivers,collectors:[collector]}));
    const system={runTimeout:fn=>queueMicrotask(fn)};
    const run=(disk,action,stop=Infinity,after=false)=>{
        let writes=0;const lines=[];
        const world={getDynamicProperty:k=>disk.get(k),getDynamicPropertyIds:()=>[...disk.keys()],
            getDimension:()=>({getBlock:p=>{
                if(p.y===1)return {typeId:'hartsorter:receiver'};
                if(p.y===0 && (p.x===0 || p.x===8))return {typeId:'minecraft:hopper',permutation:{getState:()=>5}};
                if(p.y===0 && p.x===1)return {typeId:'hartsorter:collector'};
                if(p.y===-1 && p.x===8)return {typeId:'hartsorter:sorter'};
                return {typeId:'minecraft:air'};
            }}),
            setDynamicProperty:(k,v)=>{
                writes++;
                if(writes===stop&&!after)throw Error('interrupt');
                disk.set(k,v);
                if(writes===stop&&after)throw Error('interrupt');
            }};
        const report=s=>lines.push(s);
        if(action==='upgrade')return upgrade(world,system,report);
        const operation=action==='startup'?migrateCustody(world,system,report):handoff(world,system,action,report);
        return operation.then(()=>({writes,last:lines.at(-1)}));
    };
    const prepared=new Map(seed);
    const preparation=await run(prepared,'prepare');
    const checkpoint=JSON.parse(prepared.get('hartlab:handoff1_control'));
    assert.ok(checkpoint.manifest.some(row=>row[2]==='transfer' && row[3]===target.id));
    assert.match(preparation.last,/prepared source=64 receiver=0 held=32 total=64/);
    for(const action of ['prepare','commit']){
        const max=action==='prepare'?preparation.writes:1;
        for(let n=1;n<=max;n++)for(const after of [false,true]){
            const disk=new Map(action==='prepare'?seed:prepared);
            await assert.rejects(run(disk,action,n,after),/interrupt/);
            await run(disk,action);
            assert.match((await run(disk,'commit')).last,/committed source=32 receiver=32 held=32 total=64/);
            assert.equal((await run(disk,'commit')).writes,0);
            assert.equal((await run(disk,'status')).writes,0);
            for(const [k,v] of seed)assert.equal(disk.get(k),v);
        }
    }
    const automatic=new Map(seed);
    assert.match((await run(automatic,'startup')).last,/committed source=32 receiver=32 held=32 total=64/);
    assert.equal((await run(automatic,'startup')).writes,0);
    for(let n=1;n<=preparation.writes+1;n++)for(const after of [false,true]){
        const interrupted=new Map(seed);
        await assert.rejects(run(interrupted,'startup',n,after),/interrupt/);
        assert.match((await run(interrupted,'startup')).last,/committed source=32 receiver=32 held=32 total=64/);
    }
    automatic.set('hartlab:dispatch_trial1','evidence');
    await assert.rejects(run(automatic,'startup'),/pre-rehearsal/);
    // Resume a settings HOLD after custody has already committed.
    const resumeDisk=new Map(prepared);
    await run(resumeDisk,'commit');
    resumeDisk.set('hartlab:upgrade_phase_v1','locked');
    const savedControl=resumeDisk.get('hartlab:handoff1_control');
    const filter={match:{typeId:'minecraft:sand'}};
    const cases=[
        [{m:'historical',f:filter},'filter'], [{m:0},'wildcard'],
        [{m:'',nativeQuarantine:1},'filter'], [{f:filter},'filter'],
        [{m:'auto',f:filter},'auto'], [{m:'bypass'},'bypass'],
        [{m:'filter'},'filter'], [{m:'wildcard',f:filter},'wildcard']
    ];
    const sorterRegistry=JSON.stringify(cases.map(([fields],x)=>({d:'overworld',x,y:2,z:0,...fields})));
    resumeDisk.set('hartsorter:registry_v1',sorterRegistry);
    const resumed=await run(resumeDisk,'upgrade');
    assert.equal(resumeDisk.get('hartlab:handoff1_control'),savedControl);
    assert.equal(resumeDisk.get('hartlab:upgrade_phase_v1'),'ready');
    assert.equal(resumeDisk.get('hartsorter:registry_v1'),sorterRegistry);
    assert.equal(resumed.totals.receiver,32);
    assert.equal(resumed.totals.sourceHeld,32);
    cases.forEach(([fields,m],x)=>assert.deepEqual(
        JSON.parse(resumeDisk.get('hartlab:s_o_'+x+'_2_0')),{d:'overworld',x,y:2,z:0,...fields,m}));
    const freshDisk=new Map(seed);
    freshDisk.set('hartsorter:registry_v1','[]');
    const migrated=await run(freshDisk,'upgrade');
    assert.equal(migrated.totals.total,64);
    assert.equal(migrated.totals.sourceHeld,32);
    assert.equal(migrated.totals.receiver,32);
    assert.equal(migrated.settings,3);
    assert.equal(migrated.totals.issued,0);
    assert.equal([...freshDisk.keys()].filter(k=>k.startsWith('hartlab:upgrade_spent_')).length,0);
    const suffix=[...freshDisk.keys()].find(k=>k.startsWith('hartlab:handoff1_qty_q0_')).split('qty_')[1];
    const debit='hartlab:upgrade_spent_'+suffix;
    freshDisk.set(debit,JSON.stringify({spent:1,pending:0}));
    const reboot=await run(freshDisk,'upgrade');
    assert.equal(reboot.totals.issued,1);
    assert.equal(reboot.totals.receiver,31);
    freshDisk.set(debit,JSON.stringify({spent:1,pending:1}));
    await assert.rejects(run(freshDisk,'upgrade'),/Unresolved earlier physical debit/);
    const def=[...prepared.keys()].find(k=>k.startsWith('hartlab:handoff1_def_'));
    prepared.set(def,'{}');
    await assert.rejects(run(prepared,'commit'),/disputed/);
    console.log('PASS legacy account preservation, all interrupted writes, restart, replay, held cargo and damaged definition');
}finally{rmSync(dir,{recursive:true,force:true});}
