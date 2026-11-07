# TEMP_TEST:PG03-05
"""Deterministic packaging of a temporary, NOT FOR PRODUCTION Bedrock probe BP."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo
import json

ROOT=Path(__file__).resolve().parents[2]
SRC=ROOT/"tests"/"bundle1_probe"/"behavior_pack"
OUT=ROOT/"artifacts"/"HartLogistics_PG03-05_DISPOSABLE_LAB_ONLY.mcpack"
EXPECTED={
    "manifest.json","blocks/mr_container.json",
    "recipes/probe_recipe.json","scripts/main.js"
}
def build():
    paths={p.relative_to(SRC).as_posix():p for p in SRC.rglob("*") if p.is_file()}
    if set(paths)!=EXPECTED:
        raise ValueError(f"Unexpected or missing pack content: {set(paths)^EXPECTED}")
    for name in EXPECTED:
        if name.endswith(".json"): json.loads(paths[name].read_text())
    OUT.parent.mkdir(parents=True,exist_ok=True)
    with ZipFile(OUT,"w",ZIP_DEFLATED,compresslevel=9) as archive:
        for name in sorted(EXPECTED):
            z=ZipInfo(name,date_time=(1980,1,1,0,0,0))
            z.compress_type=ZIP_DEFLATED
            z.external_attr=0o644 << 16
            archive.writestr(z,paths[name].read_bytes())
    with ZipFile(OUT) as archive:
        assert set(archive.namelist())==EXPECTED
        assert not archive.testzip()
    print(f"Disposable LAB test pack: {OUT} ({OUT.stat().st_size} bytes)")
if __name__=="__main__": build()
