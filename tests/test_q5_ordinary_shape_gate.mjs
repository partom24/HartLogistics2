import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectQ4OrdinaryDefinitionShape} from
  '../candidates/transport/q5_ordinary_shape_gate.mjs';
const canonical=(id='minecraft:cobblestone',extra={})=>({
  typeId:id,lore:[],ench:[],canDestroy:[],canPlaceOn:[],dyn:{},...extra
});
const check=d=>inspectQ4OrdinaryDefinitionShape(d);
const hold=(r,reason)=>{
  assert.equal(r.ok,false);assert.equal(r.status,'HOLD');
  if(reason)assert.equal(r.reason,reason);
  assert.equal(r.canMigrate,false);
  assert.equal(r.canStageWorld,false);
  assert.equal(r.canDebitQ4,false);
};
test('pristine canonical Q4 ordinary shape is only a non-executable candidate',()=>{
  const def=canonical(),before=JSON.stringify(def);
  const result=check(def);
  assert.equal(result.ok,true);
  assert.equal(result.status,'ORDINARY_SHAPE_CANDIDATE_ONLY');
  assert.equal(result.requiresLiveStackabilityProof,true);
  assert.equal(result.requiresLiveRoundTripProof,true);
  assert.equal(result.canMigrate,false);
  assert.equal(JSON.stringify(def),before);
});
test('canonical plain stone, cobble and ingot definitions pass shape only',()=>{
  for(const id of ['minecraft:stone','minecraft:cobblestone','minecraft:gold_ingot']){
    const x=check(canonical(id));
    assert.equal(x.ok,true,id);
    assert.equal(x.canStageWorld,false);
  }
});
test('unknown or incomplete Q4 definitions never auto-reconstruct metadata',()=>{
  hold(check(null),'invalid_q4_definition');
  hold(check([]),'invalid_q4_definition');
  hold(check({typeId:'minecraft:stone'}),'incomplete_q4_ordinary_shape');
  for(const key of ['lore','ench','canDestroy','canPlaceOn']){
    const def=canonical();delete def[key];
    hold(check(def),'incomplete_q4_ordinary_shape');
  }
});
test('renamed items and all four nonempty serialized lists remain native/legacy',()=>{
  for(const [field,value] of [
    ['nameTag','My Sword'],['lore',['anvil note']],
    ['ench',[{id:'sharpness',level:2}]],
    ['canDestroy',['minecraft:stone']],['canPlaceOn',['minecraft:dirt']]
  ]){
    hold(check(canonical('minecraft:stone',{[field]:value})),
      'serialized_item_metadata_present');
  }
});
test('durability, dye, potion and nested dynamic properties never enter Q5 count buckets',()=>{
  for(const [field,value] of [
    ['dur',{damage:1,unbreakable:false}],
    ['dye',{red:1,green:2,blue:3}],
    ['potion',{effect:'speed',delivery:'drink'}],
    ['dyn',{owner:'abc'}]
  ]){
    hold(check(canonical('minecraft:stone',{[field]:value})),
      'serialized_item_metadata_present');
  }
});
test('metadata properties present as null are not assumed empty',()=>{
  for(const field of ['dur','dye','potion','nameTag']){
    hold(check(canonical('minecraft:stone',{[field]:null})),
      'serialized_item_metadata_present');
  }
});
test('dynamically typed metadata and forged collection shapes fail closed',()=>{
  for(const value of [null,[],false,0,'',Object.create({inherited:true})]){
    hold(check(canonical('minecraft:stone',{dyn:value})),
      'invalid_dynamic_property_shape');
  }
  for(const field of ['lore','ench','canDestroy','canPlaceOn']){
    hold(check(canonical('minecraft:stone',{[field]:{length:0}})),
      'incomplete_q4_ordinary_shape');
  }
});
test('unrecognized serialized fields cannot be silently ignored in identity',()=>{
  for(const extra of [{customDamage:0},{contents:[]},{metadata:null},{newComponent:undefined}]){
    hold(check(canonical('minecraft:stone',extra)),
      'unknown_serialized_metadata_field');
  }
});
test('modded, unnamespaced, uppercase and malformed types require separate review',()=>{
  for(const id of ['foo:stone','minecraftStone','Minecraft:Stone',
                   'minecraft:', 'minecraft:stone/path','minecraft:stone a',null]){
    hold(check(canonical(id)),'unverified_item_type');
  }
});
test('known fragile vanilla non-stackables stay out of ordinary item-count lane',()=>{
  for(const id of ['minecraft:enchanted_book','minecraft:written_book',
    'minecraft:potion','minecraft:splash_potion','minecraft:minecart',
    'minecraft:chest_minecart','minecraft:bow','minecraft:elytra',
    'minecraft:trident','minecraft:totem_of_undying']){
    hold(check(canonical(id)),'native_or_opaque_item_type');
  }
});
test('tools, armor and colored shulkers stay in native/uncertain lane',()=>{
  for(const id of [
    'minecraft:diamond_sword','minecraft:netherite_pickaxe',
    'minecraft:iron_chestplate','minecraft:leather_boots',
    'minecraft:shulker_box','minecraft:blue_shulker_box'
  ])hold(check(canonical(id)),'native_or_opaque_item_type');
});
test('an empty nameTag and absent optional dynamic property are safe as SHAPE only',()=>{
  const def=canonical('minecraft:stone',{nameTag:''});
  delete def.dyn;
  const r=check(def);
  assert.equal(r.ok,true);
  assert.equal(r.canMigrate,false);
});
test('unknown prototype, polluted raw JSON or caller function cannot bypass shape gate',()=>{
  hold(check(Object.create({typeId:'minecraft:stone'})),'invalid_q4_definition');
  const fake=JSON.parse('{"typeId":"minecraft:stone","lore":[],"ench":[],"canDestroy":[],"canPlaceOn":[],"__proto__":{"a":1}}');
  hold(check(fake),'unknown_serialized_metadata_field');
  hold(check(canonical('minecraft:stone',{bad:()=>1})),
    'unknown_serialized_metadata_field');
});
test('shape identity is stable under key permutation, never authorizes a Q5 debit',()=>{
  const a=canonical('minecraft:gold_ingot',{nameTag:''});
  const b={nameTag:'',canPlaceOn:[],dyn:{},ench:[],typeId:'minecraft:gold_ingot',
    canDestroy:[],lore:[]};
  const one=check(a),two=check(b);
  assert.equal(one.ok&&two.ok,true);
  assert.equal(one.key,two.key);
  assert.equal(one.canDebitQ4,false);
  assert.equal(two.canDebitQ4,false);
});
