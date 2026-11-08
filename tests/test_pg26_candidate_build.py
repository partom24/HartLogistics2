"""PG26 immutable predecessor, new original resources and bounded Sorter edit."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zlib

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("pg26_build",ROOT/"candidates/pg26/prepare_candidate.py")
pg=importlib.util.module_from_spec(spec);spec.loader.exec_module(pg)


def read_json(root,path):return json.loads((root/path).read_text(encoding="utf-8"))


class BuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.old=Path(cls.temp.name)/"pg25";cls.new=Path(cls.temp.name)/"pg26"
        pg.pg25.prepare(cls.old);pg.prepare(cls.new)
        cls.before=(cls.old/"behavior_pack/scripts/main.js").read_text()
        cls.after=(cls.new/"behavior_pack/scripts/main.js").read_text()

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def test_original_72_hashes_unchanged(self):
        self.assertEqual(pg.pg25.pg24.pg23.pg20.pg08.check_baseline(),72)

    def test_exact_new_footprint_and_only_declared_original_files_change(self):
        changed=set();added=set()
        for kind,count in (("behavior_pack",18),("resource_pack",59)):
            files={p.relative_to(self.new/kind) for p in (self.new/kind).rglob("*") if p.is_file()}
            old={p.relative_to(self.old/kind) for p in (self.old/kind).rglob("*") if p.is_file()}
            self.assertEqual(len(files),count);self.assertTrue(old<=files)
            added.update(f"{kind}/{p.as_posix()}" for p in files-old)
            changed.update(f"{kind}/{p.as_posix()}" for p in old
                           if (self.new/kind/p).read_bytes()!=(self.old/kind/p).read_bytes())
        self.assertEqual(added,{'behavior_pack/blocks/transporter.json','behavior_pack/loot_tables/blocks/transporter.json',
            'resource_pack/models/blocks/transporter.geo.json','resource_pack/textures/blocks/hartlogistics_transporter.png','resource_pack/blocks.json'})
        self.assertEqual(changed,{'behavior_pack/scripts/main.js','behavior_pack/manifest.json','resource_pack/manifest.json',
            'resource_pack/textures/terrain_texture.json','resource_pack/texts/en_US.lang'})

    def test_uuid_versions_dependencies_and_stable_api_unchanged(self):
        for kind in ('behavior_pack','resource_pack'):
            old=read_json(self.old,kind+'/manifest.json');new=read_json(self.new,kind+'/manifest.json')
            self.assertEqual(old['header']['uuid'],new['header']['uuid']);self.assertEqual(new['header']['version'],[1,5,9])
            self.assertEqual(old['header']['min_engine_version'],new['header']['min_engine_version'])
            self.assertEqual([m['uuid'] for m in old['modules']],[m['uuid'] for m in new['modules']])
            self.assertTrue(all(m['version']==[1,5,9] for m in new['modules']))
            self.assertEqual([d for d in old.get('dependencies',[]) if d.get('module_name')],
                             [d for d in new.get('dependencies',[]) if d.get('module_name')])
            self.assertTrue(all(d['version']==[1,5,9] for d in new.get('dependencies',[]) if d.get('uuid')))

    def test_atlas_and_language_preserve_original_entries(self):
        old=read_json(self.old,'resource_pack/textures/terrain_texture.json');new=read_json(self.new,'resource_pack/textures/terrain_texture.json')
        added=new['texture_data'].pop('hartlogistics_transporter')
        self.assertEqual(old,new);self.assertEqual(added,{'textures':'textures/blocks/hartlogistics_transporter'})
        old=(self.old/'resource_pack/texts/en_US.lang').read_text()
        new=(self.new/'resource_pack/texts/en_US.lang').read_text()
        self.assertTrue(new.startswith(old))

    def test_pipe_model_has_six_independent_narrow_arms_and_new_identifiers(self):
        block=read_json(self.new,'behavior_pack/blocks/transporter.json')['minecraft:block']
        self.assertEqual(block['description']['identifier'],'hartlogistics:transporter')
        models=read_json(self.new,'resource_pack/models/blocks/transporter.geo.json')['minecraft:geometry']
        self.assertEqual({m['description']['identifier'] for m in models},
            {'geometry.hartlogistics.transporter','geometry.hartlogistics.transporter_item'})
        bones={b['name']:b for b in models[0]['bones']}
        self.assertEqual(set(bones),{'core',*pg.assets.FACES})
        for bone in bones.values():
            for c in bone['cubes']:
                self.assertGreaterEqual(c['size'].count(4),2)
                for i,(lo,hi) in enumerate(((-8,8),(0,16),(-8,8))):
                    self.assertGreaterEqual(c['origin'][i],lo);self.assertLessEqual(c['origin'][i]+c['size'][i],hi)
        visible=block['components']['minecraft:geometry']['bone_visibility']
        for face in pg.assets.FACES:
            self.assertEqual(block['description']['states']['hartlogistics:connect_'+face],[False,True])
            self.assertEqual(visible[face],"q.block_state('hartlogistics:connect_"+face+"')")
        self.assertFalse(block['components']['minecraft:collision_box'])
        self.assertNotIn('minecraft:block_entity',block['components'])

    def test_dedicated_texture_not_copied_or_aliased_from_legacy(self):
        image=(self.new/'resource_pack/textures/blocks/hartlogistics_transporter.png').read_bytes()
        self.assertTrue(image.startswith(b'\x89PNG\r\n\x1a\n'));self.assertEqual(struct.unpack('>II',image[16:24]),(32,32))
        position=8;payload=b''
        while position<len(image):
            size=struct.unpack('>I',image[position:position+4])[0]
            kind=image[position+4:position+8];chunk=image[position+8:position+8+size]
            self.assertEqual(struct.unpack('>I',image[position+8+size:position+12+size])[0],zlib.crc32(kind+chunk))
            if kind==b'IDAT':payload+=chunk
            position+=size+12
        self.assertEqual(len(zlib.decompress(payload)),32*(1+32*4))
        old_hashes={hashlib.sha256(p.read_bytes()).digest() for p in (self.old/'resource_pack').rglob('*.png')}
        self.assertNotIn(hashlib.sha256(image).digest(),old_hashes)
        model=read_json(self.new,'behavior_pack/blocks/transporter.json')['minecraft:block']['components']
        self.assertEqual(model['minecraft:material_instances']['*']['texture'],'hartlogistics_transporter')

    def test_only_sorter_input_dispatch_changes_in_inherited_script(self):
        def remove_column(s):
            a=s.index('function processColumn(');b=s.index('\nfunction processCollectorIngress(',a)
            return s[:a]+s[b:]
        suffix='\n\n'+pg.OVERLAY.read_text().rstrip()+'\n'
        self.assertTrue(self.after.endswith(suffix))
        inherited=self.after[:-len(suffix)].replace('1.5.9-LAB-PG26','1.5.8-LAB-PG25')
        self.assertEqual(remove_column(inherited),remove_column(self.before))
        self.assertIn('slotInfo, want, pg26Transport',self.after)
        self.assertIn('if (pg26Transport) break; // No new virtual Q4 custody path.',self.after)

    def test_mismatched_source_or_second_writer_refused(self):
        with self.assertRaises(ValueError):pg.compile_patch(self.before.replace('1.5.8-LAB-PG25','wrong'),pg.OVERLAY.read_text())
        with self.assertRaises(ValueError):pg.compile_patch(self.before,pg.OVERLAY.read_text()+'\nsource.setItem(0,undefined);')
        with self.assertRaises(ValueError):pg.compile_patch(self.before,pg.OVERLAY.read_text().replace('PG26_MAX_PIPES = 16','PG26_MAX_PIPES = 999'))

    def test_deterministic_build_does_not_overwrite(self):
        with self.assertRaises(FileExistsError):pg.prepare(self.new)
        other=Path(self.temp.name)/'repeat';pg.prepare(other)
        def hashes(root):return {p.relative_to(root):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
        self.assertEqual(hashes(self.new),hashes(other))


if __name__=='__main__':unittest.main()
