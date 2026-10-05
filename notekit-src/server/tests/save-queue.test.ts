import test from 'node:test'
import assert from 'node:assert/strict'
import { atLater, clearLater, flushLater } from '../../src/slate-item/utils/atLater'

test('exit flush drains both editor and disk queues without executing unrelated work', async () => {
 const events: string[]=[]
 atLater(()=>{events.push('editor');atLater(()=>events.push('disk'),'save-item-fixture',10000)},'editor-save-item-fixture',10000)
 atLater(()=>events.push('unrelated'),'unrelated-fixture',10000)
 await flushLater(['editor-save-item-', 'save-item-'])
 assert.deepEqual(events,['editor','disk'])
 clearLater('unrelated-fixture')
})
test('exit flush persists only the most recent debounced edit', async () => {
 const events: string[]=[]
 atLater(()=>events.push('old'),'save-item-latest',10000)
 atLater(()=>events.push('latest'),'save-item-latest',10000)
 await flushLater(['save-item-'])
 assert.deepEqual(events,['latest'])
})
test('exit flush reports a save failure instead of pretending it succeeded', async () => {
 atLater(()=>{throw new Error('save failed')},'save-item-failure',10000)
 await assert.rejects(flushLater(['save-item-']),/save failed/)
})
