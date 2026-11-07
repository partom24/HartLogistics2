// TEMP_TEST:PG03-05
// Standalone disposable LAB-only script. No commands, cheats or world block edits.
import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
const PROBE = "hlprobe:mr_container";
const ARM = "hlprobe:pg05_armed", BOOT = "hlprobe:boot";
const LABEL = "HL PG04 native metadata";
const busy = new Set();
let boot = 0;
function check(ok, message) { if (!ok) throw Error(message); }
function fp(stack) {
  return stack ? JSON.stringify({
    typeId: stack.typeId, amount: stack.amount,
    nameTag: stack.nameTag || "", lore: stack.getLore()
  }) : null;
}
function mr() {
  const item = new ItemStack("minecraft:iron_sword", 1);
  item.nameTag = LABEL;
  item.setLore(["Native ItemStack", "PG04 metadata fidelity"]);
  return item;
}
function at(a, dx) {
  return a.dimension.getBlock({ x:a.location.x+dx, y:a.location.y, z:a.location.z });
}
function rig(a) {
  const src = at(a,-1), b = at(a,1), dst = at(a,2);
  check(src && b && dst, "Rig coordinates not loaded");
  check(src.typeId==="minecraft:chest" && b.typeId===PROBE && dst.typeId==="minecraft:chest",
    "Requires Chest / Probe A / Probe B / Chest on X-1, X, X+1, X+2");
  const containers = [src,a,b,dst].map((block,i)=>{
    const comp=block.getComponent("minecraft:inventory");
    check(comp && comp.container, "PG03 native inventory unavailable, block "+i);
    return comp.container;
  });
  check(containers[1].size===9 && containers[2].size===9, "PG03 expected 9 native custom slots");
  return containers;
}
function empty(c,label) {
  for(let i=0;i<c.size;i++) check(!c.getItem(i),label+" has item in slot "+i);
}
function stamp(a) { return a.dimension.id+":"+a.location.x+":"+a.location.y+":"+a.location.z; }
function pass(p,id,msg){p.sendMessage("§a["+id+" PASS] "+msg);}
function check03(p,a){ rig(a); pass(p,"PG03","Both custom inventories expose 9 slots."); }
function check04(p,a){
  check(!world.getDynamicProperty(ARM),"PG05 already armed; verify before moving");
  const [src,A,B,dst]=rig(a);
  empty(src,"Input chest");empty(A,"Probe A");empty(B,"Probe B");empty(dst,"Output chest");
  const expected=fp(mr());
  src.setItem(0,mr());
  src.moveItem(0,0,A);
  check(!src.getItem(0)&&fp(A.getItem(0))===expected,"chest -> custom loss/change");
  A.moveItem(0,0,B);
  check(!A.getItem(0)&&fp(B.getItem(0))===expected,"custom -> custom loss/change");
  B.moveItem(0,0,dst);
  check(!B.getItem(0)&&fp(dst.getItem(0))===expected,"custom -> chest loss/change");
  const extra=dst.transferItem(0,A);
  check(!extra&&!dst.getItem(0)&&fp(A.getItem(0))===expected,
    "transferItem to custom lost metadata or had remainder");
  for(let i=0;i<B.size;i++) B.setItem(i,new ItemStack("minecraft:cobblestone",64));
  let remainder;
  try { remainder=A.transferItem(0,B); }
  catch(err) { check(fp(A.getItem(0))===expected,"blocked transfer lost item: "+err); }
  if(!A.getItem(0) && fp(remainder)===expected) A.setItem(0,remainder);
  check(fp(A.getItem(0))===expected,"full-target transfer failed to retain MR source");
  for(let i=0;i<B.size;i++){
    const s=B.getItem(i);
    check(s&&s.typeId==="minecraft:cobblestone"&&s.amount===64,"full target mutated");
  }
  for(let i=0;i<B.size;i++) B.setItem(i,undefined);
  pass(p,"PG04","Native moves, transferItem, and blocked destination preserve source.");
}
function arm05(p,a){
  const [src,A,B,dst]=rig(a),expected=fp(mr());
  empty(src,"Input chest");empty(B,"Probe B");empty(dst,"Output chest");
  check(fp(A.getItem(0))===expected,"PG04 must PASS first; expected MR in probe A slot 0");
  check(!world.getDynamicProperty(ARM),"Existing PG05 marker");
  world.setDynamicProperty(ARM,JSON.stringify({anchor:stamp(a),boot,expected}));
  p.sendMessage("§e[PG05 ARMED] Restart LAB BDS; revisit probe A and choose Verify.");
}
function verify05(p,a){
  const raw=world.getDynamicProperty(ARM);
  check(typeof raw==="string","No PG05 marker");
  const state=JSON.parse(raw);
  check(state.anchor===stamp(a),"Wrong probe anchor");
  check(boot>state.boot,"Must restart BDS after arming");
  const [src,A,B,dst]=rig(a);
  check(fp(A.getItem(0))===state.expected,"MR native ItemStack changed/lost after restart");
  empty(src,"Input chest");empty(B,"Probe B");empty(dst,"Output chest");
  world.setDynamicProperty(ARM,undefined);
  pass(p,"PG05","Native slot and metadata survived restart; no duplicates.");
}
function menu(p,a){
  if(busy.has(p.id))return;
  busy.add(p.id);
  const f=new ActionFormData().title("TEMP Hart PG03-05")
    .body("Do not enable experiments. Chest / Probe A / Probe B / Chest.")
    .button("PG03 - Check slots").button("PG04 - Native moves")
    .button("PG05 - Arm restart").button("PG05 - Verify after restart").button("Close");
  f.show(p).then(r=>{
    if(r.canceled)return;
    try {
      if(r.selection===0)check03(p,a);
      if(r.selection===1)check04(p,a);
      if(r.selection===2)arm05(p,a);
      if(r.selection===3)verify05(p,a);
    }catch(err){p.sendMessage("§c[PG03-05 NO-GO] "+String(err));}
  }).catch(err=>p.sendMessage("§c[MENU ERROR] "+String(err)))
    .finally(()=>busy.delete(p.id));
}
system.run(()=>{
  try {
    boot=Number(world.getDynamicProperty(BOOT)||0)+1;
    world.setDynamicProperty(BOOT,boot);
    console.warn("[HL TEMP PG03-05] Ready in LAB only; original pack not modified.");
  }catch(e){console.warn("[HL TEMP] boot marker failed: "+e);}
});
world.beforeEvents.playerInteractWithBlock.subscribe(e=>{
  if(e.block.typeId!==PROBE || e.player.isSneaking)return;
  e.cancel=true;
  const p=e.player,a=e.block;
  system.run(()=>menu(p,a));
});
