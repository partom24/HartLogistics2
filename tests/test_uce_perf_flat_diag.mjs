import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL(
    '../candidates/uce/runtime_perf_flat_diag.js',import.meta.url),'utf8');
function fixture({badHopper=false,nonempty=false,authority=false}={}){
    const messages=[];
    let writes=0,jobSlices=0;
    const dim={
        id:'minecraft:overworld',
        getBlock({x,y,z}){
            if(x%2||z%2||x<0||x>38||z<0||z>34||
               (z===34&&x>12))return undefined;
            const h=z===34&&x===12?3:4;
            if(y>=-59&&y<-59+h)return {typeId:'hartsorter:sorter'};
            if(y===-59+h)return {typeId:badHopper&&x===12&&z===34?
                'minecraft:air':'minecraft:hopper'};
            return undefined;
        }
    };
    const ctx={
        ready:true,registry:nonempty?[{x:0}]:[],
        logistics:{collectors:[],receivers:[]},dirty:false,
        uceLegacyWriterBlocked:()=>authority,
        REGISTRY_META_KEY:'hartsorter:registry_v2',
        SORTER_ID:'hartsorter:sorter',ucePipeTopologyEpoch:0,
        registryMeta:()=>undefined,
        world:{
            getDynamicPropertyIds:()=>[],
            getDynamicProperty:()=>undefined,
            getDimension:()=>dim
        },
        system:{runJob:g=>{
            for(const _ of g){
                if(++jobSlices>400)throw Error('Unbounded index scan');
            }
        }},
        saveRegistry:()=>{writes++;},
        log:m=>messages.push(m)
    };
    vm.runInNewContext(source,ctx);
    return {ctx,messages,
        run:()=>ctx.ucePerfFlatIndex({sourceEntity:{sendMessage:m=>messages.push(m)}}),
        counts:()=>({writes,jobSlices})};
}

test('full flat diagnostic registers exactly 1387 Sorters and 347 columns, one registry save',()=>{
    const f=fixture();
    f.run();
    assert.equal(f.ctx.registry.length,1387);
    assert.equal(f.counts().writes,1);
    assert.ok(f.counts().jobSlices>=80);
    assert.equal(f.ctx.dirty,true);
    const short=f.ctx.registry.filter(e=>e.x===12&&e.z===34);
    assert.equal(short.length,3);
    assert.ok(f.ctx.registry.every(e=>e.f===null&&e.m==='wildcard'));
    assert.match(f.messages.join(' '),/Registered 1387 Sorters/);
    f.run();
    assert.equal(f.counts().writes,1,'duplicate execution cannot append');
});
test('refuses unregistered missing Hopper without saving partial registry',()=>{
    const f=fixture({badHopper:true});f.run();
    assert.equal(f.counts().writes,0);
    assert.equal(f.ctx.registry.length,0);
    assert.match(f.messages.join(' '),/missing Hopper/);
});
test('refuses nonempty legacy world or UCE authority',()=>{
    for(const opts of [{nonempty:true},{authority:true}]){
        const f=fixture(opts);f.run();
        assert.equal(f.counts().writes,0);
        assert.match(f.messages.join(' '),/REFUSED/);
    }
});
test('refuses old persistent Q4 keys even when registry is empty',()=>{
    const f=fixture();
    f.ctx.world.getDynamicPropertyIds=()=>['hartsorter:q4p_hidden'];
    f.run();
    assert.equal(f.counts().writes,0);
    assert.match(f.messages.join(' '),/REFUSED/);
});
test('compiled 1.5 builder opts in flat diagnostic without changing frozen addon',()=>{
    const builder=fs.readFileSync(new URL(
        '../candidates/uce/prepare_candidate.py',import.meta.url),'utf8');
    assert.match(builder,/PERF_FLAT\.read_text/);
    assert.match(builder,/hartlogistics:diag_index_flat/);
    const old=fs.readFileSync(new URL(
        '../addon/behavior_pack/scripts/main.js',import.meta.url),'utf8');
    assert.doesNotMatch(old,/diag_index_flat/);
});
