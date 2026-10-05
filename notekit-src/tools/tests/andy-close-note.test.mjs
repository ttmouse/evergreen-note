import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { test } from 'node:test'
import { connect } from '../cdp-client.mjs'

const root = new URL('../../', import.meta.url).pathname
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function freePort() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

test('Cmd+W closes exactly one note and retains Andy, including the last note', { timeout: 120000 }, async () => {
  const profile = await mkdtemp(`${root}tmp/andy-close-`)
  const port = await freePort(), debugPort = await freePort()
  const child = spawn(`${root}node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`, ['desktop/main.cjs', `--remote-debugging-port=${debugPort}`], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_USER_DATA: profile, NOTEKIT_PORT: String(port) },
    stdio: 'ignore',
  })
  let cdp
  try {
    for (let i = 0; i < 160; i++) {
      try {
        cdp ||= await connect(debugPort)
        if (await cdp.evaluate('!!window.__notekitApp?.addons?.main?.workspaceTabs.length')) break
      } catch {}
      await pause(250)
    }
    assert.ok(cdp)
    const evaluate = body => cdp.evaluate(`(()=>{const app=window.__notekitApp,$=app.addons;${body}})()`)
    await evaluate(`$.floatViewer.setModeAll('andy');return true`)
    await pause(650)
    await evaluate(`for(const title of ['Close test A','Close test B']) $.keyClick.openInAndyMode($.topic.createTopic(title).ky);return true`)
    await pause(650)
    const state = () => evaluate(`return {mode:app.states.floatViewerMode,layout:document.querySelector('.floatview-container').dataset.mode,keys:app.states.floatViewerList.map(d=>d.key),tabs:$.main.workspaceTabs.map(t=>t.key),active:app.states.floatViewerActiveKey}`)
    assert.equal((await state()).keys.length, 3)
    const snapshots = []
    // Force both dispatch paths to process the very same key object.
    await evaluate(`const e=new KeyboardEvent('keydown',{key:'w',metaKey:true,bubbles:true,cancelable:true});document.body.dispatchEvent(e);$.hotkey.listen({app,event:{nativeEvent:e,key:'w',metaKey:true,preventDefault(){}}});return true`)
    await pause(650)
    snapshots.push(await state())
    assert.equal(snapshots[0].keys.length, 2, 'one key must close exactly one column')
    const press = async () => {
      for (const type of ['rawKeyDown','keyUp']) await cdp.call('Input.dispatchKeyEvent', { type, key: 'w', code: 'KeyW', modifiers: 4, windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 })
      await pause(650)
      snapshots.push(await state())
    }
    await press()
    assert.deepEqual(snapshots.at(-1).keys, ['diaries'])
    await press()
    assert.deepEqual(snapshots.at(-1).keys, ['diaries'], 'last column returns to diaries in Andy')
    await evaluate(`$.main.closeWorkspaceTab('diaries');return true`)
    await pause(650)
    snapshots.push(await state())
    assert.deepEqual(snapshots.at(-1).keys, ['diaries'], 'tab close has the same last-column behavior')
    for (const snapshot of snapshots) {
      assert.equal(snapshot.mode, 'andy')
      assert.equal(snapshot.layout, 'andy')
      assert.deepEqual(snapshot.keys, snapshot.tabs)
    }
    // Close during the render throttle window, then wait for trailing callbacks.
    await evaluate(`$.keyClick.openInAndyMode($.topic.createTopic('Rapid close').ky);return true`)
    await pause(50)
    await evaluate(`$.floatViewer.closeActiveNote();return true`)
    await pause(650)
    assert.deepEqual((await state()).keys, ['diaries'], 'closed note cannot reappear from a delayed render')
    // Closing regular tabs while Meta is physically held must navigate in the
    // main pane, rather than take Router.to's Cmd-click floating-view branch.
    await evaluate(`$.floatViewer.setModeAll('fixed');return true`)
    await pause(650)
    const regularKeys = await evaluate(`return ['Regular A','Regular B'].map(title=>$.topic.createTopic(title).ky)`)
    for (const key of regularKeys) {
      await evaluate(`$.router.toMain(${JSON.stringify(key)});return true`)
      await pause(400)
    }
    const tabsBefore = (await state()).tabs
    await cdp.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Meta', code: 'MetaLeft', modifiers: 4, windowsVirtualKeyCode: 91 })
    await press()
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Meta', code: 'MetaLeft', modifiers: 0, windowsVirtualKeyCode: 91 })
    const regular = await state()
    assert.equal(regular.mode, 'fixed')
    assert.deepEqual(regular.keys, [], 'Cmd+W must not create a floating note')
    assert.equal(regular.tabs.length, tabsBefore.length - 1)
    assert.ok(!regular.tabs.includes(regularKeys[1]))
    assert.equal(await evaluate(`return $.router.getRecordPath()`), regularKeys[0])
    assert.equal(await evaluate(`return document.querySelectorAll('.dialog-float-viewer').length`), 0)
    await evaluate(`$.router.toMain(${JSON.stringify(regularKeys[1])});return true`)
    await pause(400)
    const point = await evaluate(`const e=[...document.querySelectorAll('.main-area .editor-view .node-text')].find(e=>{const r=e.getBoundingClientRect();return r.width>10&&r.height>5&&r.top>60&&r.bottom<innerHeight});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left+10,y:r.top+r.height/2}`)
    assert.ok(point, 'the main note must be clickable')
    for (const type of ['mousePressed','mouseReleased']) await cdp.call('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...point })
    await cdp.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Meta', code: 'MetaLeft', modifiers: 4, windowsVirtualKeyCode: 91 })
    await press()
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Meta', code: 'MetaLeft', modifiers: 0, windowsVirtualKeyCode: 91 })
    assert.equal(await evaluate(`return $.router.getRecordPath()`), regularKeys[0], 'Cmd+W inside the editor must select the remaining note')
    assert.deepEqual((await state()).keys, [], 'closing from the editor must not open a float')
    const exceptions = cdp.events.filter(e => e.method === 'Runtime.exceptionThrown')
    assert.equal(exceptions.length, 0, JSON.stringify(exceptions))
    await writeFile(new URL('../../../artifacts/andy-close-check/report.json', import.meta.url), JSON.stringify({ snapshots, exceptions }, null, 2))
    const shot = await cdp.call('Page.captureScreenshot', { format: 'png' })
    await writeFile(new URL('../../../artifacts/andy-close-check/after-close.png', import.meta.url), Buffer.from(shot.data, 'base64'))
  } finally {
    if (cdp) cdp.close()
    child.kill('SIGKILL')
  }
})
