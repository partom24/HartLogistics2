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


test('actual 30-command benchmark fixture builds exactly 1387 physical Sorters in 347 source-Hopper columns',()=>{
    const file=fs.readFileSync(new URL(
      '../candidates/uce/perf_flat_1387_commands.mcfunction',import.meta.url),'utf8');
    const cmds=file.split(/\r?\n/).map(s=>s.trim())
       .filter(s=>s&&!s.startsWith('#'));
    assert.equal(cmds.length,30);
    const world=new Map();
    const key=(x,y,z)=>x+','+y+','+z;
    const put=(x,y,z,id)=>{
        const p=key(x,y,z);
        if(id==='minecraft:air')world.delete(p);
        else world.set(p,id);
    };
    for(const cmd of cmds){
        const tokens=cmd.split(/\s+/);
        const name=tokens.shift();
        if(name==='tp')continue;
        if(name==='fill'){
            const [x0,y0,z0,x1,y1,z1]=tokens.slice(0,6).map(Number);
            assert.ok(x0<=x1&&y0<=y1&&z0<=z1);
            for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)
                for(let z=z0;z<=z1;z++)put(x,y,z,tokens[6]);
        }else if(name==='clone'){
            const [x0,y0,z0,x1,y1,z1,dx,dy,dz]=tokens.slice(0,9).map(Number);
            const snapshot=[];
            for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)
                for(let z=z0;z<=z1;z++){
                    snapshot.push([dx+x-x0,dy+y-y0,dz+z-z0,
                                  world.get(key(x,y,z))||'minecraft:air']);
                }
            for(const [x,y,z,id] of snapshot)put(x,y,z,id);
        }else if(name==='setblock'){
            const [x,y,z]=tokens.slice(0,3).map(Number);
            put(x,y,z,tokens[3]);
        }else assert.fail('Unsupported command '+name);
    }
    const count=[...world.values()].reduce((a,id)=>{
        a[id]=(a[id]||0)+1;return a;},{});
    assert.equal(count['hartsorter:sorter'],1387);
    assert.equal(count['minecraft:hopper'],347);
    let tall=0,short=0;
    for(let z=0;z<=34;z+=2)for(let x=0;x<=38;x+=2){
        if(z===34&&x>12)continue;
        const h=z===34&&x===12?3:4;
        for(let y=-59;y<-59+h;y++)
            assert.equal(world.get(key(x,y,z)),'hartsorter:sorter');
        assert.equal(world.get(key(x,-59+h,z)),'minecraft:hopper');
        if(h===3)short++;else tall++;
    }
    assert.equal(tall,346);assert.equal(short,1);
});
