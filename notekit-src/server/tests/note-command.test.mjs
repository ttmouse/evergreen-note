import test from 'node:test'
import assert from 'node:assert/strict'
import { verifySaved } from '../note-command.mjs'

const makeGet = (present = ['k1', 'k2', 'group']) => {
  const calls = []
  return { calls, get: (dbid, store, key) => { calls.push(key); return dbid === 'db' && store === 'node' && present.includes(key) ? { ky: key } : undefined } }
}

test('append result verifies group key and every block key', () => {
  const { get } = makeGet()
  verifySaved({ dbid: 'db', saved: true, groupKey: 'group', blockKeys: ['k1', 'k2'] }, get)
  verifySaved({ dbid: 'db', saved: true, groupKey: 'group', blockKeys: [] }, get)
})

test('edit and delete results verify their own key lists', () => {
  const { get } = makeGet()
  verifySaved({ dbid: 'db', saved: true, edited: 2, itemKeys: ['k1', 'k2'] }, get)
  verifySaved({ dbid: 'db', saved: true, deleted: ['k2'] }, get)
})

test('a missing key in any shape fails verification', () => {
  for (const result of [
    { dbid: 'db', saved: true, groupKey: 'group', blockKeys: ['k1', 'gone'] },
    { dbid: 'db', saved: true, groupKey: 'gone', blockKeys: [] },
    { dbid: 'db', saved: true, itemKeys: ['gone'] },
    { dbid: 'db', saved: true, deleted: ['k1', 'gone'] },
  ]) assert.throws(() => verifySaved(result, makeGet().get), /落库核对失败/)
})

test('a saved result without recognizable keys fails, read-only results pass', () => {
  assert.throws(() => verifySaved({ dbid: 'db', saved: true }, makeGet().get), /缺少条目标识/)
  const { get } = makeGet()
  verifySaved({ dbid: 'db', date: '2026-10-05', exists: false, items: [] }, get)
  verifySaved(null, get)
  verifySaved(undefined, get)
})

test('keys are looked up in the result own dbid', () => {
  const { get, calls } = makeGet()
  assert.throws(() => verifySaved({ dbid: 'other', saved: true, deleted: ['k1'] }, get), /落库核对失败/)
  assert.deepEqual(calls, ['k1'])
})
