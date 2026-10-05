#!/usr/bin/env python3
"""Create/edit a small note through the test UI, then verify it after a separate restart."""
import argparse
import base64
import json
import time
import urllib.request
from pathlib import Path
import websocket

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, required=True)
parser.add_argument('--evidence', type=Path, required=True)
parser.add_argument('--phase', choices=['create', 'reopen'], required=True)
args = parser.parse_args()
args.evidence.mkdir(parents=True, exist_ok=True)
pages = json.load(urllib.request.urlopen(f'http://127.0.0.1:{args.port}/json', timeout=5))
page = next(x for x in pages if x['type'] == 'page' and '/roamedit-app/index.html' in x['url'])
ws = websocket.create_connection(page['webSocketDebuggerUrl'], suppress_origin=True, timeout=30)
sequence = 0
events = []
def call(method, params):
    global sequence
    sequence += 1
    ws.send(json.dumps({'id': sequence, 'method': method, 'params': params}))
    while True:
        result = json.loads(ws.recv())
        if result.get('id') == sequence:
            if 'error' in result:
                raise RuntimeError(result['error'])
            return result.get('result', {})
        events.append(result)
def evaluate(expression):
    result = call('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
    if 'exceptionDetails' in result:
        raise RuntimeError(result['exceptionDetails'])
    return result.get('result', {}).get('value')
def screenshot(name):
    result = call('Page.captureScreenshot', {'format': 'png'})
    (args.evidence / name).write_bytes(base64.b64decode(result['data']))
def key(name, code, virtual):
    for event in ['keyDown', 'keyUp']:
        call('Input.dispatchKeyEvent', {'type': event, 'key': name, 'code': code,
                                      'windowsVirtualKeyCode': virtual, 'nativeVirtualKeyCode': virtual})
    time.sleep(.15)
def type_text(text):
    # Electron 11's native editing path reliably targets the focused contenteditable.
    evaluate('require("electron").remote.getCurrentWebContents().insertText(' + json.dumps(text) + ')')
    time.sleep(.2)
    call('Input.dispatchKeyEvent', {'type': 'keyUp', 'key': 'ArrowRight', 'code': 'ArrowRight',
                                   'windowsVirtualKeyCode': 39, 'nativeVirtualKeyCode': 39})
    time.sleep(.2)
def wait_for(expression):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        value = evaluate(expression)
        if value:
            return value
        time.sleep(.2)
    raise RuntimeError(f'Timed out: {expression}')
def semantic_nodes(nodes):
    # memory.imports infers isTopic from topic when reopening. Compare that
    # established semantic value while retaining raw snapshots as evidence.
    return sorted([dict(x, isTopic=True if x.get('topic') or x.get('isTopic') else None)
                   for x in nodes], key=lambda x:x['ky'])
try:
    paths = evaluate('require("electron").remote.getGlobal("roameditTestPaths")')
    if not paths or evaluate('localStorage.workDir') != paths['workdir']:
        raise RuntimeError('Not a marked isolated test window')
    wait_for('window.plugin && plugin.memory && plugin.memory.initFinished && plugin.memory.imported')
    evaluate('require("electron").remote.getCurrentWindow().focus()')
    call('Runtime.enable', {})
    screenshot(args.phase + '-before.png')
    expected_path = args.evidence / 'expected.json'
    if args.phase == 'create':
        marker = 'AgentD01-' + time.strftime('%Y%m%d-%H%M%S')
        evaluate('document.getElementById("create-topic-btn").click()')
        time.sleep(.5)
        evaluate('document.querySelector("#roam-main-wrap .node-top-text").focus()')
        type_text(marker)
        evaluate('document.querySelector("#roam-main-wrap .node-top > .node-child .node-text").focus()')
        type_text(marker + '-parent')
        key('Enter', 'Enter', 13)
        key('Tab', 'Tab', 9)
        type_text(marker + '-child-v1')
        evaluate('document.activeElement.blur()')
        wait_for(f'dbdata.some(x => x.ori === {json.dumps(marker + "-child-v1")})')
        evaluate(f'''(() => {{const node=[...document.querySelectorAll('#roam-main-wrap .node-text')].find(x=>x.innerText==={json.dumps(marker + '-child-v1')}); node.focus();const range=document.createRange();range.selectNodeContents(node);const selection=getSelection();selection.removeAllRanges();selection.addRange(range)}})()''')
        type_text(marker + '-child-v2')
        evaluate('document.activeElement.blur()')
        wait_for(f'dbdata.some(x => x.ori === {json.dumps(marker + "-child-v2")})')
        selected = evaluate(f'dbdata.filter(x=>x.ori && x.ori.startsWith({json.dumps(marker)})).map(x=>({{ky:x.ky,pky:x.pky||null,ori:x.ori,isTopic:x.isTopic||null,topic:x.topic||null}}))')
        assert len(selected) == 3, selected
        topic = next(x for x in selected if x['ori'] == marker)
        parent = next(x for x in selected if x['ori'] == marker + '-parent')
        child = next(x for x in selected if x['ori'] == marker + '-child-v2')
        assert parent['pky'] == topic['ky'] and child['pky'] == parent['ky'], selected
        expected = {'paths': paths, 'marker': marker, 'nodes': selected,
                    'app': evaluate('require("electron").remote.app.getAppPath()'),
                    'versions': evaluate('process.versions')}
        expected_path.write_text(json.dumps(expected, indent=2))
    else:
        expected = json.loads(expected_path.read_text())
        assert paths == expected['paths']
        marker = expected['marker']
        current = evaluate(f'dbdata.filter(x=>x.ori && x.ori.startsWith({json.dumps(marker)})).map(x=>({{ky:x.ky,pky:x.pky||null,ori:x.ori,isTopic:x.isTopic||null,topic:x.topic||null}}))')
        assert semantic_nodes(current) == semantic_nodes(expected['nodes']), current
        evaluate(f'plugin.router.to("zoom/inTopic/"+{json.dumps(next(x["ky"] for x in expected["nodes"] if x["ori"] == marker))})')
        wait_for(f'document.querySelector("#roam-main-wrap").innerText.includes({json.dumps(marker + "-child-v2")})')
    note_file = Path(paths['workdir']) / 'roamedit-nk18888-node.json'
    deadline = time.monotonic() + 10
    while True:
        if note_file.exists():
            persisted = json.loads(note_file.read_text())
            subset = [{k:x.get(k) or None for k in ['ky','pky','ori','isTopic','topic']} for x in persisted if str(x.get('ori','')).startswith(expected['marker'])]
            if semantic_nodes(subset) == semantic_nodes(expected['nodes']):
                break
        if time.monotonic() > deadline:
            raise RuntimeError('Disk contents did not match the edited UI nodes')
        time.sleep(.2)
    screenshot(args.phase + '-after.png')
    report = {'phase': args.phase, 'result': 'passed', 'paths': paths, 'nodeFile': str(note_file), 'nodes': subset,
              'scope': 'UI creation, child indentation, edit, JSON persistence and separate-process restart; other D01 cases still pending'}
    (args.evidence / (args.phase + '-result.json')).write_text(json.dumps(report, indent=2))
    print(json.dumps(report, ensure_ascii=False))
finally:
    (args.evidence / (args.phase + '-events.json')).write_text(json.dumps(events, indent=2))
    ws.close()
