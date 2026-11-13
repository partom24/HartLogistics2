"""HartLogistics2 original Bulk Storage block assets (non-experimental).

The crate-shaped model and amber/copper tile pattern are newly authored for
HL2. They share no block geometry, PNG or icon with 1.4.1 Sorter/Collector/
Receiver or with the PG26 pipe. No external file or font is imported.
"""
import json
import struct
import zlib

BULK_ID="hartlogistics:bulk_storage"
TEXTURE_ID="hartlogistics_bulk_storage"

def write_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,indent=2)+"\n",encoding="utf-8")

def texture_png():
    raw=bytearray()
    for y in range(32):
        raw.append(0)
        for x in range(32):
            # A new stamped storage case surface: dark steel outer bands,
            # recessed copper mesh, amber rivets and a distinct center glyph.
            dx=x%16;dy=y%16
            rgb=(86,55,33)
            if dx in (0,1,14,15) or dy in (0,1,14,15):
                rgb=(38,44,43)
            elif dx in (2,13) or dy in (2,13):
                rgb=(162,104,54)
            elif dx in (3,12) and dy in (3,12):
                rgb=(246,199,84)
            elif (dx+dy)%7==0:
                rgb=(112,75,38)
            elif dx in (6,7,8,9) and dy in (5,6,7,8,9,10):
                rgb=(225,171,63) if (dx+dy)%3 else (91,60,31)
            elif (dx*3+dy*5)%11<3:
                rgb=(121,80,42)
            raw.extend((*rgb,255))
    def chunk(kind,data):
        return (struct.pack(">I",len(data))+kind+data+
          struct.pack(">I",zlib.crc32(kind+data)))
    # 32×32 RGBA scanlines produce 4128 bytes, fitting one DEFLATE stored
    # block; deterministic across Linux/Windows with explicit Adler checksum.
    stream=(b"\x78\x01\x01"+struct.pack("<HH",len(raw),len(raw)^0xffff)+
      bytes(raw)+struct.pack(">I",zlib.adler32(raw)))
    return (b"\x89PNG\r\n\x1a\n"+
      chunk(b"IHDR",struct.pack(">IIBBBBB",32,32,8,6,0,0,0))+
      chunk(b"IDAT",stream)+chunk(b"IEND",b""))

def geometry():
    def bone(name,origin,size,uv):
        return {"name":name,"pivot":[0,8,0],"cubes":[
          {"origin":origin,"size":size,"uv":uv}]}
    bones=[
      bone("base",[-7,0,-7],[14,15,14],[0,0]),
      bone("top_rim",[-8,14,-8],[16,2,16],[0,0]),
      bone("foot_left",[-7,0,-7],[3,2,14],[0,0]),
      bone("foot_right",[4,0,-7],[3,2,14],[0,0]),
      bone("front_lock",[-3,5,-8],[6,5,1],[16,0])
    ]
    return {"format_version":"1.21.0","minecraft:geometry":[
      {"description":{"identifier":"geometry.hartlogistics.bulk_storage",
        "texture_width":32,"texture_height":32,
        "visible_bounds_width":2,"visible_bounds_height":2,
        "visible_bounds_offset":[0,0.5,0]},
       "bones":bones}]}

def add_bulk_assets(target):
    bp,rp=target/"behavior_pack",target/"resource_pack"
    mat={"*":{"texture":TEXTURE_ID,"render_method":"opaque"}}
    write_json(bp/"blocks/bulk_storage.json",{
      "format_version":"1.26.30",
      "minecraft:block":{
        "description":{"identifier":BULK_ID,
          "menu_category":{"category":"construction"}},
        "components":{
          "minecraft:display_name":"tile.hartlogistics:bulk_storage.name",
          "minecraft:geometry":"geometry.hartlogistics.bulk_storage",
          "minecraft:material_instances":mat,
          "minecraft:item_visual":{
            "geometry":"geometry.hartlogistics.bulk_storage",
            "material_instances":mat},
          "minecraft:collision_box":True,
          "minecraft:selection_box":True,
          # An inventory-owning bank must never silently drop its virtual
          # balance. Safe operator removal is a separate custody operation.
          "minecraft:destructible_by_mining":False,
          "minecraft:destructible_by_explosion":False,
          "minecraft:movable":{"movement_type":"immovable",
            "sticky":"none"},
          "minecraft:map_color":"#A87539",
          "hartlogistics:bulk_storage_surface":{}
        }}})
    # No block loot table while removal/evacuation has not been implemented.
    # The item remains placeable in Creative; survival recipe is added.
    write_json(bp/"recipes/bulk_storage.json",{
      "format_version":"1.21.0",
      "minecraft:recipe_shaped":{
        "description":{"identifier":"hartlogistics:bulk_storage_recipe"},
        "tags":["crafting_table"],
        # Recipes at format >=1.20.10 must specify discovery/unlock data.
        # A chest is already required in the recipe; no cheat/experiment.
        "unlock":[{"item":"minecraft:chest"}],
        "pattern":["III","ICI","IRI"],
        "key":{
          "I":{"item":"minecraft:iron_ingot"},
          "C":{"item":"minecraft:chest"},
          "R":{"item":"minecraft:redstone"}
        },
        "result":{"item":BULK_ID,"count":1}
      }})
    write_json(rp/"models/blocks/bulk_storage.geo.json",geometry())
    (rp/"textures/blocks/hartlogistics_bulk_storage.png").write_bytes(texture_png())
    blocks=rp/"blocks.json"
    data=json.loads(blocks.read_text(encoding="utf-8"))
    if BULK_ID in data:
        raise ValueError("UCE REFUSED duplicate Bulk block map")
    data[BULK_ID]={"sound":"metal"}
    write_json(blocks,data)
    atlas=rp/"textures/terrain_texture.json"
    terrain=json.loads(atlas.read_text(encoding="utf-8"))
    if TEXTURE_ID in terrain["texture_data"]:
        raise ValueError("UCE REFUSED duplicate Bulk texture")
    terrain["texture_data"][TEXTURE_ID]={
      "textures":"textures/blocks/hartlogistics_bulk_storage"}
    write_json(atlas,terrain)
    lang=rp/"texts/en_US.lang"
    text=lang.read_text(encoding="utf-8")
    if "tile.hartlogistics:bulk_storage.name" in text:
        raise ValueError("UCE REFUSED duplicate Bulk translation")
    lang.write_text(text.rstrip()+
      "\ntile.hartlogistics:bulk_storage.name=Hart Bulk Storage\n",
      encoding="utf-8")
