/* No Bedrock runtime. Exercise ACTUAL PG08 JS with simulated forms/dynamic properties. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "candidates/pg08/menu_overlay.js"), "utf8");

function fixture() {
    const state = {
        collectors: [{id:"d|1|2|3",d:"d",x:1,y:2,z:3,present:true,link:"d|9|2|3"}],
        receivers: [{id:"d|9|2|3",d:"d",x:9,y:2,z:3,present:true},
                    {id:"d|8|2|3",d:"d",x:8,y:2,z:3,present:true}],
        nextQueue:2,
    };
    let saved = JSON.stringify(state);
    let failedWrites = 0;
    const logs = [];
    const block = (x) => ({dimension:{id:"d"},location:{x,y:2,z:3}});
    class Form {
        title(){return this} body(){return this} button(){return this}
        button1(){return this} button2(){return this}
        async show(player) {
            assert.ok(player.responses.length, "form requested with no mock response");
            return await player.responses.shift();
        }
    }
    const sandbox = {
        ActionFormData: Form, MessageFormData: Form,
        world:{getDynamicProperty:key => {
            assert.equal(key,"hartsorter:logistics_v2"); return saved;
        }},
        system:{currentTick:100},
        LOGISTICS_KEY:"hartsorter:logistics_v2",
        pendingCollectorByPlayer:new Map(),
        logistics:state,
        safeJsonParse:(value,fallback)=>{try{return JSON.parse(value)}catch{return fallback}},
        saveLogistics:()=>{
            if(failedWrites>0){failedWrites--;throw Error("mock rejected write")}
            saved=JSON.stringify(state);
        },
        findCollectorById:id=>state.collectors.find(x=>x.id===id),
        findReceiverById:id=>state.receivers.find(x=>x.id===id),
        collectorAt:e=>e.present ? block(e.x) : undefined,
        receiverAt:e=>e.present ? block(e.x) : undefined,
        logisticsId:(d,x,y,z)=>d+"|"+x+"|"+y+"|"+z,
        registerCollector:()=>{throw Error("unexpected new collector")},
        registerReceiver:()=>{throw Error("unexpected new receiver")},
        collectorStatus:()=>{},
        receiverStatus:()=>{},
        log:line=>logs.push(line),
    };
    vm.createContext(sandbox);
    vm.runInContext(source,sandbox,{filename:"menu_overlay.js"});
    const player = (id, ...responses) => ({id, messages:[],responses,
       sendMessage(m){this.messages.push(m)}});
    const flush = async () => {
        // A menu continuation and its finalizer each require a microtask turn.
        for(let i=0;i<12;i++) await Promise.resolve();
    };
    return {sandbox,state,collector:block(1),oldReceiver:block(9),newReceiver:block(8),
            player,flush,logs,get saved(){return JSON.parse(saved)},
            fail(n=1){failedWrites=n}};
}

async function run() {
    let n=0;
    {
        const f=fixture(),p=f.player("p",{selection:3});
        f.sandbox.selectCollector(p,f.collector);await f.flush();
        assert.equal(f.state.collectors[0].link,"d|9|2|3");
        assert.equal(f.sandbox.pendingCollectorByPlayer.size,0);
        n++;
    }
    {
        const f=fixture(),p=f.player("p",{selection:0},{selection:1});
        f.sandbox.selectCollector(p,f.collector);await f.flush();
        assert.equal(f.sandbox.pendingCollectorByPlayer.size,1);
        f.sandbox.useReceiver(p,f.newReceiver);await f.flush();
        assert.equal(f.state.collectors[0].link,"d|8|2|3");
        assert.equal(f.saved.collectors[0].link,"d|8|2|3");
        assert.equal(f.sandbox.pendingCollectorByPlayer.size,0);
        n++;
    }
    {
        const f=fixture(),p=f.player("p",{selection:0},{canceled:true});
        f.sandbox.selectCollector(p,f.collector);await f.flush();
        f.sandbox.useReceiver(p,f.newReceiver);await f.flush();
        assert.equal(f.saved.collectors[0].link,"d|9|2|3");
        assert.equal(f.sandbox.pendingCollectorByPlayer.size,0);
        n++;
    }
    {
        const f=fixture(),p=f.player("p",{selection:1},{selection:1});
        f.sandbox.selectCollector(p,f.collector);await f.flush();
        assert.equal(f.saved.collectors[0].link,null);
        n++;
    }
    {
        const f=fixture(),p=f.player("p",{selection:1},{selection:1});
        f.fail(1);
        f.sandbox.selectCollector(p,f.collector);await f.flush();
        assert.equal(f.state.collectors[0].link,"d|9|2|3");
        assert.equal(f.saved.collectors[0].link,"d|9|2|3");
        assert.ok(p.messages.some(x=>x.includes("refused")));
        n++;
    }
    {
        const f=fixture();
        f.fail(2);
        assert.equal(f.sandbox.pg08CommitLink("d|1|2|3","d|9|2|3",null),false);
        // Both initial write and rollback failed; do not permit further edits.
        assert.equal(f.sandbox.pg08CommitLink("d|1|2|3","d|9|2|3",null),false);
        assert.ok(f.logs.some(x=>x.includes("HELD")));
        n++;
    }
    {
        const f=fixture(),p=f.player("p",{selection:0},{selection:1});
        f.sandbox.selectCollector(p,f.collector);await f.flush();
        f.sandbox.system.currentTick=1301;
        f.sandbox.useReceiver(p,f.newReceiver);await f.flush();
        assert.equal(f.saved.collectors[0].link,"d|9|2|3");
        assert.equal(f.sandbox.pendingCollectorByPlayer.size,0);
        n++;
    }
    {
        const f=fixture(),p=f.player("p",{selection:0},{selection:1});
        f.sandbox.selectCollector(p,f.collector);await f.flush();
        f.state.collectors[0].link="d|8|2|3"; f.sandbox.saveLogistics();
        f.sandbox.useReceiver(p,f.oldReceiver);await f.flush();
        assert.equal(f.saved.collectors[0].link,"d|8|2|3");
        n++;
    }
    {
        const f=fixture(),p=f.player("p",{selection:0},{selection:1});
        f.sandbox.selectCollector(p,f.collector);await f.flush();
        f.state.receivers[1].present=false;
        f.sandbox.useReceiver(p,f.newReceiver);await f.flush();
        assert.equal(f.saved.collectors[0].link,"d|9|2|3");
        n++;
    }
    console.log("PG08 real candidate JS mock PASS:",n,"scenarios");
}
run().catch(err=>{console.error(err);process.exitCode=1});
