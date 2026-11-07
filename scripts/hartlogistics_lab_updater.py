#!/usr/bin/env python3
"""HartLogistics2 guarded LAB-only updater; dry run unless --apply.

Real deployment requires exact Windows LAB root, stopped BDS, clean pinned
partom24/HartLogistics2 checkout and established pack/world registrations.
No HartBots production updater code is executed or imported here.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
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
    if os.name!='nt':raise UnsafeLab('Real apply only permitted on Windows')
    out=subprocess.run(['tasklist','/FO','CSV','/NH'],capture_output=True,text=True,check=True).stdout
    if any(row and row[0].lower()=='bedrock_server.exe' for row in csv.reader(io.StringIO(out))):
        raise UnsafeLab('bedrock_server.exe must be stopped')

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
        if ver==(1,4,1):
            registry=json.loads((repo/'BASELINE_HASHES.json').read_text())
            if registry['original_mcaddon_sha256']!='439678c0d68849a43341c126ba6aaaa111317254e137123fde3ac531cec5d1dd':
                raise UnsafeLab('Original archive hash mismatch')
            for name,digest in registry['files'].items():
                if hash_file(repo/name)!=digest:raise UnsafeLab(f'Baseline source differs: {name}')
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
        reg=world/regname
        if not reg.is_file():raise UnsafeLab(f'World pack registry missing: {reg}')
        assert_no_link(options[0]);assert_no_link(reg)
        old=reg.read_bytes();text=old.decode('utf-8-sig')
        plan.append({'source':repo/'addon'/local,'target':options[0], 'registry':reg,
                     'new_registry':patch_registration(text,pack_id,ver),
                     'old_bytes':old,'files':hashes(repo/'addon'/local)})
    return plan

def apply_plan(root: Path,plan: list[dict]) -> Path:
    """Stage, SHA-check, backup, replace, verify, roll back on error."""
    tag='lab-'+uuid.uuid4().hex[:12]
    stage=root/'_HartLogisticsDeployStage'/tag
    backup=root/'_HartLogisticsDeployBackups'/tag
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
            temporary=stage/f'registry-{i}.tmp'
            bom=b'\xef\xbb\xbf' if item['old_bytes'].startswith(b'\xef\xbb\xbf') else b''
            temporary.write_bytes(bom+item['new_registry'].encode('utf-8'))
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
    p.add_argument('--commit',help='exact 40-character Git SHA required to apply')
    p.add_argument('--apply',action='store_true',help='explicit LAB write operation')
    a=p.parse_args(argv)
    try:
        assert_lab_name(a.server_root)
        repo=Path(__file__).resolve().parents[1]
        v=validate_source(repo)
        if a.commit:assert_clean_git(repo,a.commit)
        if a.apply and not a.commit:raise UnsafeLab('--apply requires a pinned --commit SHA')
        if os.name!='nt':
            if a.apply:raise UnsafeLab('Apply requires a Windows LAB machine')
            print('OFFLINE SOURCE CHECK ONLY:',v,'Approved target:',LAB)
            print('No Minecraft server paths were opened or modified.')
            return 0
        root=Path(a.server_root)
        assert_no_link(root)
        if ntpath.normcase(str(root.resolve(strict=True)))!=ntpath.normcase(LAB):
            raise UnsafeLab('LAB root redirected to unexpected location')
        assert_server_stopped()
        plan=discover_plan(repo,root)
        for item in plan:print(item['source'],'->',item['target'],'registry:',item['registry'])
        if not a.apply:
            print('DRY RUN: no files changed; explicit approval required for --apply.')
            return 0
        assert_server_stopped()
        print('LAB deployment complete; backup:',apply_plan(root,plan))
        return 0
    except (UnsafeLab,OSError,ValueError,subprocess.CalledProcessError) as e:
        print('REFUSED:',e,file=sys.stderr)
        return 2

if __name__=='__main__':raise SystemExit(main())
