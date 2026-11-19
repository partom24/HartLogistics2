#!/usr/bin/env python3
"""HartLogistics2 1.5.0 infrastructure-preview LAB-only updater; dry run unless --apply.

Real deployment requires exact Windows LAB root, stopped LAB BDS, clean pinned
partom24/HartLogistics2 checkout and established pack/world registrations.
Unrelated BDS processes (including production) are never stopped or modified.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import ntpath
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid

LAB = r'C:\Servers\Thomas_MCBedrock - Copy (2)'
BP_UUID = '4854d263-05dd-4f79-a21c-7ba969295c2d'
RP_UUID = '91316442-0f26-4fbb-88f3-2e39ea843a1a'
PACKS = [('behavior_pack','behavior_packs',BP_UUID,'world_behavior_packs.json'),
         ('resource_pack','resource_packs',RP_UUID,'world_resource_packs.json')]
# The Phase A engine is a single narrowly pinned candidate, not arbitrary
# modified 1.4.1 source. Baseline hashes remain mandatory for all other assets.
ENGINE_FILE = 'addon/behavior_pack/scripts/main.js'
PHASE_A_ENGINE_SHA256 = '2183cc3de4d60c9895305e41612644a75360b2baba44403c2387e3679cdc4411'
# Independently pinned 1.4.2 manifests; only these three original addon files change.
BASELINE_142_MANIFESTS = {
    'addon/behavior_pack/manifest.json': '2700f13cc3324235e280af597fdad9931569ae32f300a4ff55aa558b33db6817',
    'addon/resource_pack/manifest.json': 'a761e781ae5b36519139b99d45d90679b7e1b7ce920dcfb3e11d9c338441aaf6',
}
# P4g is an exact known 1.4.1 LAB origin only; P4g gameplay is not in 1.4.2.
INSTALLED_P4G_ENGINE_SHA256 = '0578e8eb205d9c68fde8926a82c07241b68979c86160c8df4665e316ba2e8b26'
# Exact P4e full-container native-call candidate, allowed as an upgrade origin.
INSTALLED_P4E_ENGINE_SHA256 = '5c4a2d414302ef10d76fef21932928592caf2fab84cd000c5b0085cefcdd1b91'
# Preserve the exact P4d transit-first candidate as an allowed LAB upgrade origin.
INSTALLED_P4D_ENGINE_SHA256 = '99045ca7179320f5f5e2d9d56286b4386308df7daa5473b8aa7498bf27c44306'
# Preserve the P4b LAB-candidate hash as a narrowly allowed upgrade origin.
INSTALLED_P4B_ENGINE_SHA256 = '5be82514ee9f356ff15626d0470f6ac2ca8e68ea8b6b5b5f9989b2df81f87a1c'
# Exact previous Phase A candidate installed in the owner-authorized LAB.
# Only this hash (plus pristine 1.4.1 or the new pinned source) is accepted
# as an upgrade origin; arbitrary engine versions remain strictly rejected.
PREVIOUS_PHASE_A_ENGINE_SHA256 = 'fcc640ba886de86dcbfabbb1d8e9683980691d6cc595dde5f5d21ccdb9ec9bbb'
# Also accept the exact CI-green P1 candidate, if previously installed.
INTERMEDIATE_PHASE_A_ENGINE_SHA256 = '38f0f3495d417a0d5c5d5f12d405b1d94dcbb4d89eacede35e3f77e95b423766'
# Owner-confirmed installed P2 engine, accepted as an exact upgrade origin.
INSTALLED_P2_ENGINE_SHA256 = '0b376086b0800949c78a484d00cd9389af011a55ecb182a6fa7263352965184d'
# Owner-confirmed P3 LIVE-slot LAB candidate, allowed as an exact upgrade origin.
INSTALLED_P3_ENGINE_SHA256 = 'ff08eae79c41fd4312a8bd8147f5ef12fb6ea5db92798f7be3450ea218456a9f'
# Source-only P4 native occupancy candidate; exact upgrade origin if owner installed it.
INSTALLED_P4_ENGINE_SHA256 = 'f47d4baa5c44989eb192edfa58d81f4dc83947b527ac2840ed2892d498bdebee'
PHASE_A_VERSION = (1,4,2)
PREVIEW_VERSION = (1,5,0)
LEGACY_VERSION = (1,4,1)
ORIGIN = re.compile(r'(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)partom24/HartLogistics2(?:\.git)?/?',re.I)

class UnsafeLab(RuntimeError):pass

def assert_lab_name(name: str) -> None:
    """Reject bad targets before ANY filesystem operations."""
    if not name or '/' in name or name.endswith(('\\',' ','.')) or '\\' not in name:
        raise UnsafeLab('Noncanonical LAB target')
    if ntpath.normpath(name)!=name or ntpath.normcase(name)!=ntpath.normcase(LAB):
        raise UnsafeLab('Target is not exact authorized LAB root')

def assert_no_link(path: Path) -> None:
    for item in (path,*path.parents):
        if item.exists() and (item.is_symlink() or
            (getattr(item.stat(follow_symlinks=False),'st_file_attributes',0)&0x400)):
            raise UnsafeLab(f'Unapproved junction or link: {item}')

def assert_server_stopped() -> None:
    """Check ONLY the authorized LAB executable; production may remain online.

    Windows' tasklist name-only check incorrectly blocked LAB previews whenever
    an unrelated Bedrock server (including production) was running. Query
    read-only OS process metadata for executable paths, and fail CLOSED if
    an active Bedrock process cannot be unambiguously identified.
    No other server's directory or world files are opened or modified.
    """
    if os.name!='nt':raise UnsafeLab('Real apply only permitted on Windows')
    command=(
        '$ErrorActionPreference="Stop";'
        '$processes=@(Get-CimInstance -ClassName Win32_Process '
        '-Filter "Name = \'bedrock_server.exe\'" -ErrorAction Stop | '
        'Select-Object ProcessId,ExecutablePath);'
        'ConvertTo-Json -InputObject $processes -Compress -Depth 3'
    )
    try:
        result=subprocess.run(
            ['powershell.exe','-NoProfile','-NonInteractive','-Command',command],
            capture_output=True,text=True,check=True)
        entries=json.loads(result.stdout.strip())
    except (OSError,subprocess.CalledProcessError,ValueError) as exc:
        raise UnsafeLab('Cannot verify whether LAB BDS is stopped; refusing safely') from exc
    if not isinstance(entries,list):
        raise UnsafeLab('Unexpected Windows BDS process metadata; refusing safely')
    expected=ntpath.normcase(ntpath.normpath(ntpath.join(LAB,'bedrock_server.exe')))
    for entry in entries:
        if not isinstance(entry,dict) or not isinstance(entry.get('ProcessId'),int):
            raise UnsafeLab('Ambiguous BDS process metadata; refusing safely')
        executable=entry.get('ExecutablePath')
        if not isinstance(executable,str) or not executable.strip() or not ntpath.isabs(executable):
            raise UnsafeLab('Cannot determine a running BDS executable path; refusing safely')
        resolved=ntpath.normcase(ntpath.normpath(executable))
        if resolved==expected:
            raise UnsafeLab('LAB bedrock_server.exe must be stopped (production may remain running)')


def assert_clean_git(repo: Path,sha: str) -> None:
    if not re.fullmatch(r'[0-9a-f]{40}',sha):raise UnsafeLab('Provide exact full Git commit SHA')
    def run(*args):
        return subprocess.run(['git','-C',str(repo),*args],capture_output=True,text=True,check=True).stdout.strip()
    if not ORIGIN.fullmatch(run('remote','get-url','origin')):raise UnsafeLab('Unexpected Git origin')
    if run('rev-parse','HEAD')!=sha:raise UnsafeLab('Git HEAD differs from pinned commit')
    if run('status','--porcelain','--untracked-files=all'):raise UnsafeLab('Git checkout not clean')

def hash_file(path: Path) -> str:
    digest=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):digest.update(block)
    return digest.hexdigest()

def hashes(root: Path) -> dict[str,str]:
    if not root.is_dir():raise UnsafeLab(f'Missing source/target {root}')
    out={}
    for p in sorted(root.rglob('*')):
        if p.is_symlink():raise UnsafeLab(f'Symlink inside pack: {p}')
        if p.is_file():out[p.relative_to(root).as_posix()]=hash_file(p)
    return out

def v3(value: object) -> tuple[int,int,int]:
    if not isinstance(value,list) or len(value)!=3 or any(type(x)!=int or x<0 for x in value):
        raise UnsafeLab('Invalid manifest version')
    return tuple(value)

def validate_source(repo: Path) -> tuple[int,int,int]:
    try:
        bp=json.loads((repo/'addon/behavior_pack/manifest.json').read_text())
        rp=json.loads((repo/'addon/resource_pack/manifest.json').read_text())
        if bp['header']['uuid']!=BP_UUID or rp['header']['uuid']!=RP_UUID:raise UnsafeLab('Pack UUID mismatch')
        ver=v3(bp['header']['version'])
        if v3(rp['header']['version'])!=ver:raise UnsafeLab('Pack versions mismatch')
        if any(v3(m['version'])!=ver for m in bp['modules']+rp['modules']):raise UnsafeLab('Module versions mismatch')
        deps=[d for d in bp['dependencies'] if d.get('uuid')==RP_UUID and v3(d.get('version'))==ver]
        if len(deps)!=1:raise UnsafeLab('Cross-pack dependency mismatch')
        for file in ('addon/behavior_pack/scripts/main.js','addon/behavior_pack/blocks/sorter.json',
                     'addon/behavior_pack/blocks/collector.json','addon/behavior_pack/blocks/receiver.json',
                     'addon/resource_pack/textures/terrain_texture.json'):
            if not (repo/file).is_file():raise UnsafeLab(f'Missing pack source {file}')
        if ver!=PREVIEW_VERSION:
            raise UnsafeLab('Preview updater only accepts exact 1.5.0 development source packs')
        registry=json.loads((repo/'BASELINE_HASHES.json').read_text())
        if registry['original_mcaddon_sha256']!='439678c0d68849a43341c126ba6aaaa111317254e137123fde3ac531cec5d1dd':
            raise UnsafeLab('Original archive hash mismatch')
        if len(registry['files'])!=72 or ENGINE_FILE not in registry['files']:
            raise UnsafeLab('Incomplete baseline source inventory')
        # Require byte-identical 1.4.1 foundations except the known 1.4.2
        # engine/manifests and this isolated preview's named art/atlas/text.
        allowed_changed = {
            ENGINE_FILE, 'addon/behavior_pack/manifest.json',
            'addon/resource_pack/manifest.json',
            'addon/resource_pack/textures/terrain_texture.json',
            'addon/resource_pack/texts/en_US.lang'
        }
        for name,digest in registry['files'].items():
            if name in allowed_changed: continue
            if hash_file(repo/name)!=digest:
                raise UnsafeLab(f'Unexpected modified baseline file: {name}')

        # The runtime must wrap, not rewrite, the proven 1.4.2 custody engine.
        actual=(repo/ENGINE_FILE).read_text(encoding='utf-8')
        marker='import "./urce_150_readonly_runtime.js";\n\n'
        version='const VERSION = "1.5.0-dev";'
        if actual.count(marker)!=1 or actual.count(version)!=1:
            raise UnsafeLab('Incorrect preview entrypoint integration')
        baseline=actual.replace(marker,'',1).replace(version,
                    'const VERSION = "1.4.2";',1).encode('utf-8')
        if hashlib.sha256(baseline).hexdigest()!=PHASE_A_ENGINE_SHA256:
            raise UnsafeLab('Preview changed protected 1.4.2 movement source')

        extra={
            'behavior_pack': {
                'blocks/transporter.json','blocks/bulk_storage.json',
                'loot_tables/blocks/transporter.json',
                'loot_tables/blocks/bulk_storage.json',
                'scripts/urce_150_readonly_runtime.js'
            },
            'resource_pack': {
                'models/blocks/hartlogistics_transporter.geo.json',
                'models/blocks/hartlogistics_bulk_storage.geo.json',
                'textures/blocks/hartlogistics_transporter.png',
                'textures/blocks/hartlogistics_bulk_storage.png'
            }
        }
        for folder in ('behavior_pack','resource_pack'):
            prefix='addon/'+folder+'/'
            expected={name[len(prefix):] for name in registry['files']
                      if name.startswith(prefix)} | extra[folder]
            if set(hashes(repo/'addon'/folder))!=expected:
                raise UnsafeLab(f'Unexpected 1.5 preview {folder} file inventory')
        return ver
    except (KeyError,OSError,ValueError) as e:raise UnsafeLab(f'Invalid source pack: {e}') from e

def remove_jsonc(text: str) -> str:
    """Keep byte/character offsets by replacing comments with spaces."""
    a=list(text);i=0;string=False
    while i<len(a):
        if string:
            if a[i]=='\\':i+=2;continue
            if a[i]=='"':string=False
        elif a[i]=='"':string=True
        elif a[i]=='/' and i+1<len(a) and a[i+1] in ('/','*'):
            line=a[i+1]=='/';j=i+2
            if line:
                while j<len(a) and a[j] not in '\n\r':j+=1
            else:
                while j+1<len(a) and not(a[j]=='*' and a[j+1]=='/'):j+=1
                if j+1>=len(a):raise UnsafeLab('Unclosed JSONC comment')
                j+=2
            for k in range(i,j):
                if a[k] not in '\r\n':a[k]=' '
            i=j;continue
        i+=1
    if string:raise UnsafeLab('Unclosed JSONC string')
    out=''.join(a);a=list(out);string=False;i=0
    while i<len(a):
        if a[i]=='"' and (i==0 or a[i-1]!='\\'):string=not string
        if not string and a[i]==',':
            j=i+1
            while j<len(a) and a[j].isspace():j+=1
            if j<len(a) and a[j] in ']}':a[i]=' '
        i+=1
    return ''.join(a)

def patch_registration(raw: str,pack_id: str,ver: tuple[int,int,int]) -> str:
    clean=remove_jsonc(raw)
    try:items=json.loads(clean)
    except ValueError as e:raise UnsafeLab(f'Invalid world registry JSONC: {e}') from e
    if not isinstance(items,list) or any(not isinstance(x,dict) for x in items):raise UnsafeLab('Bad registry shape')
    matches=[i for i in items if i.get('pack_id','').casefold()==pack_id.casefold()]
    if len(matches)!=1:raise UnsafeLab(f'Expected one registered pack {pack_id}; got {len(matches)}')
    hits=[m for m in re.finditer(r'"pack_id"\s*:\s*"([a-f0-9-]+)"',clean,re.I)
          if m.group(1).casefold()==pack_id.casefold()]
    if len(hits)!=1:raise UnsafeLab('Ambiguous registry pack ID')
    begin=clean.rfind('{',0,hits[0].start());end=clean.find('}',hits[0].end())
    if begin<0 or end<0 or '{' in clean[begin+1:end]:raise UnsafeLab('Nested registry entry')
    m=list(re.finditer(r'"version"\s*:\s*(\[[^\]]*\])',clean[begin:end+1]))
    if len(m)!=1:raise UnsafeLab('Missing/ambiguous version field')
    a=begin+m[0].start(1);b=begin+m[0].end(1)
    if '/' in raw[a:b]:raise UnsafeLab('Version comments require manual review')
    # Existing target registrations already match 1.4.2. Preserve even
    # whitespace and original JSONC byte-for-byte rather than rewriting it.
    if v3(matches[0].get('version'))==ver:return raw
    updated=raw[:a]+json.dumps(list(ver),separators=(',',':'))+raw[b:]
    expected=json.loads(json.dumps(items))
    for entry in expected:
        if entry.get('pack_id','').casefold()==pack_id.casefold():entry['version']=list(ver)
    if json.loads(remove_jsonc(updated))!=expected:raise UnsafeLab('Unrelated registry mutation')
    return updated

def discover_plan(repo: Path,root: Path) -> list[dict]:
    ver=validate_source(repo)
    props=root/'server.properties'
    if not (root/'bedrock_server.exe').is_file() or not props.is_file():raise UnsafeLab('Not a BDS LAB server root')
    levels=[l.split('=',1)[1].strip() for l in props.read_text(encoding='utf-8-sig').splitlines()
            if l.strip().startswith('level-name=')]
    if len(levels)!=1 or not levels[0] or '/' in levels[0] or '\\' in levels[0] or levels[0] in ('.','..'):
        raise UnsafeLab('Missing/unsafe level-name')
    world=root/'worlds'/levels[0]
    if not world.is_dir():raise UnsafeLab('World is missing')
    plan=[]
    for local,installed,pack_id,regname in PACKS:
        install=root/installed
        if not install.is_dir():raise UnsafeLab('Installed pack root missing')
        options=[]
        for path in install.iterdir():
            if path.is_symlink():raise UnsafeLab('Link inside pack root')
            manifest=path/'manifest.json'
            if path.is_dir() and manifest.is_file():
                try:metadata=json.loads(manifest.read_text())
                except ValueError:continue
                if metadata.get('header',{}).get('uuid')==pack_id:options.append(path)
        if len(options)!=1:raise UnsafeLab(f'Cannot identify exactly one pack {pack_id}')
        target=options[0]
        assert_no_link(target)
        old_manifest=json.loads((target/'manifest.json').read_text(encoding='utf-8-sig'))
        old_version=v3(old_manifest.get('header',{}).get('version'))
        if old_version not in (LEGACY_VERSION,PHASE_A_VERSION,PREVIEW_VERSION):
            raise UnsafeLab(f'Existing LAB pack {pack_id} is not an approved 1.4.1/1.4.2/identical 1.5 preview; refuse upgrade')
        reg=world/regname
        if not reg.is_file():raise UnsafeLab(f'World pack registry missing: {reg}')
        assert_no_link(reg)
        old=reg.read_bytes();raw=old.decode('utf-8-sig')
        parsed=json.loads(remove_jsonc(raw))
        if not isinstance(parsed,list) or any(not isinstance(e,dict) for e in parsed):
            raise UnsafeLab('Malformed LAB world pack registry')
        matching=[e for e in parsed if str(e.get('pack_id','')).casefold()==pack_id.casefold()]
        if len(matching)!=1 or v3(matching[0].get('version'))!=old_version:
            raise UnsafeLab(f'LAB world registration for {pack_id} mismatches installed version')
        registry=json.loads((repo/'BASELINE_HASHES.json').read_text())
        prefix='addon/'+local+'/'
        original={name[len(prefix):]:digest for name,digest in registry['files'].items()
                  if name.startswith(prefix)}
        source_hashes=hashes(repo/'addon'/local)
        installed_hashes=hashes(target)
        prior=original.copy()
        if local=='behavior_pack':
            prior['scripts/main.js']=PREVIOUS_PHASE_A_ENGINE_SHA256
        intermediate=original.copy()
        if local=='behavior_pack':
            intermediate['scripts/main.js']=INTERMEDIATE_PHASE_A_ENGINE_SHA256
        p2=original.copy()
        if local=='behavior_pack':
            p2['scripts/main.js']=INSTALLED_P2_ENGINE_SHA256
        p3=original.copy()
        if local=='behavior_pack':
            p3['scripts/main.js']=INSTALLED_P3_ENGINE_SHA256
        p4=original.copy()
        if local=='behavior_pack':
            p4['scripts/main.js']=INSTALLED_P4_ENGINE_SHA256
        p4b=original.copy()
        if local=='behavior_pack':
            p4b['scripts/main.js']=INSTALLED_P4B_ENGINE_SHA256
        p4d=original.copy()
        if local=='behavior_pack':
            p4d['scripts/main.js']=INSTALLED_P4D_ENGINE_SHA256
        p4e=original.copy()
        if local=='behavior_pack':
            p4e['scripts/main.js']=INSTALLED_P4E_ENGINE_SHA256
        p4g=original.copy()
        if local=='behavior_pack':
            p4g['scripts/main.js']=INSTALLED_P4G_ENGINE_SHA256
        # Never accept a 1.4.2 manifest with arbitrary old engine bits or a
        # 1.4.1 manifest with an unrelated 1.5 runtime: exact pack-wide evidence.
        phase_142=original.copy()
        phase_142['manifest.json']=BASELINE_142_MANIFESTS['addon/'+local+'/manifest.json']
        if local=='behavior_pack':
            phase_142['scripts/main.js']=PHASE_A_ENGINE_SHA256
        allowed=(source_hashes,) if old_version==PREVIEW_VERSION else (
            (phase_142,) if old_version==PHASE_A_VERSION else
            (original,prior,intermediate,p2,p3,p4,p4b,p4d,p4e,p4g))
        if installed_hashes not in allowed:
            raise UnsafeLab(f'Unrecognized installed LAB pack contents for {pack_id}')
        plan.append({'source':repo/'addon'/local,'target':target,'registry':reg,
                     'new_registry':patch_registration(raw,pack_id,ver),
                     'old_bytes':old,'files':source_hashes,
                     'installed':installed_hashes})
    return plan

def approved_previous_pack_hashes(repo: Path, local: str, version: tuple[int,int,int]) -> list[dict[str,str]]:
    """Enumerate only exact, historically recorded predecessor source states."""
    registry=json.loads((repo/'BASELINE_HASHES.json').read_text())
    prefix='addon/'+local+'/'
    original={name[len(prefix):]:digest for name,digest in registry['files'].items()
              if name.startswith(prefix)}
    if version==PHASE_A_VERSION:
        expected=original.copy()
        expected['manifest.json']=BASELINE_142_MANIFESTS[prefix+'manifest.json']
        if local=='behavior_pack':expected['scripts/main.js']=PHASE_A_ENGINE_SHA256
        return [expected]
    if version!=LEGACY_VERSION:
        raise UnsafeLab('Backup predecessor version is not an accepted 1.4.1/1.4.2 source')
    candidates=[original]
    if local=='behavior_pack':
        for digest in (PREVIOUS_PHASE_A_ENGINE_SHA256, INTERMEDIATE_PHASE_A_ENGINE_SHA256,
                       INSTALLED_P2_ENGINE_SHA256, INSTALLED_P3_ENGINE_SHA256,
                       INSTALLED_P4_ENGINE_SHA256, INSTALLED_P4B_ENGINE_SHA256,
                       INSTALLED_P4D_ENGINE_SHA256, INSTALLED_P4E_ENGINE_SHA256,
                       INSTALLED_P4G_ENGINE_SHA256):
            state=original.copy()
            state['scripts/main.js']=digest
            candidates.append(state)
    return candidates


def create_rollback_plan(repo: Path, root: Path, tag: str) -> list[dict]:
    """Only restore a known predecessor from the exact backup of this preview.

    Never accept an arbitrary older pack, same-version replacement or restored
    world registration if non-Hart entries changed since original installation.
    Uses ordinary staged/verified apply_plan, which preserves a new backup of
    the preview before rollback.
    """
    if not re.fullmatch(r'lab-[0-9a-f]{12}', tag):
        raise UnsafeLab('Rollback requires the exact recorded lab-<12 lowercase hex> tag')
    backup=root/'_HartLogisticsDeployBackups'/tag
    assert_no_link(backup)
    if not backup.is_dir():
        raise UnsafeLab('Recorded LAB backup not found')
    current=discover_plan(repo,root)
    result=[]
    for i,item in enumerate(current):
        local,installed,pack_id,regname=PACKS[i]
        # Current installation must exactly match the source to be rolled back.
        if item['installed']!=item['files'] or (
                item['old_bytes'].decode('utf-8-sig')!=item['new_registry']):
            raise UnsafeLab('Installed preview/registrations changed since candidate; refuse rollback')
        pack=backup/f'pack-{i}'
        reg=backup/f'registry-{i}.bin'
        assert_no_link(pack)
        assert_no_link(reg)
        if not pack.is_dir() or not reg.is_file():
            raise UnsafeLab('Incomplete rollback backup')
        prior_manifest=json.loads((pack/'manifest.json').read_text(encoding='utf-8-sig'))
        if prior_manifest['header']['uuid']!=pack_id:
            raise UnsafeLab('Backup pack UUID mismatch')
        old_version=v3(prior_manifest['header']['version'])
        stored_hashes=hashes(pack)
        if stored_hashes not in approved_previous_pack_hashes(repo,local,old_version):
            raise UnsafeLab('Backup is not an exact known original predecessor')
        raw=reg.read_bytes()
        stored=json.loads(remove_jsonc(raw.decode('utf-8-sig')))
        hits=[e for e in stored if isinstance(e,dict) and
              str(e.get('pack_id','')).casefold()==pack_id.casefold()]
        if len(hits)!=1 or v3(hits[0].get('version'))!=old_version:
            raise UnsafeLab('Backup pack and registered version mismatch')
        # This precise backup must be the one installed into THIS world:
        # verify no other world-pack entry or JSONC formatting drifted.
        new_after_install=patch_registration(raw.decode('utf-8-sig'),
                                             pack_id,PREVIEW_VERSION)
        current_bytes=item['old_bytes']
        bom=b'\xef\xbb\xbf' if raw.startswith(b'\xef\xbb\xbf') else b''
        if bom+new_after_install.encode('utf-8')!=current_bytes:
            raise UnsafeLab('World registry drifted since this exact backup; refuse rollback')
        result.append({**item,'source':pack,'files':stored_hashes,
                       'new_registry':raw.decode('utf-8-sig')})
    return result


def apply_plan(root: Path,plan: list[dict]) -> Path:
    """Stage, SHA-check, backup, replace, verify, roll back on error."""
    tag='lab-'+uuid.uuid4().hex[:12]
    stage=root/'_HartLogisticsDeployStage'/tag
    backup=root/'_HartLogisticsDeployBackups'/tag
    # Fail before any write if an existing staging/backup parent redirects
    # outside the exact LAB root (e.g. to production via a junction).
    assert_no_link(root)
    assert_no_link(stage.parent)
    assert_no_link(backup.parent)
    if stage.exists() or backup.exists():raise UnsafeLab('Occupied deployment staging path')
    staged=[];backed=[];installed=[]
    try:
        stage.mkdir(parents=True);backup.mkdir(parents=True)
        for i,item in enumerate(plan):
            dest=stage/str(i)
            shutil.copytree(item['source'],dest)
            if hashes(dest)!=item['files']:raise UnsafeLab('Stage SHA mismatch')
            staged.append(dest)
            (backup/f'registry-{i}.bin').write_bytes(item['old_bytes'])
        for i,item in enumerate(plan):
            dest=backup/f'pack-{i}'
            item['target'].rename(dest);backed.append((item['target'],dest))
            staged[i].rename(item['target']);installed.append(item['target'])
        for i,item in enumerate(plan):
            bom=b'\xef\xbb\xbf' if item['old_bytes'].startswith(b'\xef\xbb\xbf') else b''
            desired=bom+item['new_registry'].encode('utf-8')
            # Preserve unrelated JSONC bytes. Only the registered Hart pack
            # version changes on the guarded 1.4.1 -> 1.4.2 transition.
            if desired!=item['old_bytes']:
                temporary=stage/f'registry-{i}.tmp'
                temporary.write_bytes(desired)
                temporary.replace(item['registry'])
        for item in plan:
            if hashes(item['target'])!=item['files']:raise UnsafeLab('Post-install SHA mismatch')
        return backup
    except BaseException:
        for path in reversed(installed):
            if path.exists():shutil.rmtree(path)
        for original,saved in reversed(backed):
            if saved.exists():saved.rename(original)
        for item in plan:
            if item['registry'].parent.exists():item['registry'].write_bytes(item['old_bytes'])
        raise
    finally:
        if stage.exists():shutil.rmtree(stage)

def main(argv=None) -> int:
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--server-root',default=LAB)
    p.add_argument('--commit',help='exact 40-character Git SHA')
    p.add_argument('--check-lab',action='store_true',help='read-only stopped-LAB preflight')
    p.add_argument('--apply',action='store_true',help='explicit LAB write operation')
    p.add_argument('--confirm-lab-only',action='store_true',
                   help='required with --apply, never production')
    p.add_argument('--rollback-tag',help='prior installer-created lab-<12 hex> backup')
    a=p.parse_args(argv)
    try:
        assert_lab_name(a.server_root)
        repo=Path(__file__).resolve().parents[1]
        v=validate_source(repo)
        if a.commit:assert_clean_git(repo,a.commit)
        if a.apply and not (a.check_lab and a.confirm_lab_only and a.commit):
            raise UnsafeLab('Apply requires --commit --check-lab --confirm-lab-only')
        if a.rollback_tag and (not a.check_lab or not a.apply):
            raise UnsafeLab('Explicit rollback requires stopped-LAB --check-lab and --apply')
        if a.check_lab and not a.commit:
            raise UnsafeLab('LAB preflight requires exact --commit')
        if not a.check_lab:
            print('1.5 PREVIEW SOURCE PASS:',v,'Target LAB (not accessed):',LAB)
            print('No Minecraft server, world, inventory or production files were opened.')
            return 0
        if os.name!='nt':
            raise UnsafeLab('Real LAB preflight/install/rollback requires Windows')
        root=Path(a.server_root)
        assert_no_link(root)
        if ntpath.normcase(str(root.resolve(strict=True)))!=ntpath.normcase(LAB):
            raise UnsafeLab('LAB root redirected to unexpected location')
        assert_server_stopped()
        plan=(create_rollback_plan(repo,root,a.rollback_tag)
              if a.rollback_tag else discover_plan(repo,root))
        for item in plan:
            print('LAB:',item['source'],'->',item['target'],
                  'registry:',item['registry'])
        if not a.rollback_tag and all(
               item['installed']==item['files'] and
               item['old_bytes'].decode('utf-8-sig')==item['new_registry']
               for item in plan):
            print('LAB already exactly matches this pinned 1.5 preview; no write needed.')
            return 0
        if not a.apply:
            print('LAB READ-ONLY PREFLIGHT PASS. No files changed.')
            return 0
        assert_server_stopped()
        # Reinspect all hashes, files and world registrations immediately
        # before writing; stale plans never authorize a replacement.
        second=(create_rollback_plan(repo,root,a.rollback_tag)
                if a.rollback_tag else discover_plan(repo,root))
        for x,y in zip(plan,second):
            if (x['installed']!=y['installed'] or
                    x['old_bytes']!=y['old_bytes'] or x['files']!=y['files']):
                raise UnsafeLab('LAB state drifted after preflight')
        backup=apply_plan(root,second)
        print('LAB', 'ROLLBACK' if a.rollback_tag else 'INSTALL',
              'COMPLETE; backup:',backup)
        print('Keep all backup folders. No BDS auto-start. Production untouched.')
        return 0
    except (UnsafeLab,OSError,ValueError,KeyError,subprocess.CalledProcessError) as e:
        print('REFUSED:',e,file=sys.stderr)
        return 2

if __name__=='__main__':raise SystemExit(main())
