// Runs inside the existing renderer. Never writes SQLite behind its live memory.
async function runNoteCommand(input) {
  const $ = window.__notekitApp?.addons
  if (!$?.dbDisk || !$?.dbMemory || !$?.libAdmin?.current) throw new Error('应用尚未就绪，请稍后重试')
  if (!input || typeof input !== 'object') throw new Error('笔记命令格式无效')
  if (input.action === 'status') return { ready: true, dbid: $.libAdmin.current.ky, mode: $.dbDisk.storageMode }
  if (!['read', 'append', 'appendTree', 'createTopic', 'search', 'get', 'edit', 'delete', 'topic', 'tag'].includes(input.action)) throw new Error('不支持的笔记命令')
  const isNormal = x => x.status === 1 || x.status == null
  // 输出清洗：复选框条目的 ori 带 "[ ] " 标记，text 给纯文字，raw 保留原始内容；附带时间戳。
  const shape = x => {
    const box = (x.leaves || []).some(leaf => $.checkbox?.verify?.(leaf) === true)
    const text = box ? String(x.ori || '').replace(/^\s*\[[ xX]\]\s*/, '').trim() : x.ori
    const bilinks = (x.leaves || []).filter(leaf => $.bilink?.verify?.(leaf)).map(leaf => $.bilink.string(leaf))
    return {
      ky: x.ky, pky: x.pky, text,
      ...(text !== x.ori ? { raw: x.ori } : {}),
      checkbox: box,
      bold: (x.leaves || []).some(leaf => leaf?.bold === true),
      ...(bilinks.length ? { bilinks } : {}),
      ...(x.created != null ? { created: x.created } : {}),
      ...(x.updated != null ? { updated: x.updated } : {}),
      ...(x.subitems ? { subitems: x.subitems.map(shape) } : {}),
    }
  }
  const tree = (ky, depth) => $.dbMemory.getSubitems(ky, { isRecur: true, maxDepth: depth })
  const displayText = text => text.replace(/\[\[([^\[\]]+)\]\]/g, (raw, target) => target.trim() ? target.trim() : raw)
  const richLeaves = (text, bold = false, prefix = '') => {
    const source = prefix + text
    const pattern = /\[\[([^\[\]]+)\]\]/g
    const leaves = []
    let cursor = 0
    let match
    while ((match = pattern.exec(source))) {
      const target = match[1].trim()
      if (!target) continue
      if (!$.bilink?.createElement) throw new Error('当前未启用双向链接功能，无法保存 [[主题名]]')
      if (match.index > cursor) leaves.push({ text: source.slice(cursor, match.index), ...(bold ? { bold: true } : {}) })
      leaves.push($.bilink.createElement({ topic: target }))
      cursor = pattern.lastIndex
    }
    if (cursor < source.length || leaves.length === 0) leaves.push({ text: source.slice(cursor), ...(bold ? { bold: true } : {}) })
    return leaves
  }
  const bilinkMentions = leaves => leaves.filter(leaf => $.bilink?.verify?.(leaf)).map(leaf => $.bilink.string(leaf))
  if (input.dbid !== $.libAdmin.current.ky) throw new Error('当前知识库与指定知识库不一致，未执行操作')
  const guardReady = () => {
    if (input.dbid !== $.libAdmin.current.ky || ($.dbMemory.canSave && !$.dbMemory.canSave())) throw new Error('知识库正在切换或加载，未执行操作，请稍后重试')
  }
  const date = input.date
  if (input.action === 'search') {
    if (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 200) throw new Error('需要 1-200 字的搜索关键词')
    const limit = Number.isInteger(input.limit) && input.limit > 0 && input.limit <= 200 ? input.limit : 50
    const query = input.query.toLowerCase()
    const items = []
    for (const item of Object.values($.dbMemory.nodes)) {
      // 老条目可能没有 status 字段（undefined = 正常），只排除回收站/隐藏/临时。
      if (item.status === -1 || item.status === -2 || item.status === 2 || item.status === 99) continue
      if (typeof item.ori !== 'string') continue
      if (!item.ori.toLowerCase().includes(query)) continue
      const box = (item.leaves || []).some(leaf => $.checkbox?.verify?.(leaf) === true)
      const text = box ? String(item.ori || '').replace(/^\s*\[[ xX]\]\s*/, '').trim() : item.ori
      items.push({ ky: item.ky, pky: item.pky, text, checkbox: box, ...(item.created != null ? { created: item.created } : {}) })
      if (items.length >= limit) break
    }
    return { dbid: input.dbid, query: input.query, total: items.length, items }
  }
  if (input.action === 'get') {
    if (typeof input.ky !== 'string' || !input.ky.trim() || input.ky.length > 100) throw new Error('需要有效的 --ky 节点ID')
    const depth = Number.isInteger(input.depth) && input.depth >= 0 && input.depth <= 5 ? input.depth : 1
    const item = $.dbMemory.getItem(input.ky)
    if (!item?.ky) throw new Error('节点不存在：' + input.ky)
    return { dbid: input.dbid, item: shape({ ...item, subitems: tree(input.ky, depth) }) }
  }
  if (input.action === 'topic') {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200) throw new Error('需要有效的主题名')
    const depth = Number.isInteger(input.depth) && input.depth >= 0 && input.depth <= 5 ? input.depth : 2
    const topic = $.dbMemory.getTopic(input.name)
    if (!topic?.ky) return { dbid: input.dbid, name: input.name, exists: false }
    return { dbid: input.dbid, exists: true, item: shape({ ...topic, subitems: tree(topic.ky, depth) }) }
  }
  if (input.action === 'createTopic') {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 200) throw new Error('需要 1-200 字的主题名')
    await $.dbDisk.flush()
    guardReady()
    const name = input.name.trim()
    const existing = $.dbMemory.getTopic(name)
    if (existing?.ky) return { dbid: input.dbid, name, topicKey: existing.ky, exists: true, created: false, reused: true, saved: true }
    const topic = $.topic.createTopic(name)
    if (!topic?.ky) throw new Error('主题创建失败：' + name)
    await $.dbDisk.flush()
    guardReady()
    const persisted = $.dbMemory.getItem(topic.ky)
    if (!persisted?.ky || !persisted.isTopic) throw new Error('主题落库核对失败：' + name)
    return { dbid: input.dbid, name, topicKey: topic.ky, exists: true, created: true, reused: false, saved: true }
  }
  if (input.action === 'tag') {
    if (typeof input.tag !== 'string' || !input.tag.trim() || input.tag.length > 100) throw new Error('需要有效的标签名')
    const limit = Number.isInteger(input.limit) && input.limit > 0 && input.limit <= 200 ? input.limit : 50
    // tags 是延迟索引，headless 路径可能没构建；先试索引，为空则回退全量扫描（键与查询都去掉 # 前后缀）。
    const key = input.tag.replace(/^#+|#+$/g, '')
    let map = {}
    try { if (!$.dbMemory.indexedTypes?.includes?.('tags')) $.dbMemory.delayedIndex?.('tags') } catch {}
    try { map = $.dbMemory.indexed?.tags?.[key] || $.dbMemory.indexed?.tags?.[input.tag] || {} } catch {}
    let list = Object.values(map)
    if (list.length === 0) {
      for (const item of Object.values($.dbMemory.nodes)) {
        if ((item.status !== 1 && item.status != null) || !Array.isArray(item.tags)) continue
        if (item.tags.some(t => String(t).replace(/^#+|#+$/g, '') === key)) {
          list.push(item)
          if (list.length >= limit) break
        }
      }
    }
    const items = list.filter(isNormal).slice(0, limit).map(shape)
    return { dbid: input.dbid, tag: input.tag, total: items.length, items }
  }
  if (['read', 'append'].includes(input.action) && !input.under && !input.topicName) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(new Date(date).getTime()) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('需要有效的 YYYY-MM-DD 日期')
  }
  if (input.action === 'read') {
    const topic = $.topic.getTopic(date)
    return { dbid: input.dbid, date, exists: !!topic?.ky, items: topic?.ky ? $.dbMemory.getSubitems(topic.ky).map(shape) : [] }
  }
  if (input.action === 'append') {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 500 ||
        !/^[a-f0-9]{64}$/.test(input.requestId) || !Array.isArray(input.blocks) ||
        input.blocks.length < 1 || input.blocks.length > 100 ||
        input.blocks.some(x => !x || typeof x.text !== 'string' || !x.text.trim() || x.text.length > 10000 ||
          (x.checkbox !== undefined && typeof x.checkbox !== 'boolean') ||
          (x.bold !== undefined && typeof x.bold !== 'boolean'))) throw new Error('标题、条目或请求标识无效')
    if (input.blocks.some(x => x.checkbox) && !$.checkbox?.createElement) throw new Error('当前未启用复选框功能')
    await $.dbDisk.flush()
    guardReady()
    // 父级三选一：--under 节点 / --topic 主题名 / --date 日记（默认）
    let parentKy
    if (input.under) {
      if (typeof input.under !== 'string' || input.under.length > 100) throw new Error('under 需为有效节点ID')
      const parent = $.dbMemory.getItem(input.under)
      if (!parent?.ky) throw new Error('父节点不存在：' + input.under)
      if (!isNormal(parent)) throw new Error('父节点不在正常状态，拒绝追加：' + input.under)
      parentKy = parent.ky
    } else if (input.topicName) {
      if (typeof input.topicName !== 'string' || !input.topicName.trim() || input.topicName.length > 200) throw new Error('topicName 需为有效主题名')
      const t = $.dbMemory.getTopic(input.topicName)
      if (!t?.ky) throw new Error('主题不存在：' + input.topicName + '（可先用 get --topic 确认）')
      parentKy = t.ky
    } else {
      // 收敛 --date 爆栈面：不再走 $.daily.createTopic（其内部 format 换算/创建链路在 headless 下会递归爆栈），
      // 改用与 read 相同的只读查询；日记不存在时明确报错，让用户先打开该日记或改用 --under。
      const topic = $.topic.getTopic(date)
      if (!topic?.ky) throw new Error('该日期日记不存在：' + date + '（请先在应用中打开该日记，或改用 --under/--topic）')
      parentKy = topic.ky
    }
    const groupKey = 'auto-' + input.requestId
    const existing = $.dbMemory.getItem(groupKey)
    if (existing?.ky && (existing.automationRequestId !== input.requestId || existing.pky !== parentKy)) throw new Error('请求标识冲突，未覆盖现有笔记')
    let created = 0
    const add = (ky, pky, text, weight, checkbox = false, bold = false) => {
      const old = $.dbMemory.getItem(ky)
      if (old?.ky) {
        if (old.automationRequestId !== input.requestId || old.pky !== pky) throw new Error('条目标识冲突，未覆盖现有内容')
        return
      }
      const leaves = checkbox ? [{ text: '' }, $.checkbox.createElement({ value: false }), ...richLeaves(text, bold, ' ')] : richLeaves(text, bold)
      const mentions = bilinkMentions(leaves)
      const saved = $.dbMemory.saveItem({ ky, pky, ori: checkbox ? '[ ] ' + displayText(text) : displayText(text), leaves, ...(mentions.length ? { mentions } : {}), weight, status: 1, automationRequestId: input.requestId })
      if (!saved?.ky) throw new Error('当前笔记暂不可保存，请稍后重试')
      created++
    }
    const siblings = $.dbMemory.getSubitems(parentKy)
    add(groupKey, parentKy, input.title, Math.max(0, ...siblings.map(x => x.weight || 0)) + 1000)
    const blockKeys = input.blocks.map((block, i) => {
      const ky = groupKey + '-' + i
      add(ky, groupKey, block.text, (i + 1) * 1000, block.checkbox === true, block.bold === true)
      return ky
    })
    await $.dbDisk.flush()
    return { dbid: input.dbid, ...(parentKy === date ? { date } : { parent: parentKy }), groupKey, blockKeys, created, reused: created === 0, saved: true }
  }
  if (input.action === 'appendTree') {
    // 嵌套树一次事务写入：tree = {text, bold?, checkbox?, children?: [...]}
    // 子节点 ky 按路径编号（root-0、root-0-1…），同 requestId 重放幂等；
    // --date 只读已存在日记（$.topic.getTopic，只读路径已验证安全），不自动创建，绕开 daily.createTopic 的爆栈问题。
    const MAX_NODES = 500, MAX_DEPTH = 5
    if (!input.tree || typeof input.tree !== 'object' || Array.isArray(input.tree)) throw new Error('appendTree 需要 tree: {text, bold?, checkbox?, children?}')
    if (!/^[a-f0-9]{64}$/.test(input.requestId)) throw new Error('请求标识无效')
    let nodeCount = 0
    const validateTree = (node, depth) => {
      if (!node || typeof node !== 'object' || typeof node.text !== 'string' || !node.text.trim() || node.text.length > 10000) throw new Error('树节点需要 1-10000 字的 text')
      if (node.bold !== undefined && typeof node.bold !== 'boolean') throw new Error('bold 需为布尔')
      if (node.checkbox !== undefined && typeof node.checkbox !== 'boolean') throw new Error('checkbox 需为布尔')
      if (node.children !== undefined && !Array.isArray(node.children)) throw new Error('children 需为数组')
      if (++nodeCount > MAX_NODES) throw new Error('树节点总数超过 ' + MAX_NODES)
      if (depth > MAX_DEPTH) throw new Error('树深度超过 ' + MAX_DEPTH)
      for (const child of node.children || []) validateTree(child, depth + 1)
    }
    validateTree(input.tree, 1)
    if (input.tree.checkbox && !$.checkbox?.createElement) throw new Error('当前未启用复选框功能')
    await $.dbDisk.flush()
    guardReady()
    let parentKy
    if (input.under) {
      if (typeof input.under !== 'string' || input.under.length > 100) throw new Error('under 需为有效节点ID')
      const parent = $.dbMemory.getItem(input.under)
      if (!parent?.ky) throw new Error('父节点不存在：' + input.under)
      if (!isNormal(parent)) throw new Error('父节点不在正常状态，拒绝追加：' + input.under)
      parentKy = parent.ky
    } else if (input.topicName) {
      if (typeof input.topicName !== 'string' || !input.topicName.trim() || input.topicName.length > 200) throw new Error('topicName 需为有效主题名')
      const t = $.dbMemory.getTopic(input.topicName)
      if (!t?.ky) throw new Error('主题不存在：' + input.topicName)
      parentKy = t.ky
    } else {
      if (typeof date !== 'string') throw new Error('appendTree 需要 under/topicName/date 之一')
      const topic = $.topic.getTopic(date)
      if (!topic?.ky) throw new Error('该日期日记不存在：' + date + '（请先在应用中打开该日记，或改用 --under）')
      parentKy = topic.ky
    }
    const rootKey = 'auto-' + input.requestId
    const existing = $.dbMemory.getItem(rootKey)
    if (existing?.ky && (existing.automationRequestId !== input.requestId || existing.pky !== parentKy)) throw new Error('请求标识冲突，未覆盖现有笔记')
    let created = 0
    const keys = []
    const addNode = (ky, pky, node, weight) => {
      const old = $.dbMemory.getItem(ky)
      if (old?.ky) {
        if (old.automationRequestId !== input.requestId || old.pky !== pky) throw new Error('条目标识冲突，未覆盖现有内容')
      } else {
        const checkbox = node.checkbox === true
        const bold = node.bold === true
        const leaves = checkbox ? [{ text: '' }, $.checkbox.createElement({ value: false }), ...richLeaves(node.text, bold, ' ')] : richLeaves(node.text, bold)
        const mentions = bilinkMentions(leaves)
        const saved = $.dbMemory.saveItem({ ky, pky, ori: checkbox ? '[ ] ' + displayText(node.text) : displayText(node.text), leaves, ...(mentions.length ? { mentions } : {}), weight, status: 1, automationRequestId: input.requestId })
        if (!saved?.ky) throw new Error('当前笔记暂不可保存，请稍后重试')
        created++
      }
      keys.push(ky)
      ;(node.children || []).forEach((child, i) => addNode(ky + '-' + i, ky, child, (i + 1) * 1000))
    }
    const siblings = $.dbMemory.getSubitems(parentKy)
    addNode(rootKey, parentKy, input.tree, Math.max(0, ...siblings.map(x => x.weight || 0)) + 1000)
    await $.dbDisk.flush()
    // groupKey/blockKeys 为兼容落库核对层（verifySaved 只认这三个字段名）；rootKey/keys 是全量节点。
    return { dbid: input.dbid, ...(parentKy === date ? { date } : { parent: parentKy }), rootKey, groupKey: rootKey, blockKeys: keys, keys, created, reused: created === 0, saved: true }
  }
  if (input.action === 'edit') {
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100 ||
        input.items.some(x => !x || typeof x.ky !== 'string' || !x.ky.trim() || x.ky.length > 100 ||
          typeof x.text !== 'string' || !x.text.trim() || x.text.length > 10000 ||
          (x.checkbox !== undefined && typeof x.checkbox !== 'boolean') ||
          (x.bold !== undefined && typeof x.bold !== 'boolean'))) throw new Error('编辑条目无效：items 需为 1-100 条 {ky, text, checkbox?, bold?}')
    if (input.items.some(x => x.checkbox === true) && !$.checkbox?.createElement) throw new Error('当前未启用复选框功能')
    await $.dbDisk.flush()
    guardReady()
    let edited = 0
    let unchanged = 0
    for (const one of input.items) {
      const item = $.dbMemory.getItem(one.ky)
      if (!item?.ky) throw new Error('节点不存在：' + one.ky)
      const existingBox = (item.leaves || []).find(leaf => $.checkbox?.verify?.(leaf) === true)
      const checkbox = typeof one.checkbox === 'boolean' ? one.checkbox : !!existingBox
      const ori = checkbox ? '[ ] ' + one.text : one.text
      const bold = one.bold === true
      const existingBold = (item.leaves || []).some(leaf => leaf?.bold === true)
      // 内容、复选框、加粗都没变时跳过：saveItem 对无变化条目不落库，不要误报失败。
      if ((item.ori || '') === ori && checkbox === !!existingBox && bold === existingBold) { unchanged++; continue }
      const box = checkbox ? (existingBox ? { ...existingBox } : $.checkbox.createElement({ value: false })) : null
      const bodyLeaf = bold ? { text: one.text, bold: true } : { text: one.text }
      const leaves = checkbox ? [{ text: '' }, box, { text: ' ' + one.text, ...(bold ? { bold: true } : {}) }] : [bodyLeaf]
      $.dbMemory.saveItem({ ...item, ori, leaves })
      const after = $.dbMemory.getItem(one.ky)
      if (!after?.ky || (after.ori || '') !== ori) throw new Error('当前笔记暂不可保存，请稍后重试')
      edited++
    }
    await $.dbDisk.flush()
    return { dbid: input.dbid, edited, unchanged, itemKeys: input.items.map(x => x.ky), saved: true }
  }
  if (input.action === 'delete') {
    if (!Array.isArray(input.kys) || input.kys.length < 1 || input.kys.length > 100 ||
        input.kys.some(ky => typeof ky !== 'string' || !ky.trim() || ky.length > 100)) throw new Error('删除条目无效：kys 需为 1-100 个节点ID')
    await $.dbDisk.flush()
    guardReady()
    const deleted = []
    for (const ky of input.kys) {
      const item = $.dbMemory.getItem(ky)
      if (!item?.ky) throw new Error('节点不存在：' + ky)
      if (!item.pky && input.recurse !== true) throw new Error('拒绝删除无父节点的主题节点：' + ky + '（如需删除请加 recurse）')
      // 真实 DbMemory 的 deleteItem 返回值不可靠（reactive has 陷阱会隐藏已删节点），以删除后的状态为准。
      $.dbMemory.deleteItem(ky, { isRecur: input.recurse === true })
      const after = $.dbMemory.getItem(ky)
      if (after?.ky && after.status === 1) throw new Error('删除失败：' + ky)
      deleted.push(ky)
    }
    await $.dbDisk.flush()
    return { dbid: input.dbid, deleted, saved: true }
  }
  throw new Error('不支持的笔记命令')
}
module.exports = { runNoteCommand }
