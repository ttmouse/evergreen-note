import { App, NewAddonParams, CommandParams, IAddon } from '../../engine/App'
import { HotKeyOptions, KeyboardEventLike, isHotkey } from 'is-hotkey'
import { cover } from '../../engine/helper'
import { PrimitiveIcon } from '../../../components/MaterialIcon'
import { UnitVersions } from '../../interfaces/unit'
import React from 'react'
import { HotkeyViewerComp } from './HotkeyViewer'
import { getUserKeys, isMyHotkey } from './helper'
import { browser } from '@/slate-item/utils/browser'

export type HotkeyInfo = {
  id?: string
  icon?: PrimitiveIcon
  title: string
  hotkey: string | string[]
  versions?: UnitVersions
  modified?: boolean
  context?: 'global' | 'editor' | 'everywhere'
  handle: (params: CommandParams) => boolean | void
}

export type HotkeyMaps = {
  [id: string]: HotkeyInfo
}

export type CustomizedMaps = {
  [id: string]: string
}

/**
 * The Hotkey addon
 * Base upon [is-hotkey](https://github.com/ianstormtaylor/is-hotkey)
 */

export function createHotkeyAddon({ app, $ }: NewAddonParams) {
  class Hotkey implements IAddon {
    app!: App
    config = {}
    commands = {} as HotkeyMaps
    preventTimestamp = 0

    customized: CustomizedMaps = {}

    /**
     * 已经派发过的原生事件
     *
     * listen()（编辑器内，React onKeyDown 驱动）与 addonRun 里的文档级监听会对同一次
     * 按键各派发一遍，`everywhere` 类命令于是被执行两次（⌘P 开两次搜索、⌘W 关两次笔记、
     * 安迪模式列会挪两格）。用原生事件对象记住「这次按键已经派发过了」，两条路只留先到的。
     */
    dispatchedEvents = new WeakSet<object>()

    nativeEventOf(event: any): object | undefined {
      return (event?.nativeEvent ?? event) as object | undefined
    }

    isDispatched(event: any) {
      const nativeEvent = this.nativeEventOf(event)
      return !!nativeEvent && this.dispatchedEvents.has(nativeEvent)
    }

    /** 只在命令真的被派发时标记，否则同一次按键里的其它分组（global 等）会被误跳过 */
    markDispatched(event: any) {
      const nativeEvent = this.nativeEventOf(event)
      if (nativeEvent) this.dispatchedEvents.add(nativeEvent)
    }

    preventHotkey() {
      this.preventTimestamp = Date.now()
    }

    addCommands(rules: HotkeyMaps) {
      Object.assign(this.commands, rules)
    }

    /**
     * Register the hotkeys for addons.
     * Every addon defines its hotkeys by its addonCommands() method,
     * and then the Hotkey addon will collect those hotkey definitions and register them.
     */
    registerAll() {
      for (const [addonName, addon] of Object.entries(this.app.addons)) {
        if ('addonCommands' in addon) {
          const commands = (addon as any).addonCommands() as HotkeyMaps
          this.register(commands, addonName)
        }
      }
    }

    // showCustomForm(...cmdList: string[]) {
    //   $.dialog.show({
    //     title: $$`Customize Hotkey`,
    //     body: <CustomFormComp cmdList={cmdList} />,
    //   });
    // }

    register(commands: HotkeyMaps, addonName = 'app') {
      if (!commands) return
      for (const [cmdKey, cmdInfo] of Object.entries(commands)) {
        if ('hotkey' in cmdInfo) {
          cmdInfo.id = `${addonName}.${cmdKey}`
          if (this.isExists(cmdInfo.hotkey.toString())) {
            if (!cmdInfo.modified) {
              throw new Error(
                `${cmdInfo.hotkey} is already exists, please use a different key name, or set cmdInfo.modified = true in ${cmdInfo.id}`
              )
            }
            setTimeout(
              () => this.modify(cmdInfo.hotkey.toString(), cmdInfo.handle),
              0
            )
          } else {
            this.commands[cmdInfo.id as string] = cmdInfo
          }
        }
      }
    }

    execCommand(cmdInfo: HotkeyInfo, params: CommandParams): boolean {
      try {
        return this.app.execCommand(cmdInfo, params) as any
      } catch (e) {
        console.error(e)
        return false
      }
    }

    listen(params: CommandParams) {
      const event = params.event as KeyboardEvent
      if (this.isDispatched(event)) return
      for (const cmdInfo of Object.values(this.commands)) {
        if (
          cmdInfo.hotkey &&
          isMyHotkey(cmdInfo.hotkey, { byKey: true }, event) &&
          Date.now() - this.preventTimestamp > 100
        ) {
          // 仅当 command 函数明确 return true 时, 事件的默认行为才可以继续执行
          // 而 command 返回 false 或 undefined, 则会阻止默认行为
          this.markDispatched(event)
          if (this.execCommand(cmdInfo, params) !== true) {
            event.preventDefault()
          }
          break
        }
      }
    }

    isExists(keyName: string) {
      return !!this.findCommandByKey(keyName)
    }

    getKey(commandId: string) {
      return this.customized[commandId] ?? this.commands[commandId]?.hotkey
    }

    findCommandByKey(keyName: string) {
      return Object.values(this.commands).find(
        (cmd) =>
          cmd.hotkey === keyName ||
          (Array.isArray(cmd.hotkey) && cmd.hotkey.includes(keyName))
      )
    }

    /**
     * 修改默认的键盘事件处理函数
     * @param keyName 键名
     * @param modifyFn 修改函数
     */
    modify(
      keyName: string,
      modifyFn: (params: CommandParams) => boolean | void
    ) {
      const { execCommand } = this.app
      cover(execCommand, (cmd, params) => {
        const k = Array.isArray(cmd.hotkey) ? cmd.hotkey : [cmd.hotkey]
        if (k.includes(keyName) && modifyFn(params) === false) {
          return false
        }
        return execCommand.call(this.app, cmd, params)
      })
    }

    show() {
      this.app.addons.dialog.show({
        title: 'Hotkeys',
        body: <HotkeyViewerComp />,
        SnapProps: {
          targetBox: window,
          place: ['right-in', 'bottom-in'],
        },
      })
    }

    /**
     * 根据条件阻止快捷键的执行
     * @param keyName
     * @param cond
     */
    stopIf(keyName: string, cond: (params: CommandParams) => boolean) {
      // 异步执行，使得它拥有一个比较高的优先级
      setTimeout(() => {
        this.modify(keyName, (params) => !cond(params))
      }, 100)
    }

    addonRun() {
      this.registerAll()

      // this.showCustomForm('app.floatSearch');

      const globalKeys = Object.values(this.commands).filter(
        (cmd) => cmd.context === 'global'
      )
      const everywhereKeys = Object.values(this.commands).filter(
        (cmd) => cmd.context === 'everywhere'
      )

      const checkKeys  = (event: KeyboardEvent, fromSet: HotkeyInfo[]) => {
        if (this.isDispatched(event)) return
        const params = {
          app,
          event,
        } as CommandParams
        for (const cmdInfo of fromSet) {
          if (
            cmdInfo.hotkey &&
            isMyHotkey(cmdInfo.hotkey, { byKey: true }, event) &&
            Date.now() - this.preventTimestamp > 100
          ) {
            // 仅当 command 函数明确 return true 时, 事件的默认行为才可以继续执行
            // 而 command 返回 false 或 undefined, 则会阻止默认行为
            this.markDispatched(event)
            if (this.execCommand(cmdInfo, params) !== true) {
              event.preventDefault()
            }
            break
          }
        }
      }

      // 必须挂在捕获阶段：MUI Modal 的 useModal 在 Escape 上调用
      // event.stopPropagation()（源码注释写明是为了「吞掉事件，防止有人监听 body 上的
      // escape」），而 stopPropagation 只阻断后续阶段。挂冒泡阶段时，只要有任意对话框
      // 开着，global/everywhere 类快捷键（⌘Esc 设置、⌘P 搜索、⌘L 今日笔记等）就收不到
      // 事件，表现为「按了没反应」。捕获阶段先于 MUI 的冒泡处理器执行，事件不会被吞。
      // 只挂这一个捕获监听器，配合 checkKeys 里的 isDispatched 去重，不会重复派发。
      document.addEventListener(
        'keydown',
        (event: KeyboardEvent) => {
          checkKeys(event, everywhereKeys)
          const el = event.target as HTMLElement
          if (!el?.matches?.('.editor-view *')) {
            checkKeys(event, globalKeys)
          }
        },
        true
      )
    }
  }

  return new Hotkey()
}
