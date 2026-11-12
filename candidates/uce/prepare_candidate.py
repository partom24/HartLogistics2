"""Build first integrated UCE Bedrock source from current PG33 without deployment.

Default LEGACY world has identical previous runtime behavior; UCE only runs
after a separate authenticated cold migration. No world/server file accessed.
"""
from __future__ import annotations
import importlib.util
import json
import re
import shutil
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"build/uce-integrated"
BRIDGE=ROOT/"candidates/uce/runtime_bridge.js"
ASSET=ROOT/"candidates/uce/assets/entities/uce_native_carrier.json"
VERSION=[1,5,16]
MODULES=(
    "unified_ordinary_accounts","unified_world_shard_writer",
    "unified_native_custody","unified_carrier_registry",
    "unified_receiver_mr_service","unified_cold_q4_importer",
    "q5_world_receiver_census","q5_q4_read_adapter",
    "q5_q4_readonly_snapshot","q5_bucket_core",
    "q5_ordinary_shape_gate","ordinary_network_core"
)
spec=importlib.util.spec_from_file_location(
    "uce_pg33_predecessor",ROOT/"candidates/pg33/prepare_candidate.py")
pg33=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg33)

def once(s,old,new):
    if s.count(old)!=1:
        raise ValueError("UCE REFUSED uncertain exact source anchor: "+old[:90])
    return s.replace(old,new,1)

def guard_function(s,name,return_body="return;"):
    pattern=r"\bfunction "+re.escape(name)+r"\s*\("
    matches=list(re.finditer(pattern,s))
    if len(matches)!=1:raise ValueError("UCE REFUSED writer census: "+name)
    a=matches[0].start()
    brace=s.find("{",a)
    if brace<a or brace-a>400:raise ValueError("UCE REFUSED signature: "+name)
    return s[:brace+1]+("\n    if (uceLegacyWriterBlocked()) { "+
        return_body+" }\n")+s[brace+1:]

def compile_patch(source,bridge):
    source=once(source,'const VERSION = "1.5.15-LAB-PG33";',
      'const VERSION = "1.5.16-DEV-UCE";')
    source=once(source,"function logisticsTick() {",
      "function logisticsTick() {\n"+
      "    if (uceLegacyWriterBlocked()) { uceMrServiceTick(); return; }")
    source=once(source,"function schedulerTick() {",
      "function schedulerTick() {\n"+
      "    if (uceLegacyWriterBlocked()) return;")
    source=once(source,"function setWorldDynamic(key, value) {",
      "function setWorldDynamic(key, value) {\n"+
      "    if (uceLegacyWriterBlocked())\n"+
      "        throw new Error('UCE_LEGACY_WORLD_WRITER_FENCED');")
    for name in ("safeMovePartial","enqueueFromSource",
      "enqueueFromEjectedEntity","dequeueToReceiver","pg20MoveOpaqueNative",
      "pg23CompactSourceHopper","compactSourceHopper",
      "pg24VerifyEjectedCommit","giveOrDrop","setFilter",
      "plantEmptyNativeFrame","eraseOwnedFrame",
      "syncDisplay","reconcileDisplays"):
        ret="return 0;" if name in (
          "safeMovePartial","enqueueFromSource","enqueueFromEjectedEntity",
          "dequeueToReceiver","pg20MoveOpaqueNative","pg23CompactSourceHopper",
          "pg24VerifyEjectedCommit") else "return;"
        source=guard_function(source,name,ret)
    source=guard_function(source,"loadReceiverQueue",
      "throw new Error('UCE_LEGACY_QUEUE_LOAD_FENCED');")
    source=guard_function(source,"recoverJournal")
    source=guard_function(source,"recoverQueueJournal")
    source=guard_function(source,"flushLogistics")
    source=once(source,"    migrateLegacyCollectorsIfNeeded();",
      "    if (!uceLegacyWriterBlocked()) migrateLegacyCollectorsIfNeeded();")
    source=once(source,
      "    for (const receiver of logistics.receivers) {\n"+
      "        if (!receiver.queueKey) receiver.queueKey = allocateQueueKey();",
      "    if (!uceLegacyWriterBlocked()) for (const receiver of logistics.receivers) {\n"+
      "        if (!receiver.queueKey) receiver.queueKey = allocateQueueKey();")
    imports=(
      'import {createUnifiedCarrierRegistry} from "./uce/unified_carrier_registry.js";\n'
      'import {createUnifiedNativePort} from "./uce/unified_native_custody.js";\n'
      'import {serviceUnifiedReceiverMR} from "./uce/unified_receiver_mr_service.js";\n'
      'import {inspectUnifiedActiveColdImport} from "./uce/unified_cold_q4_importer.js";\n'
    )
    source=once(source,"import {\n    world,\n    system,",
      imports+"\nimport {\n    world,\n    system,")
    for forbidden in ("world.setDynamicProperty(","setItem(","moveItem(",
      "clearDynamicProperties(","saveQueueJournal("):
        if forbidden in bridge:
            raise ValueError("UCE REFUSED second direct bridge writer: "+forbidden)
    return source.rstrip()+"\n\n"+bridge.rstrip()+"\n"

def prepare(target):
    target=Path(target).resolve(strict=False)
    if target.exists():
        raise FileExistsError("UCE REFUSED existing build: "+str(target))
    with tempfile.TemporaryDirectory(prefix="uce-derive-") as temp:
        base=Path(temp)/"pg33"
        pg33.prepare(base)
        try:
            shutil.copytree(base,target)
            for kind in ("behavior_pack","resource_pack"):
                p=target/kind/"manifest.json"
                manifest=json.loads(p.read_text(encoding="utf-8"))
                if manifest["header"]["version"]!=[1,5,15]:
                    raise ValueError("UCE REFUSED predecessor header version")
                manifest["header"]["version"]=VERSION
                for module in manifest["modules"]:
                    if module["version"]!=[1,5,15]:
                        raise ValueError("UCE REFUSED predecessor module version")
                    module["version"]=VERSION
                for dep in manifest.get("dependencies",[]):
                    if "uuid" in dep:
                        if dep["version"]!=[1,5,15]:
                            raise ValueError("UCE REFUSED predecessor dependency")
                        dep["version"]=VERSION
                manifest["header"]["name"]=(
                  "HartMods - Hart Logistics "+
                  ("BP" if kind=="behavior_pack" else "RP")+
                  " | UCE unified source candidate")
                manifest["header"]["description"]=(
                  "Unified custody integration source. No Q4 migration "
                  "or live UCE authority installed. NOT release ready.")
                p.write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
            bp=target/"behavior_pack"
            lib=bp/"scripts/uce"
            lib.mkdir(parents=True,exist_ok=False)
            for name in MODULES:
                raw=(ROOT/("candidates/transport/"+name+".mjs")
                  ).read_text(encoding="utf-8")
                raw=raw.replace(".mjs'",".js'").replace('.mjs"','.js"')
                (lib/(name+".js")).write_text(raw,encoding="utf-8")
            asset=bp/"entities/uce_native_carrier.json"
            if asset.exists():raise ValueError("UCE REFUSED existing entity")
            asset.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(ASSET,asset)
            main=bp/"scripts/main.js"
            main.write_text(compile_patch(
              main.read_text(encoding="utf-8"),
              BRIDGE.read_text(encoding="utf-8")),encoding="utf-8")
            (target/"NOT_APPROVED_FOR_INSTALL.txt").write_text(
              "UCE integrated SOURCE build ONLY. Do not install in LAB or PROD.\n"
              "Complete unified ordinary scheduler, verified Q4 cold cutover, "
              "native slot recovery and full product acceptance first.\n",
              encoding="utf-8")
        except Exception:
            shutil.rmtree(target,ignore_errors=True)
            raise

if __name__=="__main__":
    if (ROOT/"build").is_symlink() or OUT.resolve(strict=False)!=OUT.absolute():
        raise ValueError("UCE REFUSED redirected build")
    prepare(OUT)
    print("UCE source candidate:",OUT)
    print("No LAB/world/production access or Q4 cutover.")
