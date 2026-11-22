// Invoked by the normal Fresh mock with --q4-route, in its own process.
const assert=require('node:assert/strict');
const vm=require('node:vm');
module.exports=async function({bank,world,properties,place,dim,Stack,context,ticks,banks,event,drain,restart}){
    const {routeOne}=await import('../../scripts/legacy-census/route-trial.js');
    const {dispatchTrial}=await import('../../behavior_pack/scripts/committedDispatch.js');
    const {q4LabStep}=await import('../../behavior_pack/scripts/q4Lab.js');
    const b=bank(37,12,18,-1,0,4,1);
    banks.push(b);
    const [x,y,z]=b.rk.split('_').slice(-3).map(Number);
    const target=[dim.id,x,y,z].join('|');
    const barrel=place('minecraft:barrel',x,y+1,z).inv;
    const sorter=b.sorters.at(-1);
    const key='hartlab:s_o_'+Object.values(sorter.location).join('_');
    const config=JSON.parse(properties.get(key));
    config.f.match.typeId='minecraft:oak_planks';
    properties.set(key,JSON.stringify(config));
    const seed=new Map(), manifest=[];
    q4LabStep({getDynamicProperty:k=>seed.get(k),setDynamicProperty:(k,v)=>seed.set(k,v)},'hartlab:r_o_0_1_0','seed');
    for(const [q,action] of [['q2','transfer'],['q6','hold']]){
        for(const [k,value] of seed){
            if(!k.startsWith('hartlab:q4lab_q4'))continue;
            properties.set(k.replace('hartlab:q4lab_','hartsorter:').replace('r_o_0_1_0',q),value);
            if(k.includes('q4d_')){
                const id=k.split('_').at(-1);
                properties.set('hartlab:handoff1_def_'+q+'_'+id,value);
                properties.set('hartlab:handoff1_qty_'+q+'_'+id,32);
            }
        }
        manifest.push([q,properties.get('hartsorter:q4m_'+q),action,q==='q2'?target:null,1]);
    }
    properties.set('hartlab:handoff1_control',JSON.stringify({v:1,phase:'committed',manifest}));
    drain();event('hartlab:setup_io');drain();
    const pause=async()=>{}, make=id=>new Stack(id);
    await dispatchTrial(world,pause,make,'send q2',()=>{});
    const route=(ctx,identity=world)=>routeOne(identity,pause,make,'q2',(address,item,container)=>{
        const [dimension,xx,yy,zz]=address.split('|');
        ctx.intake={dimension,loc:{x:+xx,y:+yy,z:+zz},container};
        ctx.cargo=item;
        vm.runInContext(`(()=>{
            const key=keyFor('r',intake.dimension,intake.loc),b=labBanks[key];
            if(startupHold || !b || b.active || b.recovery || !labDiscover(b) ||
                !coverRoute(b) || !receiverAccepts(b) || labBuildIndex(b).missing)return;
            const target=labSelectTarget(b,cargo);
            if(target)labTryDispatch(b,key,intake,0,cargo,target);
        })()`,ctx);
    });
    await assert.rejects(route(context,{...world,getDynamicProperty:()=>undefined}),/Prior barrel/);
    const rc=dim.getBlock({x,y,z});
    rc.states['hartlogistics:powered']=true;
    assert.equal((await route(context)).routed,0);
    rc.states['hartlogistics:powered']=false;
    const checkpoint=new Map(properties);
    const first=b.hoppers[0].inv;
    const nativeAdd=first.addItem;
    first.addItem=function(item){nativeAdd.call(this,item);throw Error('interrupted after native write');};
    await assert.rejects(route(context),/Unresolved route receipt/);
    assert.equal(first.count(config.f.match.typeId),1);
    await assert.rejects(route(restart()),/Unresolved route receipt/);
    assert.equal(first.count(config.f.match.typeId),1);
    // Restore the entire offline fixture to the pre-fault branch.
    first.addItem=nativeAdd;first.slots.fill(undefined);
    properties.clear();for(const [k,v] of checkpoint)properties.set(k,v);
    const fresh=restart();
    const expected={receiver:30,held:32,barrel:1,routed:1,total:64};
    assert.deepEqual(await route(fresh),expected);
    ticks(96);
    const verify=()=>{
        assert.equal(b.chests.at(-1).count(config.f.match.typeId),1);
        assert.equal(barrel.count(config.f.match.typeId),1);
        assert.equal(b.hoppers.reduce((n,h)=>n+h.inv.count(config.f.match.typeId),0),0);
    };
    verify();
    assert.deepEqual(await route(restart()),expected);
    ticks(96);verify();
    console.log('PASS committed account through normal Hopper lane, original barrel receipt, held source, power, interrupted native write, fresh VM restart and replay');
};
