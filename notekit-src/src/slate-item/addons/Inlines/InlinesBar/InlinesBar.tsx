import { ItemEditor } from '../../..'
import { ItemDOM } from '../../../components/ItemView'
import { IAddon, App, NewAddonParams } from '../../../engine/App'
import { getPubState } from '../../../hooks/usePubState'
import { ItemNode } from '../../../interfaces/item'
import { FloatBarItems } from '../../FloatBar/FloatBar'
import { InlinesBarComp } from './InlinesBarComp'
import { InlineElement } from '../Inlines'
import { SnapProps } from '../../../utils/msg/showDialog'
import { before } from '../../../engine/helper'
import { ReactEditor, Transforms, Editor, Node } from '../../../slate.inc'
import { omit } from '../../../utils/object/omit'
import { LoadedAddonName } from '../../../../main'
import { pick } from '../../../utils/object/pick'
import { FormElProps } from '../../Form/Form'
import { IAddonElement } from '../../ElementRegistry/ElementRegistry'
import { nodeString } from '../../../utils/string/nodeString'
import { $t } from '../../../../i18n'
import { InlinesBar2Comp } from './InlinesBar2Comp'
import React from 'react'

export const PUB_KEY_INLINES_BAR = 'inlines-bar-context'
export type InlinesBarContext<T extends InlineElement> = {
  item: ItemNode
  editor: ItemEditor
  itemDom: ItemDOM
  app: App
  evtTarget: HTMLElement
  elementDom: HTMLElement
  element: T
  is: (...blockTypes: string[]) => boolean
}

export type InlinesFormParams<T extends InlineElement> =
  InlinesBarContext<T> & { SnapProps: SnapProps }

export interface InlinesBarInterface<T extends InlineElement> {
  inlinesBarAddItems(items: FloatBarItems): void
  inlinesBarForm(params: InlinesFormParams<T>): void
}

export function createInlinesBarAddon({ app, $ }: NewAddonParams) {
  class InlinesBar implements IAddon {
    app!: App
    config = {}

    inlinesBarId = `${app.appName}-inlines-bar`

    items: FloatBarItems = {}

    addInlineElementButton(blockType: string, addonName?: LoadedAddonName) {
      const adnName = addonName || blockType
      $.inlinesBar.addItems({
        [blockType]: {
          icon: 'svg_edit',
          title: `${$t`common.edit`}: ${app.getAddonTitle?.(adnName)}`,
          cond: () => $.inlinesBar.getContext().is(blockType),
          onClick() {
            const addon = ($ as any)[adnName] as IAddonElement<any>
            const fieldset = addon.fieldset!()
            $.inlinesBar.showInlineElementForm(fieldset)
          },
        },
        [`clearFormat-${blockType}`]: {
          icon: 'svg_text',
          title: `${$t`inlinesBar.turn_into`} Text`,
          cond: () => $.inlinesBar.getContext().is(blockType),
          // ['img', 'bilink'].includes(blockType),
          onClick() {
            const context = $.inlinesBar.getContext()
            if (context.editor.isVoid(context.element as any)) {
              const text = nodeString(context.element)
              const pathRef = Editor.pathRef(
                context.editor,
                $.inlinesBar.getPath()
              )
              Transforms.insertNodes(
                context.editor,
                {
                  text: text,
                } as Node,
                {
                  at: pathRef.current!,
                }
              )
              Transforms.removeNodes(context.editor, {
                at: pathRef.unref()!,
              })
            } else {
              $.inlines.unwrap(
                context.editor,
                blockType,
                $.inlinesBar.getPath()
              )
            }
          },
        },
        [`delete-${blockType}`]: {
          icon: 'svg_trash',
          title: $t`common.delete`,
          cond: () => $.inlinesBar.getContext().is(blockType),
          onClick() {
            Transforms.removeNodes($.inlinesBar.getContext().editor, {
              at: $.inlinesBar.getPath(),
            })
          },
        },
      })
    }

    showInlineElementForm<T extends InlineElement>(fieldset: {
      [k in keyof Partial<T>]: FormElProps<any>
    }) {
      const { element, editor } = $.inlinesBar.getContext()
      const handle = (values: any) => {
        $.inlinesBar.setProps<any>(values)
      }
      const formHandler = $.form.popup({
        initialValues: {
          ...pick(element, Object.keys(fieldset) as any),
          text: nodeString(element),
        },
        subitems: fieldset,
        onChange: handle,
        onSubmit: (values) => {
          handle(values)
          formHandler.close()
        },
        SnapProps: {
          targetBox: $.inlinesBar.getContext().elementDom,
          place: ['center', 'bottom-out'],
        },
      })
    }

    addItems(items: FloatBarItems) {
      Object.assign($.inlinesBar.items, items)
    }

    createComponent() {
      const Comp = () => <InlinesBar2Comp name="inlines-float-menu" />
      return Comp
    }

    getContext<T extends InlineElement>() {
      const ctx = getPubState(PUB_KEY_INLINES_BAR) as InlinesBarContext<T>
      ctx.is = (...blockTypes: string[]) =>
        blockTypes.some((blockType) =>
          ctx.elementDom?.matches(`.element-${blockType}`)
        )
      return ctx
    }

    getPath() {
      const ctx = $.inlinesBar.getContext()
      return ReactEditor.findPath(ctx.editor as any, ctx.element)
    }

    turnInto(toType: LoadedAddonName, propMaps: { [k: string]: string }) {
      try {
        if (toType in $ === false) {
          throw new Error(`Addon ${toType} not found`)
        }
        const ctx = $.inlinesBar.getContext<any>()
        const props = {} as any
        Object.keys(propMaps).forEach((k) => {
          props[k] = (ctx.element as any)[propMaps[k]]
        })
        const toEl = ($ as any)[toType].createElement(props)
        const pathRef = Editor.pathRef(ctx.editor, $.inlinesBar.getPath())
        Transforms.insertNodes(ctx.editor, toEl, {
          at: pathRef.current!,
        })
        Transforms.removeNodes(ctx.editor, { at: pathRef.unref()! })
      } catch (e) {
        console.error(e)
      }
    }

    setProps<T extends InlineElement>(values: Partial<T>) {
      const path = $.inlinesBar.getPath()
      const ctx = $.inlinesBar.getContext()

      if (ctx.editor.isVoid(ctx.element as any) && (values as any).text) {
        const newElement = {
          ...omit(ctx.element, ['children'] as any),
          ...omit(values, ['text'] as any),
          children: [{ text: (values as any).text }],
        }
        const pathRef = Editor.pathRef(ctx.editor, path)
        Transforms.insertNodes(ctx.editor, newElement as any, {
          at: pathRef.current!,
        })
        Transforms.removeNodes(ctx.editor, { at: pathRef.unref()! })
      } else {
        $.inlines.setProps(ctx.editor, path, {
          ...omit(ctx.element, ['children'] as any),
          ...omit(values, ['text'] as any),
        } as any)

        if ((values as any).text) {
          $.inlines.setText(ctx.editor, path, (values as any).text)
        }
      }
    }

    close() {
      const el = document.getElementById($.inlinesBar.inlinesBarId)
      if (el) {
        Object.assign(el.style, {
          'pointer-events': 'none',
          opacity: 0,
        })
      }
    }

    /**
     * Alt + 右键点击 弹出编辑表单
     * @param elType
     * @param callback
     */
    addEvent(elType: string, callback: Function) {
      document.addEventListener('contextmenu', (e) => {
        const el = e.target as HTMLElement
        if (e.altKey && el?.matches(`.element-${elType} *`)) {
          callback({
            ...$.inlinesBar.getContext(),
            SnapProps: {
              targetBox: el,
              place: ['center', 'bottom-out'],
            },
          })
          e.preventDefault()
        }
      })
    }

    addonBeforeRun() {
      // 如果一个插件实现了 inlinesBarForm()，则定义 Alt+右击 事件
      before(app.execAddonRun, (addon, addonName) => {
        if (
          'inlinesBarForm' in addon &&
          $.elementRegistry.isAddonImplemented(addon)
        ) {
          $.inlinesBar.addEvent(addonName, (addon as any).inlinesBarForm)
        }
      })
    }

    addonRun() {
      $.ui.pushComponent($.inlinesBar.createComponent())
    }
  }

  return { inlinesBar: new InlinesBar() }
}
