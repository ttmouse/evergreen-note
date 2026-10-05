import React from 'react'
import { icons } from '../../../components/SvgIcon'
import { $t } from '../../../i18n'
import { App, NewAddonParams, IAddon } from '../../engine/App'
import { Item } from '../../interfaces/item'

export type { NetEdge, NetNode } from './GraphDataIndex'
import { GraphDataIndex } from './GraphDataIndex'
import { pub } from '../../utils/pub'
import { NetworkGraphView } from './NetworkGraphView'

/**
 * 网络图谱插件
 */

export function createNetworkGraphAddon({ app, $ }: NewAddonParams) {
  class NetworkGraph implements IAddon {
    app!: App
    config = {}

    getTopic(topicTitle: string) {
      return $.topic.getTopic(topicTitle)
    }

    /**
     * 获取网络图谱的节点和边
     * @returns
     */
    private index = new GraphDataIndex({
      topics: () => $.topic.getList().map(item => ({ topic: item.topic, label: Item.headString(item) })),
      topic: id => {
        const item = $.topic.getTopic(id)
        return item && Item.isNormalStatus(item) ? { topic: item.topic, label: Item.headString(item) } : undefined
      },
      // referLinked is a one-time delayed aggregate and is not recomputed on
      // editor saves. The live mentions index is the authoritative change feed.
      buckets: () => Object.keys($.dbMemory.indexed.mentions),
      sources: target => {
        const targetId = $.topic.refine(target)
        const sources: { topic: string; count: number }[] = []
        for (const item of Object.values($.dbMemory.indexed.mentions[target] || {}) as UnitPersist[]) {
          if (!Item.isNormalStatus(item)) continue
          const owner = item.isTopic ? item : $.topic.getParentTopicItem(item)
          if (!owner?.topic || !Item.isNormalStatus(owner)) continue
          // The mentions index is keyed by item, so one item can occur only
          // once in a bucket even when it contains the same reference more
          // than once. Preserve that multiplicity for graph edge weights.
          const count = Array.isArray(item.mentions)
            ? item.mentions.filter(mention => $.topic.refine(mention) === targetId).length
            : 1
          sources.push({ topic: owner.topic, count: count || 1 })
        }
        return sources
      },
      refine: id => $.topic.refine(id),
    })
    private listeners = new Set<() => void>()
    private dirtyTopics = new Set<string>()
    private dirtyTargets = new Set<string>()
    private initialized = false
    private pending = false
    private lifecycle = 0

    getNodesAndEdges = () => {
      if (!this.initialized) {
        this.initialized = true
        this.index.initialize()
      }
      return this.index.getSnapshot()
    }

    private queueUpdate = () => {
      if (!this.initialized || this.pending) return
      this.pending = true
      const lifecycle = this.lifecycle
      queueMicrotask(() => {
        if (lifecycle !== this.lifecycle || !this.listeners.size) return
        this.pending = false
        const before = this.index.getSnapshot()
        const after = this.index.update(this.dirtyTopics, this.dirtyTargets)
        this.dirtyTopics.clear(); this.dirtyTargets.clear()
        if (after !== before) for (const listener of this.listeners) listener()
      })
    }

    private onIndex = ({ indexName, indexValue }: { indexName: string; indexValue: string }) => {
      if (indexName === 'mentions') this.dirtyTargets.add(indexValue)
      else if (indexName === 'topic') this.dirtyTopics.add(indexValue)
      else return
      this.queueUpdate()
    }

    private onItem = ({ originalData, newer }: any) => {
      if (originalData?.isTopic && originalData.topic) this.dirtyTopics.add(originalData.topic)
      if (newer?.isTopic && newer.topic) this.dirtyTopics.add(newer.topic)
      for (const item of [originalData, newer]) {
        if (!Array.isArray(item?.mentions)) continue
        for (const target of item.mentions) this.dirtyTargets.add(target)
      }
      this.queueUpdate()
    }

    private onInit = () => {
      if (!this.initialized) return
      const before = this.index.getSnapshot()
      const after = this.index.initialize()
      if (after !== before) for (const listener of this.listeners) listener()
    }

    subscribe = (listener: () => void) => {
      const first = this.listeners.size === 0
      this.listeners.add(listener)
      if (first) {
        this.lifecycle++
        pub.on(pub.evt.dbIndexChanged, this.onIndex as any)
        pub.on(pub.evt.itemChanged, this.onItem)
        pub.on(pub.evt.dbMemoryInitialized, this.onInit)
        // Catch edits made while the graph route was unmounted.
        if (!this.initialized) {
          this.initialized = true
          this.index.initialize()
        }
      }
      return () => {
        this.listeners.delete(listener)
        if (!this.listeners.size) {
          this.lifecycle++
          this.pending = false
          this.dirtyTopics.clear()
          this.dirtyTargets.clear()
          pub.off(pub.evt.dbIndexChanged, this.onIndex)
          pub.off(pub.evt.itemChanged, this.onItem)
          pub.off(pub.evt.dbMemoryInitialized, this.onInit)
          this.initialized = false
        }
      }
    }

    createComponent() {
      return () => {
        const data = React.useSyncExternalStore(this.subscribe, this.getNodesAndEdges)
        return <NetworkGraphView data={data} />
      }
    }

    addonInfo() {
      return {
        title: $t`networkGraph.title`,
        quote: $t`networkGraph.quote`,
        type: 'fieldset',
        defaultValue: 'on',
      }
    }

    addonRun() {
      $.nav?.addItems({
        graphs: {
          size: 18,
          title: $t`networkGraph.nav_title`,
          order: 3000,
          icon: icons.svg_graphs,
          onClick() {
            $.router.to('/graphs')
          },
        },
      })

      $.router?.register({
        graphs: {
          title: $t`networkGraph.nav_title`,
          comp: this.createComponent(),
          minWidth: 640,
        },
      })
    }
  }

  return { networkGraph: new NetworkGraph() }
}
