import React from 'react'
import { $t } from '../../../../i18n'
import { IAddon, App, NewAddonParams } from '../../../engine/App'
import { before } from '../../../engine/helper'
import { datekit, YYYY_MM_DD } from '../../../utils/date/datekit'
import { isEmpty, notEmpty } from '../../../utils/isEmpty'
import { AddonInfo } from '../../AddonCenter/AddonCenterComp'
import { readingPlainText } from '../../Backlink/LinkedReferenceComp'
import { ItemMap } from '../../DbMemory/DbMemory'

declare global {
  interface MemoryIndexed {
    created: { [date: YYYY_MM_DD]: ItemMap }
    updated: { [date: YYYY_MM_DD]: ItemMap }
  }
}

/**
 * 每日动态的阅读式呈现：与「链接到这篇笔记」（backlink-reading）同款卡片网格，
 * 按来源主题分组，卡片 = 主题标题 + 当天创建/更新内容的摘录，点击跳转来源主题。
 */
export function ActivityReadingComp(props: {
  title: string
  items: UnitPersist[]
  pickTime: (item: UnitPersist) => number
  $: any
}) {
  const { title, items, pickTime, $ } = props

  const groups = new Map<
    string,
    { source: UnitPersist; citations: UnitPersist[] }
  >()
  for (const citation of items) {
    if (isEmpty(citation)) continue
    const source =
      citation.isTopic || citation.topic
        ? citation
        : ($.topic.getParentTopicItem(citation) as UnitPersist | null) ?? citation
    if (!source) continue
    const group = groups.get(source.ky) || { source, citations: [] }
    group.citations.push(citation)
    groups.set(source.ky, group)
  }
  if (!groups.size) return null

  const plainText = readingPlainText
  const entries = [...groups.values()].map(({ source, citations }) => {
    const sorted = [...citations].sort((a, b) => pickTime(b) - pickTime(a))
    const excerpts = sorted.map((citation) => {
      const parent = citation.pky ? ($.dbMemory.getItem(citation.pky) as UnitPersist) : null
      const context =
        parent && parent.ky !== source.ky && parent.ky !== citation.ky
          ? plainText(parent)
          : ''
      return [context, plainText(citation)].filter(Boolean).join(' — ')
    })
    return { source, excerpts, last: Math.max(...sorted.map(pickTime)) }
  })
  // 量大时默认折叠：只显示前 N 张卡片，可展开全部（OP-047 追加，2026-10-08）。
  const COLLAPSED_COUNT = 12
  const [expanded, setExpanded] = React.useState(false)
  // 板块级折叠：点标题行收起/展开整个模块（用户要求，2026-10-08）。
  const [sectionOpen, setSectionOpen] = React.useState(true)
  const visible = expanded ? entries : entries.slice(0, COLLAPSED_COUNT)
  const hidden = entries.length - visible.length

  return (
    <section className="backlink-reading" aria-label={title}>
      <h2
        className="backlink-reading-head"
        onClick={() => setSectionOpen((v) => !v)}
      >
        <span className="backlink-reading-caret" data-open={String(sectionOpen)}>
          ▸
        </span>
        {title} <span>{groups.size}</span>
      </h2>
      {sectionOpen && (
        <>
          <div className="backlink-reading-grid">
            {visible.map(({ source, excerpts }) => (
              <button
                key={source.ky}
                className="backlink-reading-entry"
                onClick={(e) =>
                  $.topic.route(source.topic || plainText(source), {}, e.currentTarget)
                }
              >
                <span className="backlink-reading-title">
                  {source.topic || plainText(source)}
                </span>
                <span className="backlink-reading-excerpt">{excerpts.join('\n')}</span>
              </button>
            ))}
          </div>
          {hidden > 0 && (
            <button
              type="button"
              className="backlink-reading-toggle"
              onClick={() => setExpanded(true)}
            >
              {$t('dailyActivity.expand_all', { count: hidden })}
            </button>
          )}
          {expanded && entries.length > COLLAPSED_COUNT && (
            <button
              type="button"
              className="backlink-reading-toggle"
              onClick={() => setExpanded(false)}
            >
              {$t('dailyActivity.collapse')}
            </button>
          )}
        </>
      )}
    </section>
  )
}

export function createDailyActivityAddon({ app, $ }: NewAddonParams) {
  class DailyActivity implements IAddon {
    app!: App
    config = {}

    getUpdatedItems(date: YYYY_MM_DD): UnitPersist[] {
      return date in $.dbMemory.indexed.updated
        ? Object.values($.dbMemory.indexed.updated[date])
        : []
    }

    getCreatedItems(date: YYYY_MM_DD): UnitPersist[] {
      return typeof $.dbMemory.indexed.created === 'object' &&
        date in $.dbMemory.indexed.created
        ? Object.values($.dbMemory.indexed.created[date]).map((item) =>
            $.dbMemory.getItem(item.ky, { isRecur: true })
          )
        : []
    }

    addComponentToEditorView() {
      const CreatedReferenceComp = withActivityReading({
        $,
        title: $t('dailyActivity.created_section'),
        getList: (item) => $.dailyActivity.getCreatedItems(item.ky),
        pickTime: (item) => Number(item.created) || 0,
      })
      $.editorView.addMoreComponent(CreatedReferenceComp)

      const UpdatedReferenceComp = withActivityReading({
        $,
        title: $t('dailyActivity.updated_section'),
        getList: (item) => $.dailyActivity.getUpdatedItems(item.ky),
        pickTime: (item) => Number(item.updated) || 0,
      })
      $.editorView.addMoreComponent(UpdatedReferenceComp)
    }

    addonInfo() {
      return {
        title: $t`dailyActivity.title`,
        quote: $t`dailyActivity.quote`,
        defaultValue: 'off',
        updated: 20221109,
        depend: ['daily'],
        tags: ['time management'],
      }
    }

    addonBeforeRun() {
      before(
        $.daily.addComponentToEditorView,
        $.dailyActivity.addComponentToEditorView
      )

      Object.assign($.dbMemory.indexes, {
        updated: {
          unique: false,
          indexVal(item: UnitPersist) {
            if (!isEmpty(item.updated)) {
              return datekit(item.updated).format(YYYY_MM_DD)
            }
          },
        },
        created: {
          unique: false,
          indexVal(item: UnitPersist) {
            if (!isEmpty(item.created)) {
              return datekit(item.created).format(YYYY_MM_DD)
            }
          },
        },
      })
    }

    addonRun() {
      // Initialization for this DailyActivity
    }
  }

  return { dailyActivity: new DailyActivity() }
}

/**
 * 包一层：无内容时返回 null（不渲染空卡片），与原 withReference 行为一致。
 * 标题里的计数在渲染时由 groups.size 提供，这里只传板块名。
 */
function withActivityReading(params: {
  $: any
  title: string
  getList: (item: UnitPersist) => UnitPersist[]
  pickTime: (item: UnitPersist) => number
}) {
  const Comp = function Comp(props: { item: UnitPersist }) {
    const items = params.getList(props.item).filter(notEmpty)
    if (isEmpty(items)) return null
    return (
      <ActivityReadingComp
        $={params.$}
        title={params.title}
        items={items}
        pickTime={params.pickTime}
      />
    )
  }
  Comp.displayName = 'ActivityReading'
  return Comp
}
