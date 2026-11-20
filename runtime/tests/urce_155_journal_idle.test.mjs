import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const main=readFileSync(resolve(ROOT,"addon/behavior_pack/scripts/main.js"),"utf8");
function section(a,b) {
 const start=main.indexOf(a),end=main.indexOf(b,start);
 assert.ok(start>=0&&end>start,"Expected exact main.js seam: "+a);
 return main.slice(start,end);
}
const liveGuard=section("const SORTER_JOURNAL_AUDIT_TICKS = 20;",
                        "\nfunction locKey(");
const writer=section("function saveJournal(tx) {",
                     "\n// Dimension handles represent permanent");
const scheduler=section("function schedulerTick() {",
                        "\n// Droppers/dispensers retain vanilla");
function fixture({initial=undefined}={}){
 let nativeReads=0,nativeWrites=0,failRead=false,failWrite=false,queueChecks=0;
 const state=new Map();
 if(initial!==undefined)state.set("hartsorter:journal_v1",initial);
 const world={
   getDynamicProperty(key){
     nativeReads++;
     if(failRead)throw Error("synthetic native read failed");
     return state.get(key);
   },
   setDynamicProperty(key,value){
     nativeWrites++;
     if(failWrite)throw Error("synthetic native write failed");
     if(value===undefined)state.delete(key);
     else state.set(key,value);
   }
 };
 const system={
   // A real Bedrock accessor call in the idle journal path would destroy
   // the CPU budget under the owner's native profiler.
   get currentTick(){throw Error("Unexpected native System.currentTick getter");}
 };
 const env=vm.runInNewContext(
  liveGuard+"\n"+writer+"\n"+scheduler+
    "\n({schedulerTick,saveJournal,sorterJournalPending,sorterJournalGate})",
  {
    world,system,
    JOURNAL_KEY:"hartsorter:journal_v1",
    ready:true,dirty:false,columns:[],
    getQueueJournal(){queueChecks++;return undefined;},
    rebuildTopology(){throw Error("idle topology cannot be rebuilt");}
  },
  {timeout:3000}
 );
 return {env,state,system,world,
   get reads(){return nativeReads;},
   get writes(){return nativeWrites;},
   get queueChecks(){return queueChecks;},
   set failRead(v){failRead=v;},
   set failWrite(v){failWrite=v;}
 };
}
const tick=(f,n)=>{f.env.schedulerTick();};

test("IDLE-J1 200 idle Sorter ticks need at most 11 native physical-journal reads",()=>{
 const f=fixture();
 for(let t=1;t<=200;t++)tick(f,t);
 assert.equal(f.reads,10,"One first read, then at 21,41,...,181");
 assert.equal(f.writes,0);
 assert.equal(f.queueChecks,200,"No queue-journal safety check may be removed");
});

test("IDLE-J2 an existing unresolved journal blocks immediately at startup",()=>{
 const f=fixture({initial:JSON.stringify({op:"physical_pending"})});
 tick(f,1);
 assert.equal(f.queueChecks,0);
 assert.equal(f.reads,1);
 assert.equal(f.env.sorterJournalPending(),true);
});

test("IDLE-J3 Hart's pending journal writes update the idle guard synchronously",()=>{
 const f=fixture();
 tick(f,1);
 f.env.saveJournal({op:"prepared",amount:3});
 assert.equal(f.state.has("hartsorter:journal_v1"),true);
 tick(f,2);
 assert.equal(f.queueChecks,1,"Pending journal must prevent the second queue audit");
 f.env.saveJournal(undefined);
 assert.equal(f.state.has("hartsorter:journal_v1"),false);
 tick(f,3);
 assert.equal(f.queueChecks,2);
 assert.equal(f.writes,2);
});

test("IDLE-J4 new physical transactions MUST re-read native persistence",()=>{
 const f=fixture();
 tick(f,1); // Cached clear.
 f.state.set("hartsorter:journal_v1","previous_unrecovered_transaction");
 const before=f.reads;
 assert.throws(()=>f.env.saveJournal({op:"new"}),/unresolved/);
 assert.equal(f.reads,before+1);
 assert.equal(f.writes,0);
 assert.equal(f.state.get("hartsorter:journal_v1"),
              "previous_unrecovered_transaction");
});

test("IDLE-J5 out-of-band pending journal is discovered at the next bounded audit",()=>{
 const f=fixture();
 tick(f,1);
 f.state.set("hartsorter:journal_v1","external_pending");
 for(let t=2;t<=20;t++)tick(f,t);
 assert.equal(f.queueChecks,20,
   "Idle scheduler's cached clear is never a transaction writer permission");
 tick(f,21);
 assert.equal(f.queueChecks,20,"At bounded expiry, native pending state blocks");
 assert.equal(f.reads,2);
});

test("IDLE-J6 native journal read failures mean HOLD, then retry next tick",()=>{
 const f=fixture();
 f.failRead=true;
 tick(f,1);
 assert.equal(f.queueChecks,0);
 assert.equal(f.env.sorterJournalGate.known,false);
 f.failRead=false;
 tick(f,2);
 assert.equal(f.queueChecks,1);
 assert.equal(f.reads,2);
});

test("IDLE-J7 failed journal write never certifies a safe empty state",()=>{
 const f=fixture();
 tick(f,1);
 f.failWrite=true;
 assert.throws(()=>f.env.saveJournal(undefined),/synthetic native write failed/);
 assert.equal(f.env.sorterJournalGate.known,false);
 assert.equal(f.env.sorterJournalGate.pending,true);
 f.failWrite=false;
 tick(f,2);
 assert.equal(f.env.sorterJournalGate.known,true);
 assert.equal(f.queueChecks,2);
});

test("IDLE-J8 scheduler and Receiver retain independent native journal checks",()=>{
 assert.match(main,/function logisticsTick\(\)[\s\S]*?if \(world\.getDynamicProperty\(JOURNAL_KEY\)\) return;/);
 assert.match(main,/function recoverJournal\(\)[\s\S]*?world\.getDynamicProperty\(JOURNAL_KEY\)/);
 assert.match(main,/function safeMovePartial\([\s\S]*?saveJournal\(tx\);[\s\S]*?saveJournal\(undefined\);/);
 assert.match(main,/function schedulerTick\(\)[\s\S]*?if \(sorterJournalPending\(\)\) return;/);
});


test("IDLE-J9 native System.currentTick must never be read by idle scheduler or journal writer",()=>{
 const f=fixture();
 for(let i=1;i<=200;i++)tick(f,i);
 f.env.saveJournal({op:"pending"});
 tick(f,201);
 f.env.saveJournal(undefined);
 tick(f,202);
 assert.equal(f.reads,11,"10 bounded idle reads and one fresh transaction preflight");
 assert.equal(f.writes,2);
});

test("IDLE-J10 inactive scheduler does not invent polling ticks",()=>{
 const f=fixture();
 tick(f,1);
 const before=f.env.sorterJournalGate.checkedPass;
 assert.equal(before,1);
 // Scheduler is scheduled each tick but does not advance the audit if
 // initial registry is not ready; the next active pass remains fail-closed.
 // Runtime implementation cannot see a fake world-absolute tick here.
 for(let i=0;i<100;i++)f.env.sorterJournalPending();
 assert.equal(f.env.sorterJournalGate.checkedPass,before);
 assert.equal(f.reads,1);
});
