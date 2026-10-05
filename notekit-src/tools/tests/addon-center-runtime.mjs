import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync } from 'node:fs'
import { connect } from '../cdp-client.mjs'

const c = await connect(Number(process.argv[2] || 9433))
const output = new URL('../../../artifacts/addon-center-check/', import.meta.url)
mkdirSync(output, { recursive: true })
const pause = () => new Promise(resolve => setTimeout(resolve, 150))
const check = async expression => assert.ok(await c.evaluate(expression), expression)
const click = async selector => {
  const point = await c.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await c.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
  await c.call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...point })
  await c.call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...point })
  await pause()
}
const input = '.addon-search-wrap input'
const screenshot = async name => {
  const { data } = await c.call('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL(name + '.png', output), Buffer.from(data, 'base64'))
}
try {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await c.evaluate(`!!window.__notekitApp?.addons?.addonCenter`)) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  await c.evaluate(`[...document.querySelectorAll('.addon-center-dialog')].forEach(el => window.__notekitApp.addons.dialog.close(el.id))`)
  await pause()
  await c.evaluate(`window.__notekitApp.addons.addonCenter.show(); window.__notekitApp.addons.addonCenter.show()`)
  await new Promise(resolve => setTimeout(resolve, 500))
  await check(`document.querySelectorAll('.addon-center-wrap').length === 1`)
  await click(input)
  await check(`document.activeElement === document.querySelector('${input}')`)
  await c.call('Input.insertText', { text: 'CSS' }) // No keyup: covers paste and IME commit input.
  await pause()
  await check(`document.querySelectorAll('.addon-row').length > 0 && [...document.querySelectorAll('.addon-row')].every(el=>/CSS/i.test(el.textContent))`)
  await click('.addon-row')
  await check(`!!document.querySelector('.addon-detail h1') && document.querySelector('${input}').value === 'CSS'`)
  await click(input)
  await check(`document.activeElement === document.querySelector('${input}')`)
  await click('.addon-search-wrap button')
  await c.call('Input.insertText', { text: '自定义' })
  await pause()
  await check(`document.querySelectorAll('.addon-row').length >= 2`)
  await click('.addon-filters button:nth-child(2)')
  await check(`[...document.querySelectorAll('.addon-row')].every(el=>el.querySelector('.addon-status'))`)
  await click('.addon-search-wrap button')
  await c.call('Input.insertText', { text: 'zz-no-plugin-matches' })
  await pause()
  await check(`!!document.querySelector('.addon-no-results') && document.querySelectorAll('.addon-filters button').length === 4`)
  await click('.addon-search-wrap button')
  await check(`document.querySelector('.addon-filters button:nth-child(2)').getAttribute('aria-pressed') === 'true'`)
  // Outside clicks must not dismiss plugin management.
  await c.call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: 4, y: 4 })
  await c.call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: 4, y: 4 })
  await pause()
  await check(`!!document.querySelector('.addon-center-wrap')`)
  await click('.addon-filters button:first-child')
  await c.evaluate(`window.__notekitApp.addons.nightMode.isNightMode=false; window.__notekitApp.addons.nightMode.takeEffect()`)
  await screenshot('light')
  await c.evaluate(`window.__notekitApp.addons.nightMode.isNightMode=true; window.__notekitApp.addons.nightMode.takeEffect()`)
  await screenshot('night')
  await c.call('Emulation.setDeviceMetricsOverride', { width: 560, height: 720, deviceScaleFactor: 1, mobile: false })
  await pause()
  await check(`(()=>{const p=document.querySelector('.addon-center-dialog .MuiDialog-paper').getBoundingClientRect();return p.left >= 0 && p.right <= innerWidth})()`)
  await screenshot('narrow')
  await c.call('Emulation.clearDeviceMetricsOverride')
  await c.evaluate(`window.__notekitApp.addons.nightMode.isNightMode=false; window.__notekitApp.addons.nightMode.takeEffect()`)
  await c.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await pause()
  await check(`!document.querySelector('.addon-center-wrap') && !window.__notekitApp.addons.addonCenter.isDialogOpen`)
  await c.evaluate(`window.__notekitApp.addons.addonCenter.show()`)
  await pause()
  await click('.addon-center-dialog button[aria-label="close"]')
  await check(`!document.querySelector('.addon-center-wrap')`)
  const errors = c.events.filter(e => e.method === 'Runtime.exceptionThrown')
  assert.equal(errors.length, 0, JSON.stringify(errors))
  const result = { passed: true, checks: ['click/focus', 'paste input', 'Chinese input', 'detail retains search', 'status filters', 'empty state', 'outside click', 'light/night/narrow layouts', 'Escape', 'close/reopen'], errors }
  writeFileSync(new URL('runtime.json', output), JSON.stringify(result, null, 2))
  console.log(result)
} finally { c.close() }
