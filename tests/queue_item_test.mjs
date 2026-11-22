import assert from 'node:assert/strict';
import {restoreQueueItem} from '../scripts/acceptance/queue-item.js';

class ItemStack {
    constructor(typeId){this.typeId=typeId;this.maxAmount=typeId==='minecraft:bow'?1:64;this.lore=[];this.components={};}
    getComponent(id){return this.components[id];}
    setLore(lines){this.lore=lines.slice();}
    getLore(){return this.lore;}
    getCanPlaceOn(){return [];}
    getCanDestroy(){return [];}
    getDynamicPropertyIds(){return [];}
}
class Bow extends ItemStack {
    constructor(id){
        super(id);
        this.components['minecraft:durability']={damage:0,unbreakable:false};
        let enchantments=[];
        this.components['minecraft:enchantable']={
            addEnchantments:v=>{enchantments=v;},getEnchantments:()=>enchantments
        };
    }
}
const base={typeId:'minecraft:bamboo',lore:[],ench:[],canDestroy:[],canPlaceOn:[],dyn:{}};
const restore=(d,api={ItemStack})=>restoreQueueItem(JSON.stringify(d),api);
assert.equal(restore(base).typeId,base.typeId);
assert.deepEqual(restore({...base,typeId:'minecraft:torch',lore:['Lighting']}).getLore(),['Lighting']);
const bow=restore({...base,typeId:'minecraft:bow',dur:{damage:307,unbreakable:false},ench:[{id:'power',level:2}]},
    {ItemStack:Bow,EnchantmentTypes:{get:id=>({id})}});
assert.equal(bow.getComponent('minecraft:durability').damage,307);
assert.equal(bow.getComponent('minecraft:enchantable').getEnchantments()[0].level,2);
const potion={...base,typeId:'minecraft:splash_potion',potion:{effect:'minecraft:fire_resistance',delivery:'ThrownSplash'}};
const potions={getEffectType:id=>({id}),getDeliveryType:id=>({id}),resolve(effect,delivery){
    const item=new ItemStack(potion.typeId);
    item.components['minecraft:potion']={potionEffectType:effect,potionDeliveryType:delivery};
    return item;
}};
assert.equal(restore(potion,{ItemStack,Potions:potions}).typeId,potion.typeId);
assert.throws(()=>restore(potion,{ItemStack,Potions:{...potions,getDeliveryType:()=>({id:'Drink'})}}),/readback/);
assert.throws(()=>restore({...base,unknown:true}),/readback/);
assert.throws(()=>restore({...base,lore:['retained']},{ItemStack:class extends ItemStack {setLore(){}}}),/readback/);
