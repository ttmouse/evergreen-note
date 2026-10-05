#!/usr/bin/env python3
"""Launch an isolated test app. Existing marked test roots can be reused for restart tests."""
import argparse
import datetime
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--app', type=Path, required=True)
parser.add_argument('--test-root', type=Path)
parser.add_argument('--debug-port', type=int)
args = parser.parse_args()
if args.debug_port is not None and not 1024 <= args.debug_port <= 65535:
    parser.error('Debug port must be 1024..65535')
tests = ROOT / 'test-runs'
tests.mkdir(exist_ok=True)
test_root = args.test_root or tests / datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
test_root = test_root.absolute()
if test_root.parent.resolve() != tests.resolve() or test_root.is_symlink():
    parser.error('Test root must be a direct, non-symlink child of project/test-runs')
marker = {'kind': 'roamedit-isolated-test-v1', 'root': str(test_root)}
if test_root.exists():
    try:
        if json.loads((test_root / '.roamedit-test.json').read_text()) != marker:
            parser.error('Test marker mismatch')
    except (OSError, ValueError) as error:
        parser.error(f'Not an existing isolated test root: {error}')
else:
    test_root.mkdir()
    (test_root / '.roamedit-test.json').write_text(json.dumps(marker, indent=2))
binary = args.app.resolve() / 'Contents/MacOS/Evergreen note'
if not binary.is_file():
    parser.error(f'App executable missing: {binary}')
environment = os.environ.copy()
environment['ROAMEDIT_TEST_ROOT'] = str(test_root)
command = [str(binary), '--enable-logging']
if args.debug_port:
    command.append(f'--remote-debugging-port={args.debug_port}')
print(json.dumps({'testRoot': str(test_root), 'app': str(args.app.resolve()),
                  'userData': str(test_root / 'userData'), 'workdir': str(test_root / 'notes')}), flush=True)
os.execve(str(binary), command, environment)
