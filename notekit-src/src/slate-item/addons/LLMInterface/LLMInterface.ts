import { mkid } from '@/slate-item/utils/string/mkid'
import { App, NewAddonParams, IAddon } from '../../engine/App'
import { ItemWithReminder } from '../DateTool/Reminder/Reminder'
import { time } from '@/slate-item/utils/date/time'
import { ItemReadingProps } from '../DbMemory/DbMemory'
import { ExportFormat } from '../Exports/Exports'
import { ExportHandlerParamsIn } from '../Exports/as'
import { datekit, YYYY_MM_DD } from '@/slate-item/utils/date/datekit'
import type { KyString } from '../../interfaces/unit'
import type { LogicString } from '../Traits/Logic'
import { recur, RecurItem } from '@/slate-item/utils/recur'
import { deepClone } from '@/slate-item/utils/object/deepClone'
import { isEmpty } from 'lodash'
import { Orderby } from '../Sorter/Sorter'
import { itemToMarkdown } from '../Exports/helper'
import { Item, ItemNode } from '@/slate-item'
import { RepeatPlanProps } from '../DateTool/Reminder/countdown'
import { Node } from 'slate'
import { md2outline } from '../Paste/helper'

interface SaveItemRequest {
  ky?: string           // present = modify, absent = create
  text?: string         // plain text content (triggers compat conversion)
  reminder?: string     // NLP reminderStr, parsed via /api/parse-task/
}

export function createLLMInterfaceAddon({ $ }: NewAddonParams) {
  class LLMInterface implements IAddon {
    app!: App

    exportMarkdownForLLM(original: UnitPersist, neededProps: string[] | undefined): string {
      if (isEmpty(original)) return ''
      if (!neededProps) neededProps = ['ky'];
      if (!neededProps.includes('ky')) neededProps.push('ky')
      const convert = (item: UnitPersist) => Item.headString(item, { rich: true, parseRefer: true, metaDataForLLM: neededProps })
      return itemToMarkdown(original, 0, { convert })
    }

    exportNodeListToMarkdownForLLM(nodes: UnitPersist[], neededProps: (string | ((item: UnitPersist) => string))[] | undefined): string {
      if (!neededProps) neededProps = ['ky'];
      if (!neededProps.includes('ky')) neededProps.push('ky')
      const convert = (item: UnitPersist) => Item.headString(item, { rich: true, parseRefer: true, metaDataForLLM: neededProps })
      return nodes.map(node => itemToMarkdown(node as UnitPersist, 0, { convert })).join('===\n\n')
    }

    // Reminder Proxies

    toNextDue(ky: string, fromDate: YYYY_MM_DD) {
      const latestNode = deepClone($.dbMemory.getItem(ky)) as ItemWithReminder
      const plan = latestNode.reminder?.plans?.[0]
      if (!plan || !['interval', 'weekly', 'monthly', 'yearly'].includes(plan.repeatPlan)) {
        throw new Error('toNextDue only works on repeating reminders (interval/weekly/monthly/yearly)')
      }
      const computedDueDate = $.reminder.calcDueDate(latestNode, fromDate)
      const nextDay = datekit(computedDueDate).add(1, 'day').format(YYYY_MM_DD)
      const nextDue = $.reminder.calcDueDate(latestNode, nextDay)
      latestNode.reminder.plans[0].dueDate = nextDue
      $.dbMemory.saveItem(latestNode)
      return $.llmInterface.exportMarkdownForLLM(latestNode, ['ky', 'reminder'])
    }

    getDueItems(fmtDate: YYYY_MM_DD) {
      const original = $.reminder.getDueItems(fmtDate)
      $.sorter.sortItems(original, false, ['$reminder', 'asc', fmtDate])
      return $.llmInterface.exportNodeListToMarkdownForLLM(original, [(item) => {
        const day = $.reminder.calcDueDays(item, fmtDate)
        if (day === 0) return '今日到期'
        if (day > 0) return `${day}日后到期`
        if (day < 0) return `${-day}日前到期`
        return ''
      }, 'reminder', 'ky', 'path'])
    }

    // ─── dbMemory proxies ───

    getItem(ky: KyString, options?: ItemReadingProps & { neededProps?: string[] }) {
      const original = $.dbMemory.getItem(ky, options ?? {})
      return $.llmInterface.exportMarkdownForLLM(original, options?.neededProps)
    }

    // ─── search proxy ───

    findAll(
      condition: LogicString,
      options?: {
        limit?: number
        isRecur?: boolean
        readTrash?: boolean
        orderBy?: Orderby
        neededProps?: string[]
      }
    ) {
      let { orderBy, ...searchOptions } = options ?? {}
      let neededProps = options?.neededProps ?? []
      if (orderBy) {
        let originalLimit = searchOptions.limit
        searchOptions.limit = Infinity
        const original = $.search.findAll(condition, searchOptions)
        $.sorter.sortItems(original, false, orderBy)
        if (originalLimit !== undefined) {
          return $.llmInterface.exportNodeListToMarkdownForLLM(original.slice(0, originalLimit), neededProps)
        }
        return $.llmInterface.exportNodeListToMarkdownForLLM(original, neededProps)
      }
      return $.llmInterface.exportNodeListToMarkdownForLLM($.search.findAll(condition, searchOptions), neededProps)
    }

    // ─── save ───

    revertTable: Record<string, UnitPersist> = {}
    leavesReadTable: Record<string, true> = {}

    clearRevertTable() {
      for (const ky of Object.keys(this.revertTable)) {
        delete this.revertTable[ky]
      }
    }

    // ─── saveItems: batch create & modify ───

    async saveItems(items: SaveItemRequest[]): Promise<string> {
      // 1. Validate: no duplicate ky with conflicting fields
      const kyGroups: Record<string, SaveItemRequest> = {}
      const creates: SaveItemRequest[] = []

      for (const item of items) {
        if (!item.ky) {
          creates.push(item)
          continue
        }
        if (kyGroups[item.ky]) {
          const existing = kyGroups[item.ky]
          // Conflict check: same field set twice on same ky
          if (item.text !== undefined && existing.text !== undefined && item.text !== existing.text) {
            throw new Error(`Conflict: ky ${item.ky} has two different text values`)
          }
          if (item.reminder !== undefined && existing.reminder !== undefined && item.reminder !== existing.reminder) {
            throw new Error(`Conflict: ky ${item.ky} has two different reminder values`)
          }
          Object.assign(existing, item)
        } else {
          kyGroups[item.ky] = { ...item }
        }
      }

      // 2. Clear previous revert table
      this.clearRevertTable()

      const results: string[] = []

      // 3. Process creates
      for (const request of creates) {
        const newItem: Partial<UnitPersist> = {}
        const timestamp = time()
        newItem.ky = mkid()
        newItem.pky = $.reminder.fmtToday
        newItem.created = timestamp
        newItem.updated = timestamp
        newItem.weight = timestamp
        newItem.layout = ''

        if (request.text) {
          newItem.ori = request.text
          // Convert text to leaves via compat
          Object.assign(newItem, $.compat.convertItem(newItem as UnitPersist))
        }

        if (request.reminder) {
          const itemWithReminder = newItem as ItemWithReminder
          const parsed = await this.parseReminder(request.reminder)
          itemWithReminder.reminder = { plans: [parsed] }
        }

        $.dbMemory.saveItem(newItem as UnitPersist)
        results.push(`Created: ${$.llmInterface.exportMarkdownForLLM(newItem as UnitPersist, request.reminder ? ['ky', 'reminder'] : ['ky'])}`)
      }

      // 4. Process modifications
      for (const [ky, request] of Object.entries(kyGroups)) {
        const existing = $.dbMemory.getItem(ky)
        if (!existing) {
          throw new Error(`Node not found: ${ky}`)
        }

        // Snapshot for revert
        this.revertTable[ky] = deepClone(existing)

        const merged = deepClone(existing)
        merged.updated = time()

        // Text update
        if (request.text !== undefined) {
          const isSimpleItem = merged.leaves.every(
            (leaf: any) => {
              if (
                (Object.keys(leaf).length === 1 && 'text' in leaf) || // 只有 text 字段
                ['bilink', 'tag', 'codeblock', 'latex'].includes(leaf.blockType) // 支持与 Markdown 互转的特殊块
              ) {
                return true
              }
              return false
            }
          )
          if (!isSimpleItem) {
            results.unshift(`Error: Node ${ky} has complex leaves. Use getLeavesForEdit + updateLeaves instead.`)
          }
          merged.ori = request.text
          merged.leaves = $.compat.convertText({} as UnitPersist, request.text)
        }

        // Reminder update
        if (request.reminder !== undefined) {
          const itemWithReminder = merged as Partial<ItemWithReminder>
          if (request.reminder === '') {
            // Empty string = remove reminder
            delete itemWithReminder.reminder
          } else {
            const parsed = await this.parseReminder(request.reminder)
            itemWithReminder.reminder = { plans: [parsed] }
          }
        }

        $.dbMemory.saveItem(merged)
        results.push(`Modified: ${$.llmInterface.exportMarkdownForLLM(merged, request.reminder ? ['ky', 'reminder'] : ['ky'])}`)
      }

      return results.join('\n')
    }

    // ─── getLeavesForEdit / updateLeaves ───

    getLeavesForEdit(ky: string): Node[] {
      const item = $.dbMemory.getItem(ky)
      if (!item) throw new Error(`Node not found: ${ky}`)
      this.leavesReadTable[ky] = true
      return deepClone(item.leaves)
    }

    updateLeaves(ky: string, leaves: Node[]) {
      if (!this.leavesReadTable[ky]) {
        throw new Error(
          `Must call getLeavesForEdit('${ky}') before updateLeaves. This is required to ensure you have seen the original leaves.`
        )
      }
      delete this.leavesReadTable[ky]

      const existing = $.dbMemory.getItem(ky)
      if (!existing) throw new Error(`Node not found: ${ky}`)

      this.clearRevertTable()
      this.revertTable[ky] = deepClone(existing)

      const merged = deepClone(existing)
      merged.leaves = leaves
      merged.updated = time()

      $.dbMemory.saveItem(merged)
      return {success: true}
    }

    // ─── revert ───

    revertItem(ky: string): UnitPersist {
      const original = this.revertTable[ky]
      if (!original) {
        throw new Error(`No revert snapshot for ky ${ky}`)
      }
      $.dbMemory.saveItem(original)
      delete this.revertTable[ky]
      return original
    }

    revertAll(): string[] {
      const reverted: string[] = []
      for (const [ky, original] of Object.entries(this.revertTable)) {
        $.dbMemory.saveItem(original)
        reverted.push(ky)
      }
      this.clearRevertTable()
      return reverted
    }

    async parseReminder(reminderStr: string): Promise<RepeatPlanProps> {
      const res = await fetch(`/api/parse-task/?content=${encodeURIComponent(reminderStr)}`)
      const data = await res.json()
      const plan = data.tasks[0]
      delete plan.ori
      return plan as RepeatPlanProps
    }

    async importMarkdown(markdown: string, pky?: string): Promise<{ parentKy?: string, success: boolean } | undefined> {
      const result = md2outline(markdown)
      if (!isEmpty(result)) {
        let parentItem = pky ? $.dbMemory.getItem(pky, { isRecur: true, maxDepth: 1 }) : undefined
        if (!parentItem) {
          const t = time()
          if (!$.dbMemory.getItem($.reminder.fmtToday)) $.daily.createTopic($.reminder.fmtToday)
          parentItem = {
            ky: mkid(),
            pky: $.reminder.fmtToday,
            created: t,
            updated: t,
            weight: t,
            layout: '',
            leaves: $.compat.convertText({} as UnitPersist, `[[Imported by AI]] (${new Date().toLocaleString()})`),
          } as UnitPersist
          pky = parentItem.ky
        }
        recur(result as any, (item: UnitPersist) => {
          const v2item = $.compat.convertItem(item as any)
          Object.assign(item, v2item)
        })
        parentItem.subitems = parentItem.subitems ? (parentItem.subitems as UnitPersist[]).concat(result.subitems as any) : result.subitems
        const final = Item.resolvePkyAndWeight(parentItem as ItemNode)
        $.dbMemory.saveItem(final, { isRecur: true })
        return { parentKy: pky, success: true }
      }
    }

    addonRun() {}
  }

  return new LLMInterface()
}
