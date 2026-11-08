/**
 * Conservative Q4 serialized-definition SHAPE gate for Q5 ordinary candidates.
 * OFFLINE only; cannot establish actual Bedrock stackability or metadata
 * fidelity. A passing shape still REQUIRES a separate live, version-specific
 * ItemStack roundtrip/stackability witness before any migration is considered.
 */
import {q5IdentityKey} from './q5_bucket_core.mjs';

const REQUIRED_ARRAYS = Object.freeze(['lore','ench','canDestroy','canPlaceOn']);
const OPTIONAL = new Set(['typeId','nameTag','lore','ench','canDestroy','canPlaceOn',
  'dyn','dur','dye','potion']);

// Known 1.4.1 q4 non-stackables or metadata-opaque vanilla items must not
// enter the Q5 ordinary count lane even when a serialized shape looks empty.
const NATIVE_OR_UNCERTAIN = new Set([
  'minecraft:minecart','minecraft:chest_minecart','minecraft:hopper_minecart',
  'minecraft:tnt_minecart','minecraft:command_block_minecart',
  'minecraft:bow','minecraft:crossbow','minecraft:shield',
  'minecraft:elytra','minecraft:trident','minecraft:spear',
  'minecraft:flint_and_steel','minecraft:shears','minecraft:fishing_rod',
  'minecraft:carrot_on_a_stick','minecraft:warped_fungus_on_a_stick',
  'minecraft:brush','minecraft:spyglass','minecraft:totem_of_undying',
  'minecraft:potion','minecraft:splash_potion','minecraft:lingering_potion',
  'minecraft:enchanted_book','minecraft:written_book','minecraft:writable_book',
  'minecraft:filled_map','minecraft:bundle','minecraft:goat_horn'
]);
const equipment = /^minecraft:[a-z]+_(?:sword|pickaxe|axe|shovel|hoe|helmet|chestplate|leggings|boots)$/;
const shulker = /^minecraft:(?:[a-z_]+_)?shulker_box$/;
const own = (o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const denied = reason=>({ok:false,status:'HOLD',reason,
  canMigrate:false,canStageWorld:false,canDebitQ4:false});

export function inspectQ4OrdinaryDefinitionShape(definition) {
  if (!definition || typeof definition !== 'object' ||
      Array.isArray(definition) ||
      (Object.getPrototypeOf(definition) !== Object.prototype &&
       Object.getPrototypeOf(definition) !== null)) return denied('invalid_q4_definition');
  for (const key of Object.keys(definition)) {
    if (!OPTIONAL.has(key)) return denied('unknown_serialized_metadata_field');
  }
  if (typeof definition.typeId !== 'string' ||
      !/^minecraft:[a-z0-9_]+$/.test(definition.typeId)) {
    return denied('unverified_item_type');
  }
  if (NATIVE_OR_UNCERTAIN.has(definition.typeId) ||
      equipment.test(definition.typeId) || shulker.test(definition.typeId)) {
    return denied('native_or_opaque_item_type');
  }
  for (const field of REQUIRED_ARRAYS) {
    if (!own(definition,field) || !Array.isArray(definition[field])) {
      return denied('incomplete_q4_ordinary_shape');
    }
    if (definition[field].length) return denied('serialized_item_metadata_present');
  }
  if (own(definition,'nameTag') && definition.nameTag !== '') {
    return denied('serialized_item_metadata_present');
  }
  for (const field of ['dur','dye','potion']) {
    if (own(definition,field)) return denied('serialized_item_metadata_present');
  }
  if (own(definition,'dyn')) {
    const dyn=definition.dyn;
    if (!dyn || typeof dyn !== 'object' || Array.isArray(dyn) ||
        (Object.getPrototypeOf(dyn) !== Object.prototype &&
         Object.getPrototypeOf(dyn) !== null)) {
      return denied('invalid_dynamic_property_shape');
    }
    if (Object.keys(dyn).length) return denied('serialized_item_metadata_present');
  }
  const key=q5IdentityKey(definition);
  if (key===null) return denied('unsafe_serialized_identity');
  return {ok:true,status:'ORDINARY_SHAPE_CANDIDATE_ONLY',key,
    requiresLiveStackabilityProof:true,requiresLiveRoundTripProof:true,
    canMigrate:false,canStageWorld:false,canDebitQ4:false};
}
