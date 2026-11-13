"""UCE integrated pack compilation and preservation tests (no server needed)."""
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location(
    "uce_builder",ROOT/"candidates/uce/prepare_candidate.py")
mod=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)

class UceBuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix="uce-source-test-")
        cls.path=Path(cls.tmp.name)/"build"
        mod.prepare(cls.path)
        cls.bp=cls.path/"behavior_pack"
        cls.rp=cls.path/"resource_pack"
        cls.main=(cls.bp/"scripts/main.js").read_text(encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_original_baseline_unmodified(self):
        protected=ROOT/"addon/behavior_pack/scripts/main.js"
        self.assertIn('const VERSION = "1.4.1";',
                      protected.read_text(encoding="utf-8"))
        self.assertIn('const VERSION = "1.5.16-DEV-UCE";',self.main)

    def test_manifest_ids_and_no_experiment_changes(self):
        old=json.loads((ROOT/"addon/behavior_pack/manifest.json").read_text())
        bp=json.loads((self.bp/"manifest.json").read_text())
        rp=json.loads((self.rp/"manifest.json").read_text())
        self.assertEqual(bp["header"]["uuid"],old["header"]["uuid"])
        self.assertEqual(bp["header"]["version"],[1,5,16])
        self.assertEqual(rp["header"]["version"],[1,5,16])
        # BP-to-RP dependency version follows the upgraded pack pair; UUID
        # remains original so a saved world does not register a new addon.
        old_packs={d["uuid"] for d in old["dependencies"] if "uuid" in d}
        new_packs={d["uuid"] for d in bp["dependencies"] if "uuid" in d}
        self.assertEqual(old_packs,new_packs)
        for dep in bp["dependencies"]:
            if "uuid" in dep:self.assertEqual(dep["version"],[1,5,16])
        entity=json.loads((self.bp/"entities/uce_native_carrier.json").read_text())
        self.assertFalse(entity["minecraft:entity"]["description"]["is_experimental"])
        self.assertTrue((self.path/"NOT_APPROVED_FOR_INSTALL.txt").exists())

    def test_bds_12663_native_carrier_schema_and_bulk_recipe_unlock(self):
        # PG40 BDS log: minecraft:pushable no longer parses in 1.26.10.
        # Avoid the removed component instead of changing world identities,
        # protected inventory slots, or enabling experiments.
        raw=json.loads((self.bp/"entities/uce_native_carrier.json").read_text())
        self.assertEqual(raw["format_version"],"1.26.10")
        entity=raw["minecraft:entity"]
        self.assertEqual(entity["description"]["identifier"],
                         "hartlogistics:uce_native_carrier")
        components=entity["components"]
        self.assertNotIn("minecraft:pushable",components)
        self.assertNotIn("minecraft:pushable_by_block",components)
        self.assertNotIn("minecraft:pushable_by_entity",components)
        self.assertEqual(components["minecraft:inventory"]["inventory_size"],9)
        self.assertIs(components["minecraft:inventory"]["can_be_siphoned_from"],False)
        self.assertIn("minecraft:persistent",components)
        self.assertIs(components["minecraft:physics"]["has_gravity"],False)
        self.assertIs(components["minecraft:physics"]["has_collision"],False)
        self.assertIn("minecraft:damage_sensor",components)
        recipe=json.loads((self.bp/"recipes/bulk_storage.json").read_text())
        shaped=recipe["minecraft:recipe_shaped"]
        self.assertEqual(recipe["format_version"],"1.21.0")
        self.assertEqual(shaped["unlock"],[{"item":"minecraft:chest"}])
        self.assertEqual(shaped["pattern"],["III","ICI","IRI"])
        self.assertEqual(shaped["result"],
                         {"item":"hartlogistics:bulk_storage","count":1})

    def test_js_import_graph_pinned_to_copied_modules(self):
        import re
        root=self.bp/"scripts"
        entry=root/"main.js"
        seen=set()
        pending=[entry]
        while pending:
            p=pending.pop()
            if p in seen:continue
            seen.add(p)
            body=p.read_text(encoding="utf-8")
            for match in re.findall(r'from ["\'](\.[^"\']+)["\']',body):
                child=(p.parent/match).resolve()
                self.assertTrue(child.is_relative_to(root.resolve()))
                self.assertTrue(child.is_file(),(p,match))
                pending.append(child)
        self.assertEqual(
            {x.name for x in (root/"uce").iterdir()},
            {name+".js" for name in mod.MODULES}
        )
        self.assertGreaterEqual(len(seen),4)

    def test_legacy_core_writers_and_original_scheduler_fenced(self):
        s=self.main
        for name in (
          "safeMovePartial","enqueueFromSource","enqueueFromEjectedEntity",
          "dequeueToReceiver","pg20MoveOpaqueNative","pg23CompactSourceHopper",
          "pg24VerifyEjectedCommit",
          "registerCollector","registerReceiver",
          "markLogisticsAbsent","allocateQueueKey",
          "selectCollector","useReceiver",
          "loadReceiverQueue","recoverJournal","recoverQueueJournal",
          "flushLogistics"):
            start=s.index("function "+name+"(")
            brace=s.find("{",start)
            self.assertLess(brace-start,400,name)
            self.assertIn("if (uceLegacyWriterBlocked())",
                          s[brace:brace+165],name)
        self.assertIn(
          "if (uceLegacyWriterBlocked()) { uceUnifiedServiceTick(); return; }",s)
        self.assertIn("if (uceLegacyWriterBlocked()) return;",s)
        self.assertIn("UCE_LEGACY_WORLD_WRITER_FENCED",s)
        self.assertIn("if (uceLegacyWriterBlocked()) { uceSendDiagnostics(origin); return; }",s)
        self.assertIn("function uceSendDiagnostics(origin)",s)
        self.assertIn("function uceSendMigrationPreview(origin)",s)
        self.assertIn("hartlogistics:migration_preview",s)
        self.assertIn("hartlogistics:activate_empty_lab",s)
        self.assertIn("function uceActivateEmptyLabWorld(origin)",s)
        self.assertIn("activateUnifiedEmptyWorld({",s)
        self.assertIn("previewUnifiedMigrationPreflight({world})",s)
        # Original physical native-frame filter configuration stays operable
        # and cannot accidentally become a second Q4 item storage writer.
        for name in ("setFilter","giveOrDrop","syncDisplay",
                     "plantEmptyNativeFrame","eraseOwnedFrame"):
            start=s.index("function "+name+"(")
            brace=s.find("{",start)
            self.assertNotIn("if (uceLegacyWriterBlocked())",
                             s[brace:brace+165],name)
        self.assertIn("uceSelectCollectorForLink(ev.player,ev.block); return;",s)
        self.assertIn("uceRegisterNewReceiver(ev.player,ev.block); return;",s)
        self.assertIn("if (uceLegacyWriterBlocked()) uceHydrateNewReceivers();",s)
        self.assertIn("function uceOrdinaryAccountSource(authority,ownerId)",s)
        self.assertIn("function uceRegisterNewReceiver(player,block)",s)
        self.assertIn("function uceHydrateNewReceivers()",s)
        self.assertIn("UCE owns this block. Remove through an explicit drained custody operation",s)
        self.assertIn("block.typeId === RECEIVER_ID || block.typeId === COLLECTOR_ID ||",s)
        self.assertIn("block.typeId === 'hartlogistics:bulk_storage'",s)

    def test_one_unified_scheduler_serves_mr_and_ordinary(self):
        s=self.main
        self.assertIn('function uceUnifiedServiceTick(){',s)
        self.assertIn('    uceMrServiceTick(authority);',s)
        self.assertIn('const committed=uceOrdinaryServiceTick(authority);',s)
        self.assertIn('    uceSorterDirectServiceTick(authority);',s)
        self.assertIn('function uceSorterDirectServiceTick(authority)',s)
        self.assertIn('function uceProcessEjectedItemEntity(entity,retries=0,spawnLoc=undefined)',s)
        self.assertIn("port.stageEjectedItem({",s)
        self.assertIn("port.ackEjectedItem({",s)
        self.assertIn("uceProcessEjectedItemEntity(ev.entity,0,spawnLoc); return;",s)
        self.assertIn('port.moveWhole({operationId,from,to})',s)
        self.assertIn('port.ackWhole({operationId,from,to})',s)
        self.assertIn("global custody HOLD: journal unreadable",s)
        self.assertIn("if(uceUnifiedJournalHold())return;",s)
        self.assertEqual(s.count("if(uceUnifiedJournalHold())return;"),5)
        # Three coordinated scheduler gates plus the existing entity-event
        # ingress gate; all share one native and legacy journal authority.
        self.assertIn("hartsorter:queue_journal_v1",s)
        self.assertIn('executeUnifiedOrdinaryDeposit(args)',s)
        self.assertIn('executeUnifiedOrdinaryWithdrawal({...args,',s)
        self.assertIn('partialOutput:selectedRoute?.partialOutput===true',s)
        self.assertIn('port.moveCertifiedPartial(',s)
        self.assertEqual(s.count('function logisticsTick() {'),1)

    def test_bulk_block_and_same_scheduler_integration(self):
        bp=self.bp
        definition=json.loads((bp/"blocks/bulk_storage.json").read_text())
        components=definition["minecraft:block"]["components"]
        self.assertFalse(components["minecraft:destructible_by_mining"])
        self.assertFalse(components["minecraft:destructible_by_explosion"])
        self.assertIn("hartlogistics:bulk_storage_surface",components)
        self.assertTrue((bp/"recipes/bulk_storage.json").is_file())
        self.assertTrue((self.rp/"textures/blocks/hartlogistics_bulk_storage.png").is_file())
        self.assertIn("uceRegisterBulkComponent(event.blockComponentRegistry)",self.main)
        self.assertIn("function ucePipeRouteNetwork(receiver)",self.main)
        self.assertIn("function uceReadOnlyPipeInput(block,root)",self.main)
        self.assertIn("function ucePipeSourceStillConnected(receiver,source)",self.main)
        self.assertIn("const pipeNetwork=ucePipeRouteNetwork(receiver);",self.main)
        self.assertIn("ucePipeSourceStillConnected(receiver,src)",self.main)
        self.assertIn("uceSorterCollectorSources(receiver)",self.main)
        self.assertIn("source.eligibleSlot(i,item)",self.main)
        self.assertIn("sourceRecord.stillSelected(sorterWitness)",self.main)
        self.assertIn("uceSorterSourceStillValid(",self.main)
        self.assertIn("source.stillSelected(witness)",self.main)
        self.assertIn("if(dirty)rebuildTopology();",self.main)
        self.assertIn("for(let op=0;op<4;op++)",self.main)
        self.assertIn("if(committed!==true)break;",self.main)
        self.assertIn("return changed.ok===true;",self.main)
        self.assertIn("return result.ok===true;",self.main)
        self.assertIn("sourceRecord={...input,kind:'pipe',locked:false};",self.main)
        self.assertIn("network.leaderId!==receiver.id)return false;",self.main)
        self.assertIn("pipe?.leaderId===receiver.id?",self.main)
        self.assertIn("pipeNetwork?.leaderId===receiver.id?",self.main)
        self.assertIn("!uceOrdinaryAccountSource(authority,receiver.id)",self.main)
        self.assertIn("!uceOrdinaryAccountSource(authority,id)",self.main)
        self.assertIn("if(sourceRecord.kind==='pipe')",self.main)
        self.assertIn("preferredOutputKeys:preferredKeys",self.main)
        self.assertIn("preferredOutputReady=preferredKeys.length>0;",self.main)
        self.assertIn("!preferredOutputReady",self.main)
        self.assertIn("uceChoosePipeDestination(receiver,item,",self.main)
        self.assertIn("ucePipeDestinationStillValid(",self.main)
        self.assertIn("planUnifiedBulkService(",self.main)
        self.assertIn("function uceBulkWildcardPermitted(",self.main)
        self.assertIn("uceBulkWildcardPermitted(ledger.snapshot,ownerId,",self.main)
        self.assertIn("const onlyPreferred=!wildcardPermitted;",self.main)
        self.assertIn("registerBulkMember(",self.main)
        self.assertIn("shardWriter.applyInternalTransfer(",self.main)
        self.assertIn("verifyInternalRoute:tx=>",self.main)
        self.assertIn("executeUnifiedOrdinaryWithdrawal({...args,",self.main)
        self.assertIn("partialOutput:selectedRoute?.partialOutput===true",self.main)
        self.assertIn("port.moveCertifiedPartial(",self.main)
        self.assertIn("serviceUnifiedReceiverMR({",self.main)
        self.assertIn("createUnifiedLinkRegistry({world",self.main)
        self.assertIn("function uceSelectCollectorForLink(player,block)",self.main)
        self.assertIn("function uceUseReceiverLinkOrStatus(player,block)",self.main)
        self.assertIn("uceAllowsSorterRegistryWrite(key)",self.main)


    def test_no_automatic_authority_install_or_second_bridge_writer(self):
        bridge=(ROOT/"candidates/uce/runtime_bridge.js").read_text()
        for forbidden in ("world.setDynamicProperty(","setItem(","moveItem(",
                          "saveQueueJournal("):
            self.assertNotIn(forbidden,bridge)
        self.assertNotIn("setDynamicProperty(UCE_MAIN_AUTHORITY",self.main)
        self.assertIn("Q4 cold cutover",(
          self.path/"NOT_APPROVED_FOR_INSTALL.txt").read_text())

    def test_node_full_pack_script_syntax(self):
        result=subprocess.run(["node","--check","--input-type=module"],
            input=self.main,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_rebuild_pins_exact_pg33_source(self):
        self.assertIn("function pg33ProcessReceiverColumn(",self.main)
        self.assertIn("const PG33_LAB_SCOPE = Object.freeze",self.main)
        self.assertIn("function pg26ReadTransportInput(",self.main)
        self.assertIn("function pg23TransportMayRun(",self.main)

if __name__=="__main__":
    unittest.main()
