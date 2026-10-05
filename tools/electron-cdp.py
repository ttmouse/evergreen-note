#!/usr/bin/env python3
"""Inspect only a marked, isolated Electron test window through its local debug port."""
import argparse
import base64
import json
import urllib.request
from pathlib import Path
import websocket

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, required=True)
parser.add_argument('--expression', required=True)
parser.add_argument('--screenshot', type=Path)
args = parser.parse_args()
pages = json.load(urllib.request.urlopen(f'http://127.0.0.1:{args.port}/json', timeout=5))
page = next(x for x in pages if x['type'] == 'page')
ws = websocket.create_connection(page['webSocketDebuggerUrl'], suppress_origin=True, timeout=30)
counter = 0
def call(method, params):
    global counter
    counter += 1
    ws.send(json.dumps({'id': counter, 'method': method, 'params': params}))
    while True:
        response = json.loads(ws.recv())
        if response.get('id') == counter:
            if 'error' in response:
                raise RuntimeError(response['error'])
            return response['result']
try:
    guard = call('Runtime.evaluate', {'expression': "Boolean(require('electron').remote.getGlobal('roameditTestPaths'))", 'returnByValue': True})
    if guard.get('result', {}).get('value') is not True:
        raise RuntimeError('Not a marked isolated test window')
    if args.screenshot:
        args.screenshot.parent.mkdir(parents=True, exist_ok=True)
        capture = call('Page.captureScreenshot', {'format': 'png'})
        args.screenshot.write_bytes(base64.b64decode(capture['data']))
    result = call('Runtime.evaluate', {'expression': args.expression, 'returnByValue': True, 'awaitPromise': True})
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if 'exceptionDetails' in result:
        raise SystemExit(1)
finally:
    ws.close()
