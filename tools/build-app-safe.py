#!/usr/bin/env python3
"""Build a new timestamped app, preserving all existing apps and artifacts."""
import argparse
import datetime
import hashlib
import json
import plistlib
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-app', type=Path, default=Path('/Applications/RoamEdit.app'))
args = parser.parse_args()
source = args.source_app.resolve()
if not (source / 'Contents/MacOS/RoamEdit').is_file():
    parser.error(f'Electron shell missing: {source}')
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
output = ROOT / 'artifacts' / stamp / 'RoamEditMerged.app'
output.parent.mkdir(parents=True, exist_ok=False)

def skip_original_app(directory, names):
    ignored = []
    here = Path(directory)
    if here == source / 'Contents/Resources':
        ignored = [n for n in names if n in ('app', 'app.asar', 'app.asar.bak')]
    return ignored

shutil.copytree(source, output, symlinks=True, ignore=skip_original_app)
app_dir = output / 'Contents/Resources/app'
shutil.copytree(ROOT / 'merged', app_dir, symlinks=True)
plist_path = output / 'Contents/Info.plist'
with plist_path.open('rb') as stream:
    info = plistlib.load(stream)
# Electron 11 locates its existing Helper bundles using CFBundleName.
# Keep that shell name; the display name still identifies the merged client.
info['CFBundleDisplayName'] = 'RoamEditMerged'
info['CFBundleIdentifier'] = 'local.roamedit.merged'
with plist_path.open('wb') as stream:
    plistlib.dump(info, stream)
subprocess.run(['codesign', '--force', '--deep', '--sign', '-', str(output)], check=True)
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(output)], check=True)
files = [p for p in (ROOT / 'merged').rglob('*') if p.is_file()]
hashes = {}
for src in files:
    relative = src.relative_to(ROOT / 'merged')
    digest = hashlib.sha256(src.read_bytes()).hexdigest()
    if hashlib.sha256((app_dir / relative).read_bytes()).hexdigest() != digest:
        raise RuntimeError(f'Source changed during build or artifact differs: {relative}')
    hashes[str(relative)] = digest
manifest = {'createdAt': stamp, 'sourceShell': str(source), 'app': str(output),
            'sourceDirectory': str(ROOT / 'merged'), 'files': hashes, 'codesignVerified': True}
(output.parent / 'build-manifest.json').write_text(json.dumps(manifest, indent=2))
print(json.dumps({'app': str(output), 'manifest': str(output.parent / 'build-manifest.json'),
                  'fileCount': len(hashes)}))
