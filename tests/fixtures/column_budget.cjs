const assert=require('node:assert/strict');
module.exports=function({world,dim,Container,bank,properties,event,drain,intervals,Stack}){
    let reads=0,slots=0,empty=0,dimensions=0;
    const resolve=world.getDimension;
    world.getDimension=function(id){dimensions++;return resolve.call(this,id);};
    const read=dim.getBlock;
    dim.getBlock=function(p){reads++;return read(p);};
    const get=Container.prototype.getItem;
    Container.prototype.getItem=function(i){slots++;return get.call(this,i);};
    const count=Object.getOwnPropertyDescriptor(Container.prototype,'emptySlotsCount').get;
    Object.defineProperty(Container.prototype,'emptySlotsCount',{get(){empty++;return count.call(this);}});
    const b=bank(120,65,87,-1,0,101,5);
    drain();event('hartlab:setup_io');drain();
    const heads=[20,40,60,80,100];
    const types=['cobblestone','dirt','gravel','stone','sand'].map(x=>'minecraft:'+x);
    for(const i of heads){
        const block=b.sorters[i*5];
        properties.set('hartlab:s_o_'+Object.values(block.location).join('_'),JSON.stringify({d:dim.id,...block.location,m:'filter',f:{match:{typeId:types[heads.indexOf(i)],enchIds:[]}}}));
    }
    event('hartlab:refresh');drain();
    function stepTick(t){
        for(const i of intervals)i.fn();
        if(t%8===0)for(let j=b.hoppers.length-2;j>=0;j--){
            const from=b.hoppers[j].inv,to=b.hoppers[j+1].inv;
            const slot=from.slots.findIndex(Boolean);
            if(slot<0)continue;
            const stack=from.slots[slot],unit=stack.clone();unit.amount=1;
            // Mock native motion is excluded from script counters.
            assert.equal(to.addItem(unit),undefined);if(--stack.amount===0)from.slots[slot]=undefined;
        }
        drain();
    }
    for(let t=1;t<=128;t++)stepTick(t);
    dimensions=reads=slots=empty=0;
    for(let t=1;t<=128;t++)stepTick(t);
    console.log('idle', {dimensions,reads,slots,empty});
    dimensions=reads=slots=empty=0;
    types.forEach((id,n)=>b.input.setItem(n,new Stack(id,20)));
    let ticks=0;
    const delivered=()=>heads.map((i,n)=>b.chests[i*5].count(types[n]));
    while(delivered().some(n=>n!==20)&&ticks<12000)stepTick(++ticks);
    assert.deepEqual(delivered(),[20,20,20,20,20]);
    console.log('five deliveries',{ticks,dimensions,reads,slots,empty,delivered:delivered()});

    dimensions=reads=slots=empty=0;
    for(let t=1;t<=1600;t++){
        if((t-1)%8===0 && t<=800){
            const n=Math.floor((t-1)/8)%5;
            assert.equal(b.hoppers[0].inv.addItem(new Stack(types[n],1)),undefined);
        }
        stepTick(t);
    }
    assert.deepEqual(delivered(),[40,40,40,40,40]);
    console.log('100 single inline items',{ticks:1600,dimensions,reads,slots,empty,additional:delivered().map(n=>n-20)});
};
