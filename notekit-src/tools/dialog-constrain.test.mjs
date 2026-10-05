/** NUI Dialog 拖动约束的纯函数单测。
 * 运行：node --test tools/dialog-constrain.test.mjs
 * （用 tsc 把 dialogConstrain.ts 编到临时目录后 import，避免引入 TS 运行时依赖。）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const srcFile = path.join(
  root,
  'src',
  'slate-item',
  'notekit-ui',
  'components',
  'Dialog',
  'dialogConstrain.ts'
)

const withCompiled = async fn => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'dialog-constrain-'))
  try {
    await execFileAsync(
      path.join(root, 'node_modules', '.bin', 'tsc'),
      [
        srcFile,
        '--outDir',
        outDir,
        '--module',
        'esnext',
        '--target',
        'es2020',
        '--moduleResolution',
        'bundler',
        '--skipLibCheck',
      ],
      { cwd: root }
    )
    const findFile = async dir => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          const hit = await findFile(full)
          if (hit) return hit
        } else if (entry.name === 'dialogConstrain.js') {
          return full
        }
      }
      return null
    }
    const jsPath = await findFile(outDir)
    assert.ok(jsPath, 'tsc 应产出 dialogConstrain.js')
    const js = await readFile(jsPath, 'utf8').then(text =>
      text.replace(/import \{[^}]*\} from '[^']*';?\n/, '')
    )
    const module = await import(
      'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
    )
    return await fn(module)
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}

/** movable() 对 BoxInfo 的夹取语义（与 helper.tsx 保持一致）：返回夹取后的 {left,top} */
const clampLikeMovable = (box, size, pos) => ({
  left: Math.max(box.left, Math.min(pos.left, box.left + box.width - size.width)),
  top: Math.max(box.top, Math.min(pos.top, box.top + box.height - size.height)),
})

test('约束区域：窗口可以移出左缘，但保留 120px 可操作标题栏', async t => {
  await withCompiled(({ computeDialogMoveConstrainBox, MIN_OPERABLE_HEAD_WIDTH }) => {
    assert.equal(MIN_OPERABLE_HEAD_WIDTH, 120)
    const vw = 1440
    const vh = 900
    const w = 500
    const h = 600
    const box = computeDialogMoveConstrainBox({
      innerWidth: vw,
      innerHeight: vh,
      width: w,
      height: h,
    })
    const pos = clampLikeMovable(box, { width: w, height: h }, { left: -100000, top: 0 })
    // 左边界：-(500-120) = -380 → 视口内保留 120px（含 pin/fold/close）
    assert.equal(pos.left, -(w - MIN_OPERABLE_HEAD_WIDTH))
    assert.ok(pos.left + w === MIN_OPERABLE_HEAD_WIDTH)
    // 上边界：0，标题栏完整可见
    assert.equal(pos.top, 0)
  })
})

test('约束区域：右移/下移与视口对齐，resize 手柄保持可达', async t => {
  await withCompiled(({ computeDialogMoveConstrainBox }) => {
    const vw = 1440
    const vh = 900
    const w = 500
    const h = 600
    const box = computeDialogMoveConstrainBox({
      innerWidth: vw,
      innerHeight: vh,
      width: w,
      height: h,
    })
    const pos = clampLikeMovable(box, { width: w, height: h }, { left: 100000, top: 100000 })
    assert.equal(pos.left, vw - w, '右缘与视口对齐')
    assert.equal(pos.top, vh - h, '下缘与视口对齐')
  })
})

test('约束区域：窗口内自由拖动不受影响', async t => {
  await withCompiled(({ computeDialogMoveConstrainBox }) => {
    const vw = 1440
    const vh = 900
    const w = 500
    const h = 600
    const box = computeDialogMoveConstrainBox({
      innerWidth: vw,
      innerHeight: vh,
      width: w,
      height: h,
    })
    const target = { left: 300, top: 200 }
    const pos = clampLikeMovable(box, { width: w, height: h }, target)
    assert.deepEqual(pos, target, '视口内的位置不被约束改变')
  })
})

test('约束区域：随视口 resize / 缩放变化（模拟 innerWidth/innerHeight 变小）', async t => {
  await withCompiled(({ computeDialogMoveConstrainBox, MIN_OPERABLE_HEAD_WIDTH }) => {
    const w = 500
    const h = 600
    // 用户把窗口停在右下角 (940, 300)，随后视口从 1440x900 缩到 1024x768
    const before = computeDialogMoveConstrainBox({
      innerWidth: 1440,
      innerHeight: 900,
      width: w,
      height: h,
    })
    const after = computeDialogMoveConstrainBox({
      innerWidth: 1024,
      innerHeight: 768,
      width: w,
      height: h,
    })
    const posBefore = clampLikeMovable(before, { width: w, height: h }, { left: 940, top: 300 })
    const posAfter = clampLikeMovable(after, { width: w, height: h }, posBefore)
    assert.ok(posAfter.left <= 1024 - w, '缩小视口后右缘不越界')
    assert.ok(posAfter.top <= 768 - h, '缩小视口后下缘不越界')
    assert.equal(posAfter.left, 1024 - w)
    assert.equal(posAfter.top, 768 - h)
    // 左边界也随宽度重新计算，保留宽度不变
    const posFarLeft = clampLikeMovable(after, { width: w, height: h }, { left: -100000, top: 0 })
    assert.equal(posFarLeft.left, -(w - MIN_OPERABLE_HEAD_WIDTH))
  })
})

test('退化情况：窗口比视口还大时固定在左/上边界，标题栏仍可见', async t => {
  await withCompiled(({ computeDialogMoveConstrainBox, MIN_OPERABLE_HEAD_WIDTH }) => {
    const vw = 800
    const vh = 400
    const w = 1000
    const h = 600
    const box = computeDialogMoveConstrainBox({
      innerWidth: vw,
      innerHeight: vh,
      width: w,
      height: h,
    })
    const pos = clampLikeMovable(box, { width: w, height: h }, { left: -100000, top: -100000 })
    assert.equal(pos.top, 0, '高度超出视口时固定在顶部，标题栏可见')
    assert.equal(pos.left, -(w - MIN_OPERABLE_HEAD_WIDTH), '宽度超出视口时保留 120px 标题栏')
  })
})

test('退化情况：窗口很窄（<120px）时整体留在视口内', async t => {
  await withCompiled(({ computeDialogMoveConstrainBox }) => {
    const vw = 1440
    const vh = 900
    const w = 80
    const h = 200
    const box = computeDialogMoveConstrainBox({
      innerWidth: vw,
      innerHeight: vh,
      width: w,
      height: h,
    })
    const pos = clampLikeMovable(box, { width: w, height: h }, { left: -100000, top: 0 })
    assert.ok(pos.left === 0, '窄窗口不越出左缘')
  })
})
