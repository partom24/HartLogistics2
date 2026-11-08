"""Original procedural pipe resources. No legacy artwork is read or reused."""
import json
import struct
import zlib

PIPE = "hartlogistics:transporter"
FACES = ("north", "south", "east", "west", "up", "down")


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def texture_png():
    # Silver-blue drawn tube surface, seams and small cyan fasteners. This
    # 32x32 UV sheet is generated solely from these new geometric patterns.
    raw = bytearray()
    for y in range(32):
        raw.append(0)
        for x in range(32):
            shade = (x*7+y*3) % 9
            rgb = (92+shade, 122+shade, 143+shade)
            if x % 8 in (0, 7) or y % 8 in (0, 7): rgb = (35, 54, 72)
            elif x % 8 == 1 or y % 8 == 1: rgb = (178, 204, 219)
            if x % 8 in (2, 5) and y % 8 in (2, 5): rgb = (50, 206, 218)
            raw.extend((*rgb, 255))
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind+data))
    # A stored DEFLATE block keeps the generated PNG identical across Python/
    # zlib versions on Windows and Linux; checksum verification remains intact.
    stream = b"\x78\x01\x01" + struct.pack("<HH",len(raw),len(raw)^0xffff) + bytes(raw) + struct.pack(">I",zlib.adler32(raw))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB",32,32,8,6,0,0,0)) + chunk(b"IDAT",stream) + chunk(b"IEND",b"")


def geometry():
    cubes = {
        "core": ([-2,6,-2],[4,4,4]),
        "north": ([-2,6,-8],[4,4,6]), "south": ([-2,6,2],[4,4,6]),
        "east": ([2,6,-2],[6,4,4]), "west": ([-8,6,-2],[6,4,4]),
        "up": ([-2,10,-2],[4,6,4]), "down": ([-2,0,-2],[4,6,4])
    }
    def model(identifier, names):
        return {"description":{"identifier":identifier,"texture_width":32,"texture_height":32,
                "visible_bounds_width":2,"visible_bounds_height":2,"visible_bounds_offset":[0,0.5,0]},
                "bones":[{"name":name,"pivot":[0,8,0],"cubes":[{"origin":cubes[name][0],
                    "size":cubes[name][1],"uv":[0,0]}]} for name in names]}
    return {"format_version":"1.21.0","minecraft:geometry":[
        model("geometry.hartlogistics.transporter", ["core",*FACES]),
        model("geometry.hartlogistics.transporter_item", ["core","north","east","up"])]}


def add_assets(target):
    bp, rp = target/"behavior_pack", target/"resource_pack"
    material = {"*":{"texture":"hartlogistics_transporter","render_method":"opaque"}}
    write_json(bp/"blocks/transporter.json", {"format_version":"1.26.30","minecraft:block":{
        "description":{"identifier":PIPE,"menu_category":{"category":"construction"},
            "states":{"hartlogistics:connect_"+face:[False,True] for face in FACES}},
        "components":{
            "minecraft:display_name":"tile.hartlogistics:transporter.name",
            "minecraft:geometry":{"identifier":"geometry.hartlogistics.transporter",
                "bone_visibility":{f:"q.block_state('hartlogistics:connect_"+f+"')" for f in FACES}},
            "minecraft:material_instances":material,
            "minecraft:item_visual":{"geometry":"geometry.hartlogistics.transporter_item","material_instances":material},
            "minecraft:collision_box":False,"minecraft:selection_box":{"origin":[-8,0,-8],"size":[16,16,16]},
            "minecraft:destructible_by_mining":{"seconds_to_destroy":1.5},
            "minecraft:destructible_by_explosion":{"explosion_resistance":6},
            "minecraft:movable":{"movement_type":"immovable","sticky":"none"},
            "minecraft:loot":"loot_tables/blocks/transporter.json",
            "minecraft:map_color":"#5C7A8F",
            "minecraft:tick":{"interval_range":[10,10],"looping":True},
            "minecraft:redstone_consumer":{"min_power":0,"propagates_power":False},
            "hartlogistics:redstone_input":{},"hartlogistics:transporter_connections":{}}}})
    write_json(bp/"loot_tables/blocks/transporter.json",{"pools":[{"rolls":1,"entries":[{"type":"item","name":PIPE,"weight":1}]}]})
    write_json(rp/"models/blocks/transporter.geo.json", geometry())
    texture = rp/"textures/blocks/hartlogistics_transporter.png"
    texture.write_bytes(texture_png())
    write_json(rp/"blocks.json", {"format_version":[1,1,0],PIPE:{"sound":"metal"}})
    path = rp/"textures/terrain_texture.json"
    atlas = json.loads(path.read_text(encoding="utf-8"))
    if "hartlogistics_transporter" in atlas["texture_data"]:
        raise ValueError("PG26 REFUSED conflicting texture registration")
    atlas["texture_data"]["hartlogistics_transporter"] = {"textures":"textures/blocks/hartlogistics_transporter"}
    write_json(path, atlas)
    path = rp/"texts/en_US.lang"
    path.write_text(path.read_text(encoding="utf-8").rstrip()+"\ntile.hartlogistics:transporter.name=Hart Transporter\n",encoding="utf-8")
