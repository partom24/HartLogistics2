// Q4 definitions originate from the 1.4.1 enqueue-time native round-trip check.
// Compare every stored field before allowing the acceptance runtime to debit it.
function canonical(value){
    if(Array.isArray(value))return value.map(canonical);
    if(value && typeof value==='object'){
        return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
    }
    return value;
}
export function restoreQueueItem(raw,{ItemStack,Potions,EnchantmentTypes}){
    const d=JSON.parse(raw);
    const s=d.potion
        ? Potions.resolve(Potions.getEffectType(d.potion.effect),Potions.getDeliveryType(d.potion.delivery))
        : new ItemStack(d.typeId,1);
    if(d.nameTag)s.nameTag=d.nameTag;
    if(d.lore.length)s.setLore(d.lore);
    if(d.canPlaceOn.length)s.setCanPlaceOn(d.canPlaceOn);
    if(d.canDestroy.length)s.setCanDestroy(d.canDestroy);
    const dur=s.getComponent('minecraft:durability');
    if(d.dur){
        dur.damage=d.dur.damage;
        if(!!dur.unbreakable!==d.dur.unbreakable)dur.unbreakable=d.dur.unbreakable;
    }
    const ec=s.getComponent('minecraft:enchantable');
    if(d.ench.length)ec.addEnchantments(d.ench.map(e=>({type:EnchantmentTypes.get(e.id),level:e.level})));
    const dye=s.getComponent('minecraft:dyeable');
    if(d.dye)dye.color=d.dye;
    for(const [k,v] of Object.entries(d.dyn??{}))s.setDynamicProperty(k,v);
    const potion=s.getComponent('minecraft:potion');
    const actual={
        typeId:s.typeId,nameTag:s.nameTag || undefined,lore:s.getLore(),
        ench:(ec?.getEnchantments()??[]).map(e=>({id:e.type.id,level:e.level})).sort((a,b)=>a.id.localeCompare(b.id)),
        canDestroy:s.getCanDestroy(),canPlaceOn:s.getCanPlaceOn(),
        dur:dur && {damage:dur.damage,unbreakable:!!dur.unbreakable},
        potion:potion && {effect:potion.potionEffectType?.id,delivery:potion.potionDeliveryType?.id},
        dye:dye?.color && {...dye.color}
    };
    // 1.4.1 only queried item dynamic properties where the API permitted it.
    if(s.maxAmount===1 || Object.keys(d.dyn??{}).length){
        actual.dyn=Object.fromEntries(s.getDynamicPropertyIds().map(k=>[k,s.getDynamicProperty(k)]));
    }else actual.dyn={};
    if(d.nameTag==='')actual.nameTag=s.nameTag??'';
    if(JSON.stringify(canonical(actual))!==JSON.stringify(canonical(d)))throw Error('Q4 readback differs for '+d.typeId);
    return s;
}
