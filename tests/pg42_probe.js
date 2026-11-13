// TEMP_TEST:PG42-CARRIER
// Isolated LAB42-only native entity spawn/slot/restart witness.
// NOT included in normal candidate builds. Deleted after BDS acceptance.
// The containing pack retains PG40 FORENSIC HOLD on all Hart gameplay writers.
const PG42_KEY='hartlogistics:pg42_native_test_v1';
const PG42_CARRIER='hartlogistics:uce_native_carrier';
const PG42_SAMPLE='PG42-NATIVE-PERSISTENCE';
const PG42_LORE='PG42 readback witness; fresh disposable world only';

function pg42Tell(source,message){
    try{
        if(source?.typeId==='minecraft:player'&&
           typeof source.sendMessage==='function')
            source.sendMessage('§6[HL2 PG42] §f'+message);
    }catch(_){}
}
function pg42UntrustedWorld(){
    // No command may spawn/write when *any* old UCE/Q4 custody evidence
    // exists. This is additional runtime fencing, not proof of world name.
    try{
        const keys=world.getDynamicPropertyIds();
        if(!Array.isArray(keys))return 'PROPERTIES_UNAVAILABLE';
        for(const key of keys){
            if(typeof key!=='string')return 'PROPERTY_ID_INVALID';
            if(key.startsWith('hartsorter:')||
               key.startsWith('hartlogistics:uce_'))
                return 'HISTORICAL_CUSTODY_PRESENT';
            if(key.startsWith('hartlogistics:pg42_')&&key!==PG42_KEY)
                return 'FOREIGN_LAB_MARKER';
        }
        return null;
    }catch(_){return 'PROPERTIES_UNREADABLE';}
}
function pg42Read(){
    try{
        const raw=world.getDynamicProperty(PG42_KEY);
        if(raw===undefined)return {ok:true,record:null};
        if(typeof raw!=='string'||raw.length>1200)
            return {ok:false,reason:'PROBE_RECORD_SHAPE'};
        const r=JSON.parse(raw);
        if(!r||r.schema!=='hl2-pg42-native-v1'||
           !['RESERVED','ACTIVE'].includes(r.state)||
           r.dimensionId!=='minecraft:overworld'||
           !r.location||!Number.isFinite(r.location.x)||
           !Number.isFinite(r.location.y)||
           !Number.isFinite(r.location.z)||
           (r.state==='ACTIVE'&&
             (typeof r.entityId!=='string'||!r.entityId)))
            return {ok:false,reason:'PROBE_RECORD_MISMATCH'};
        return {ok:true,record:r};
    }catch(_){return {ok:false,reason:'PROBE_RECORD_UNREADABLE'};}
}
function pg42Write(rec){
    try{
        const raw=JSON.stringify(rec);
        if(raw.length>1200)return false;
        world.setDynamicProperty(PG42_KEY,raw);
        return world.getDynamicProperty(PG42_KEY)===raw;
    }catch(_){return false;}
}
function pg42Inventory(entity){
    try{
        const component=entity.getComponent('minecraft:inventory');
        if(!component||component.inventorySize!==9||
           component.canBeSiphonedFrom!==false)
            return {ok:false,reason:'INVENTORY_COMPONENT_CONTRACT'};
        const c=component.container;
        if(!c||c.size!==9||
           typeof c.getItem!=='function')
            return {ok:false,reason:'INVENTORY_SLOTS_INVALID'};
        if(c.isValid===false)return {ok:false,reason:'INVENTORY_INVALID'};
        return {ok:true,container:c};
    }catch(_){return {ok:false,reason:'INVENTORY_UNREADABLE'};}
}
function pg42ReadSample(container){
    try{
        let occupied=0;
        for(let i=0;i<9;i++)
            if(container.getItem(i)!==undefined)occupied++;
        const first=container.getItem(0);
        if(!first)return {ok:false,reason:'SAMPLE_MISSING',occupied};
        if(first.typeId!=='minecraft:paper'||first.amount!==1||
           first.nameTag!==PG42_SAMPLE||
           JSON.stringify(first.getLore())!==JSON.stringify([PG42_LORE]))
            return {ok:false,reason:'SAMPLE_METADATA_CHANGED',occupied};
        if(occupied!==1)return {ok:false,reason:'UNEXPECTED_EXTRA_CONTENTS',occupied};
        return {ok:true,occupied};
    }catch(_){return {ok:false,reason:'SAMPLE_UNREADABLE'};}
}
function pg42Spawn(origin){
    const player=origin?.sourceEntity;
    if(player?.typeId!=='minecraft:player')return;
    const unsafe=pg42UntrustedWorld();
    if(unsafe){pg42Tell(player,'HOLD '+unsafe);return;}
    const initial=pg42Read();
    if(!initial.ok){pg42Tell(player,'HOLD '+initial.reason);return;}
    if(initial.record){
        pg42Tell(player,'HOLD existing '+initial.record.state+
          '; no duplicate spawn/retry');
        return;
    }
    let dim,place;
    try{
        if(player.dimension?.id!=='minecraft:overworld'){
            pg42Tell(player,'HOLD overworld player required');return;
        }
        dim=player.dimension;
        const at=player.location;
        place={x:at.x,y:at.y+1.25,z:at.z};
        const loaded=dim.getEntities({type:PG42_CARRIER,
            location:place,maxDistance:32});
        if(!Array.isArray(loaded)||loaded.length!==0){
            pg42Tell(player,'HOLD existing/unreadable carrier vicinity');return;
        }
    }catch(_){pg42Tell(player,'HOLD location/entity census unreadable');return;}
    const reserved={schema:'hl2-pg42-native-v1',state:'RESERVED',
        dimensionId:'minecraft:overworld',location:place};
    // Reservation is deliberately irreversible via this probe.
    if(!pg42Write(reserved)){
        pg42Tell(player,'HOLD reservation readback ambiguous');return;
    }
    let entity;
    try{entity=dim.spawnEntity(PG42_CARRIER,place);}
    catch(error){
        const allowed=['EntitySpawnError','InvalidArgumentError',
           'InvalidEntityError','LocationInUnloadedChunkError',
           'LocationOutOfWorldBoundariesError'];
        const reason=allowed.includes(error?.name)?error.name:'UNCLASSIFIED';
        pg42Tell(player,'HOLD spawn ambiguous ['+reason+']; RESERVED kept');
        return;
    }
    try{
        const same=dim.getEntities({type:PG42_CARRIER,
           location:place,maxDistance:0.75});
        if(!Array.isArray(same)||same.length!==1||
           same[0].id!==entity.id){
            pg42Tell(player,'HOLD spawn identity/uniqueness ambiguous');return;
        }
        const inv=pg42Inventory(entity);
        if(!inv.ok){pg42Tell(player,'HOLD '+inv.reason);return;}
        for(let i=0;i<9;i++){
            if(inv.container.getItem(i)!==undefined){
                pg42Tell(player,'HOLD nonempty fresh entity');return;
            }
        }
        const sample=new ItemStack('minecraft:paper',1);
        sample.nameTag=PG42_SAMPLE;
        sample.setLore([PG42_LORE]);
        inv.container.setItem(0,sample);
        const check=pg42ReadSample(inv.container);
        if(!check.ok){
            pg42Tell(player,'HOLD initial item witness '+check.reason);return;
        }
        if(!pg42Write({...reserved,state:'ACTIVE',entityId:entity.id})){
            pg42Tell(player,'HOLD ACTIVE readback ambiguous; no retry');return;
        }
        pg42Tell(player,'CREATED one carrier ID '+entity.id+
            '; native slots 9; item metadata verified; restart, then audit');
    }catch(_){pg42Tell(player,'HOLD post-spawn inspection ambiguous');}
}
function pg42Audit(origin){
    const player=origin?.sourceEntity;
    if(player?.typeId!=='minecraft:player')return;
    const unsafe=pg42UntrustedWorld();
    if(unsafe){pg42Tell(player,'HOLD '+unsafe);return;}
    const read=pg42Read();
    if(!read.ok){pg42Tell(player,'HOLD '+read.reason);return;}
    if(!read.record){pg42Tell(player,'NO PROBE: spawn has not run');return;}
    const rec=read.record;
    if(rec.state!=='ACTIVE'){
        pg42Tell(player,'HOLD '+rec.state+'; never respawn automatically');
        return;
    }
    try{
        if(player.dimension?.id!=='minecraft:overworld'){
            pg42Tell(player,'HOLD overworld required');return;
        }
        const dim=world.getDimension('minecraft:overworld');
        const matches=dim.getEntities({type:PG42_CARRIER,
            location:rec.location,maxDistance:0.75});
        if(!Array.isArray(matches)||matches.length!==1){
            pg42Tell(player,'HOLD expected one loaded carrier; found '+
                (Array.isArray(matches)?matches.length:'UNKNOWN'));return;
        }
        const e=matches[0];
        if(e.id!==rec.entityId){
            pg42Tell(player,'HOLD entity ID changed: saved '+rec.entityId+
                '; observed '+e.id);return;
        }
        const inv=pg42Inventory(e);
        if(!inv.ok){pg42Tell(player,'HOLD '+inv.reason);return;}
        const sample=pg42ReadSample(inv.container);
        if(!sample.ok){pg42Tell(player,'HOLD '+sample.reason);return;}
        pg42Tell(player,'PASS persisted carrier ID '+e.id+
            ' | slots 9 | occupied '+sample.occupied+
            ' | name/lore intact | no entity or item writes');
    }catch(_){pg42Tell(player,'HOLD audit unavailable/unloaded');}
}
system.beforeEvents.startup.subscribe(e=>{
    // Registration-only at startup. No spawn, item write or world property
    // change occurs until a GameDirector explicitly issues pg42_spawn.
    const register=(name,description,callback)=>{
        e.customCommandRegistry.registerCommand({
            name,description,
            permissionLevel:CommandPermissionLevel.GameDirectors,
            cheatsRequired:false
        },origin=>{system.run(()=>callback(origin));});
    };
    register('hartlogistics:pg42_spawn',
        'LAB42 one-off test carrier; fresh empty world only',pg42Spawn);
    register('hartlogistics:pg42_audit',
        'LAB42 read-only carrier/slot/restart evidence',pg42Audit);
});
