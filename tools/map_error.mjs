#!/usr/bin/env node
/**
 * 用 source map 把产物里的行列反查到原始文件。
 *
 * 用法: node map_error.mjs <index-xxx.js.map> <line> <col> [<line> <col> ...]
 * 行列均按 source map 约定：line 从 1 起，col 从 0 起。
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let SourceMapConsumer
try {
  ;({ SourceMapConsumer } = require('source-map-js'))
} catch {
  ;({ SourceMapConsumer } = require('source-map'))
}

const [mapPath, ...pairs] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(mapPath, 'utf8'))

const consumer = await new SourceMapConsumer(raw)
for (let i = 0; i + 1 < pairs.length; i += 2) {
  const line = Number(pairs[i])
  const col = Number(pairs[i + 1])
  const pos = consumer.originalPositionFor({ line, column: col })
  console.log(
    `产物 ${line}:${col}  ->  ${pos.source}:${pos.line}:${pos.column}` +
      (pos.name ? `   (name=${pos.name})` : '')
  )
}
consumer.destroy?.()