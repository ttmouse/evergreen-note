/* eslint-disable prettier/prettier */
import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Item, ItemNode, ItemEditor, UnitCallbackParams } from '../..'
import { Editable, Editor, Element, Slate } from '../../slate.inc'
import { Breakpoints, cls } from '../../styles'
import * as ItemView from '../../components/ItemView/ItemView'
import { App, NewAddonParams, IAddon } from '../../engine/App'
import { KyString, UnitProps } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { icons } from '../../../components/SvgIcon'
import { Outer } from '../../components/ItemView/ItemView'
import { Leaf } from '../../components/ItemView/Leaf'
import { withMoreIcon } from './withMoreIcon'
import { $t } from '../../../i18n'
import { EleOuter, EleBody } from '../../components/Ele'
import { ErrorBoundary } from '../../components/ErrorBoundary/ErrorBoundary'
import { showSnack } from '../../utils/msg/showSnack'
import { pub } from '../../utils/pub'
import { useHint } from '../Hint/useHint'
import {
  ContextLayoutName,
  ContextLayoutDepth,
} from '../LayoutFactory/LayoutContexts'
import { ContextMainArea } from '../Main/MainContexts'
import {
  ContextEditorInline,
  ContextEditorInfo,
  ContextEditor,
  ContextTopItem,
} from './EditorViewContexts'
import { ElementWrapper } from './ElementWrapper'
import { FootNewLineComp } from './FootNewLineComp'
import { useEditor } from '../../hooks/useEditor'
import { getUrlParams } from '../../utils/string/url'
import { handleItemFocus } from './helper'

import './editor-view.less'
import {
  ResizeHelper,
  ResizeParams,
} from '../../notekit-ui/components/Dialog/ResizeHelper'
import { ZERO_WIDTH_SPACE } from '../Strmap/Strmap'
import { browser } from '@/slate-item/utils/browser'
import { atLater } from '@/slate-item/utils/atLater'
import { throttle } from 'lodash'
import { createBlockSelectionAddon } from '../BlockSelection/BlockSelection'

export type ElementComponentProps<T extends Element> = {
  element: T;
  children: React.ReactNode;
  item: ItemNode;
  isTop: boolean;
  attributes: {
    'data-slate-node': 'element';
    'data-slate-void'?: true;
    'data-slate-inline'?: true;
    layout: string;
    contentEditable?: false;
    dir?: 'rtl';
    ref: React.Ref<HTMLElement>;
  };
};

export type ElementComponent<T extends Element> = (
  props: ElementComponentProps<T>,
) => JSX.Element;
export type ElementViews<T extends Element> = {
  [blockType: string]: ElementComponent<T>;
};
export type InlineElementViews<T extends Element> = ElementViews<T>;

export type ItemStyles = {
  node: string;
  head: string;
  boey: string;
  subitems: string;
  quote: string;
  text: string;
};

export type LayoutStyles = ItemStyles[];

export interface EditorMenuCommandsParams extends UnitCallbackParams {
  editor: ItemEditor;
  item: UnitPersist;
}

export type FeatureItem =
  | Partial<UnitProps>
  | ((props: { ctxItem: ItemNode }) => JSX.Element | null);

const isTextNode = (node: Node): node is Text =>
  node.nodeType === Node.TEXT_NODE

// 标记一个编辑器组件是被哪个组件调用的
export enum EDITOR_INVOKER {
  // 网址路由
  ROUTER,
  // 块引用
  BLOCK_REF,
  // 嵌入
  EMBED,
  // 搜索
  SEARCH,
  // 浮动窗口
  FLOAT_VIEWER,
  // 每刻
  FEEDS,
  // 白板节点
  WHITEBOARD_NODE,
  // 回收站
  TRASH,
  // 历史版本
  TRACK,
  DOCVER,
  // 其他
  OTHER,
}

/**
 * The props for Editor Component
 */
export type EditorProps = {
  /**
   * The ky for the target item
   */
  ky?: KyString;
  item?: UnitPersist | KyString;
  /**
   * Whether the invocation is from the router
   * default: false
   */
  fromRouter?: boolean;

  invoker?: EDITOR_INVOKER;

  /**
   * Whether enable the components like Slash Menu、Document menu
   * default: true
   */
  moreComponentVisible?: boolean;

  /**
   * Whether display the body of the top item
   * default: true
   */
  bodyVisible?: boolean;

  titleVisible?: boolean;

  /**
   * Whether display the breadcrumbs of the top item
   * default: false
   */
  crumbsVisible?: boolean;

  /**
   * Whether display the backlinks
   */
  backlink?: boolean;
  readOnly?: boolean;
  /**
   * Css class name for the editor
   */
  classEditable?: string[];

  /**
   * The keywords to be highlighted
   */
  highlightKeywords?: string[];

  /**
   * The items to be highlighted
   */
  highlightItems?: KyString[];

  onChange?: (val: ItemNode[]) => void;

  /**
   * Whether prevent saving
   */
  preventSaving?: boolean;

  /**
   * Whether display the top node tool
   * default: false
   */
  topNodeToolVisible?: boolean;

  /**
   * 传入一个 editor 实例，用于外部控制
   * 若不提供，则内部会自动创建一个
   */
  editor?: ItemEditor;

  /**
   * Automatically focus the editor when it is mounted
   */
  autoFocus?: boolean;

  placeholderForTitle?: string;
};

declare global {
  interface AppStates {
    editorView: {
      width?: number;
    };
  }
}

let globalWidth = null as number | null

/**
 * Editor View
 */
export class EditorView implements IAddon {
  app!: App
  config = {}
  dragged = 0 // 标记拖拽节点的时间
  currentItemKy!: KyString
  autoCompleteStatus = false // 标记自动完成组件是否在显示

  setAutoCompleteStatus(status: boolean) {
    this.autoCompleteStatus = status
  }

  dropdownItems: { [k: string]: FeatureItem } = {}
  addDropdown(items: { [k: string]: FeatureItem }) {
    Object.assign(this.dropdownItems, items)
  }

  extraItems: { [k: string]: FeatureItem } = {}
  addExtraItems(items: { [k: string]: FeatureItem }) {
    Object.assign(this.extraItems, items)
  }

  /**
   * 每一个 Slate 元素的视图组件
   */
  elementViews = {} as ElementViews<any>
  addElementViews(views: ElementViews<any>) {
    Object.assign(this.elementViews, views)
  }

  /**
   * 编辑器块级元素的视图逻辑
   * @param props
   * @returns
   */
  renderElement(props: ElementComponentProps<any>) {
    const { element } = props
    const type = element.blockType ?? element.type
    if (type && type in this.elementViews) {
      const ElementView = this.elementViews[type]
      return <ElementView {...props} />
    }
    return <Outer {...props} />
  }

  /**
   * 编辑器叶子节点的视图逻辑
   * @param props
   * @returns
   */
  renderLeaf(props: any) {
    return <Leaf {...props} />
  }

  /**
   * 读取笔记数据
   *
   * 这里只是简单对 dbMemory.getItem() 进行封装,
   * 目的是为了区分编辑器插件与其他插件场景对 dbMemory.getItem() 的调用,
   * 方便跟踪、扩展
   * @param ky
   * @param fromRouter 此参数用于标识是否来自路由, 供其他插件在扩展的时候判断
   * @returns
   */
  getItem(ky: KyString, options: EditorProps): UnitPersist {
    const { bodyVisible } = options
    const item = this.app.addons.dbMemory.getItem(ky, { isRecur: bodyVisible })
    return item
  }

  /**
   * 在渲染编辑器时，加载一些额外的组件, 例如斜杆菜单、悬浮工具条等等
   * @param comp
   */
  moreComponents: ((props: { item: UnitPersist }) => JSX.Element | null)[] = []
  addMoreComponent(
    comp: (props: { item: UnitPersist }) => JSX.Element | null,
    index = -1,
  ) {
    // 如果 index 为 -1, 则添加到最后
    if (index === -1) {
      this.moreComponents.push(comp)
    } else {
      this.moreComponents.splice(index, 0, comp)
    }
  }

  /**
   * 预留一个钩子接口，以便其他插件做一些额外处理
   */
  hookProps(props: EditorProps): EditorProps {
    return props
  }

  /**
   * 创建 editor 的 React 组件
   * @returns
   */
  createComponent() {
    const { app } = this
    const { editorFactory, eventHandler, editorView, ui } = app.addons
    const $editor = editorFactory.create()

    return (editorProps: EditorProps) => {
      const hookedProps = editorView.hookProps(editorProps)

      // 对 renderLeaf、renderElement 的解构要放在此组件函数里面,
      // 不然一些插件在重写本函数时, 会出现问题
       
      const { renderLeaf, renderElement, moreComponents } =
        React.useMemo(() => {
          const { renderLeaf: leaf, moreComponents: more } = editorView
          return {
            renderLeaf: leaf.bind(editorView),
            renderElement: (elProps: any) => <ElementWrapper {...elProps} />,
            moreComponents: more,
          }
        }, [])

      const {
        ky,
        item,
        fromRouter = false,
        moreComponentVisible = true,
        titleVisible = true,
        bodyVisible = true,
        readOnly = false,
        backlink = true,
        classEditable = [],
        highlightKeywords = [],
        onChange,
        preventSaving,
        editor = React.useMemo(() => $editor, []),
        autoFocus,
        topNodeToolVisible = false,
        placeholderForTitle = 'Untitled',
        highlightItems = [],
      } = hookedProps

      const finalHighlightItems = React.useMemo(() => {
        if (fromRouter) {
          const params = getUrlParams()
          if (params.highlightItems) {
            return [...highlightItems, ...params.highlightItems.split(',')]
          }
        }
        return highlightItems
      }, [fromRouter, highlightItems])

      if (ky && item) {
        throw new Error(
          'Can not use ky and item at the same time in Editor Component\'s props',
        )
      }

      React.useEffect(() => {
        if (fromRouter) {
          (window as any).$editor = editor
        }
      }, [fromRouter, editor])

      React.useEffect(() => {
        if (preventSaving) {
          editor.itemSaveOperation = () => {}
        }
      }, [preventSaving, editor])

      const isInlineEditor = React.useContext(ContextEditorInline)
      const placeholder = isInlineEditor ? '' : placeholderForTitle

      const persistDocumentData = React.useMemo(() => {
        let theItem = item
        if (ky) {
          theItem = editorView.getItem(ky as string, {
            bodyVisible,
            fromRouter,
          })
        }
        if (typeof item === 'string') {
          theItem = editorView.getItem(ky as string, {
            bodyVisible,
            fromRouter,
          })
        }
        return theItem as UnitPersist
      }, [bodyVisible, fromRouter, item, ky])

      React.useEffect(() => {
        if (fromRouter && persistDocumentData) {
          ui.setPageTitle(
            Item.headString(persistDocumentData, { parseRefer: true }),
          )
        }
      }, [fromRouter, persistDocumentData])

      if (!persistDocumentData) {
        showSnack({
          content: $t`editor.item_not_found`,
          severity: 'error',
        })
        return null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const oriValue = React.useMemo(
        () => Item.make(persistDocumentData, { editor, $isTop: true }),
        [],
      )
      const [value, setValue] = useState([oriValue])
      const outerEditor = useEditor()
      const ctxMainArea = React.useContext(ContextMainArea)
      const paddingBottom = ctxMainArea && !isInlineEditor && !outerEditor

      const evtParams = {
        persistDocumentData,
        item: persistDocumentData,
        oriValue,
        value,
        setValue,
        editor,
      }

      const handlers = React.useMemo(() => {
        const handleList = eventHandler?.create(editor) ?? {}
        for (const [evtName, handler] of Object.entries(handleList)) {
          (handleList as any)[evtName] = (e: any) => {
            try {
              return (handler as any).call(e.target, e, evtParams)
            } catch (err) {
              console.error(err)
              return false
            }
          }
        }
        return handleList
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      const handleChange = React.useCallback((val: any) => {
        try {
          // setValue(val)
          pub.emit(pub.evt.editorChanged, evtParams)
          onChange?.(val)
        } catch (err) {
          console.error(err)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      const [decorate, setKeywords] = useHint({
        decorateKey: 'hint',
        editor,
      })

      const someProps = {
        editor,
        ...hookedProps,
        item: persistDocumentData,
      }

      const moreComp = React.useMemo(() => {
        return !moreComponentVisible ? null : (
          <>
            <FootNewLineComp />
            {moreComponents.map((Comp: any, i: number) => (
              <Comp key={`key${i}`} {...someProps} />
            ))}
          </>
        )
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      const ctxEditorInfo = React.useMemo(
        () => ({
          props: {
            ...hookedProps,
            ky,
            item,
            fromRouter,
            moreComponentVisible,
            titleVisible,
            bodyVisible,
            readOnly,
            backlink,
            classEditable,
            topNodeToolVisible,
            placeholderForTitle,
            highlightItems: finalHighlightItems,
          },
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }),
        [persistDocumentData.$id],
      )

      // console.log('ctxEditorInfo', ctxEditorInfo);

      const editorRef = React.useRef(null)
      React.useEffect(() => {
        if (highlightKeywords.length > 0) {
          setKeywords(highlightKeywords as any)
        }

        editor.highlight = setKeywords as any

        if (editorRef.current) {
          (editorRef.current as any).editor = editor
        }

        const emitParams = {
          editor,
          item: persistDocumentData,
          info: ctxEditorInfo,
        }
        pub.emit(pub.evt.editorMounted, emitParams)

        return () => {
          pub.emit(pub.evt.editorUnmounted, emitParams)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [highlightKeywords.join(',')])

      const getMaxWidth = () => {
        const rect = document
          .getElementById(`${app.appName}-outer`)
          ?.getBoundingClientRect()
        if (rect) {
          return rect.width
        }
        return 700
      }
      const [width, setWidth] = React.useState(globalWidth ?? 700)
      const onResize = (_: any, { size }: ResizeParams) => {
        const width = size.width
        globalWidth = width
        setWidth(width)
      }
      if (fromRouter) {
        React.useEffect(() => {
          const applyMaxWidth = () => {
            const maxWidth = getMaxWidth()
            if (
              width > maxWidth ||
              (visualViewport?.width ?? 0) < Breakpoints.md
            ) {
              setWidth(maxWidth)
              globalWidth = maxWidth
            }
          }
          const throttled = () =>
            atLater(applyMaxWidth, 'editor-view-resize', 100)
          window.addEventListener('resize', throttled)
          globalWidth
            ? applyMaxWidth()
            : setWidth(
                globalWidth ??
                  (globalWidth =
                    getMaxWidth() *
                    ((visualViewport?.width ?? 0) >= Breakpoints.md ? 0.8 : 1)),
              )
          pub.on(pub.evt.navFoldupStateChanged, applyMaxWidth)
          return () => {
            window.removeEventListener('resize', throttled)
            pub.off(pub.evt.navFoldupStateChanged, applyMaxWidth)
          }
        })
      }

      // 新版 Slate 已解决此问题，无需再处理
      // const onDOMBeforeInput = (browser.isAppleMobile || browser.isMacSafari) ? (event: InputEvent) => {
      //   if (event.inputType !== 'deleteCompositionText') {
      //     return;
      //   }

      //   const selection = window.getSelection();
      //   if (!selection || selection.rangeCount === 0) return;

      //   const range = selection.getRangeAt(0);
      //   const { startContainer, endContainer, endOffset, startOffset } = range;

      //   /**
      //    * Safari 删除 Composition Text 时会删除一个空节点导致 Slate 无法正常识别
      //    * 我们在 Safari 删除 Composition Text 前在节点内插入一个 0 宽空格，骗过 Safari 使它不删除
      //    */
      //   if (
      //     startContainer &&
      //     isTextNode(startContainer) &&
      //     startContainer === endContainer &&
      //     startOffset === 0 &&
      //     endOffset === (startContainer as Text).length
      //   ) {
      //     startContainer.parentElement!.insertBefore(document.createTextNode(ZERO_WIDTH_SPACE), startContainer);
      //   }
      // } : undefined

      // const onInput = (browser.isAppleMobile || browser.isMacSafari) ? (event: React.FormEvent<InputEvent>) => {
      //   if ((event.nativeEvent as InputEvent).inputType !== 'deleteCompositionText') {
      //     return;
      //   }

      //   const selection = window.getSelection();
      //   if (!selection || selection.rangeCount === 0) return;

      //   const range = selection.getRangeAt(0);
      //   const node = range.startContainer;
      //   if (!node || !node.parentElement) return;

      //   const textNodes = Array.from(node.parentElement.childNodes).filter(isTextNode);

      //   for (const textNode of textNodes) {
      //     if (textNode.textContent === ZERO_WIDTH_SPACE) {
      //       textNode.remove();
      //     } else if (textNode.textContent && textNode.textContent.includes(ZERO_WIDTH_SPACE)) {
      //       textNode.textContent = textNode.textContent.replace(new RegExp(ZERO_WIDTH_SPACE, 'g'), '');
      //     }
      //   }
      // } : undefined

      return (
        <ErrorBoundary>
          <ContextEditorInfo.Provider value={ctxEditorInfo}>
            <ContextLayoutName.Provider
              value={persistDocumentData.layout ?? 'default'}
            >
              <ContextLayoutDepth.Provider value={0}>
                <ContextEditor.Provider value={editor}>
                  <ContextTopItem.Provider value={oriValue}>
                    <EleOuter
                      eleTag="article"
                      id={`editor-view-${oriValue.$id}`}
                      editor-id={editor.editorId}
                      classOuter={`${cls`flex-grow: 1; ${fromRouter ? 'max-width: min(' + width + 'px, 100vw);' : ''} ${ctxMainArea && !outerEditor ? 'overflow: visible;' : 'overflow-x: scroll; overflow-y: inherit;'} position: relative; padding-left: 8px; padding-right: 8px;`} ${fromRouter && 'editor-from-router'} editor-view editor-layout-${value[0]?.layout ?? 'default'}`}
                      ref={editorRef}
                      editor-layout={value[0]?.layout ?? 'default'}
                    >
                      {fromRouter && (
                        <ResizeHelper
                          onResize={onResize}
                          delta={(n) => n * 2}
                        />
                      )}

                      {/* {!moreComponentVisible ? null : <EditorMenuComponent extra={extra as any} />} */}
                      <EleBody
                        classBody={paddingBottom && cls`padding-bottom: 200px;`}
                      >
                        <Slate
                          editor={editor as any}
                          initialValue={value as any}
                          onChange={handleChange}
                        >
                          <Editable
                            // onDOMBeforeInput={onDOMBeforeInput}
                            // onInput={onInput}
                            scrollSelectionIntoView={() => true}
                            className={[
                              'node-child',
                              'item-editor',
                              ...classEditable,
                            ].join(' ')}
                            decorate={decorate}
                            data-from-router={fromRouter ? 'true' : undefined}
                            data-editor-id={editor.editorId}
                            readOnly={readOnly}
                            placeholder={placeholder}
                            renderLeaf={renderLeaf}
                            renderElement={renderElement}
                            autoFocus={autoFocus}
                            {...(handlers as any)}
                          />
                        </Slate>
                        {/* <EditorComp {...someProps} /> */}
                        {moreComp}
                      </EleBody>
                    </EleOuter>
                    {/* <RichMenu /> */}
                  </ContextTopItem.Provider>
                </ContextEditor.Provider>
              </ContextLayoutDepth.Provider>
            </ContextLayoutName.Provider>
          </ContextEditorInfo.Provider>
        </ErrorBoundary>
      )
    }
  }

  addonBeforeRun() {
    // this.app.setStateSchemes('editorView', {
    //   default: {
    //     width: 720,
    //   },
    //   cache: true,
    // })
  }

  addonRun() {
    const { editorView, router, main, dbMemory, crumbs, dialog } =
      this.app.addons

    const t = Item.partTypes
    editorView.addElementViews({
      [t.outer]: ItemView.Outer,
      [t.head]: ItemView.Head as any,
      [t.body]: ItemView.Body as any,
      [t.subitems]: ItemView.Subitems,
      [t.text]: ItemView.Text,
      [t.quote]: ItemView.Quote,
    })

    router.register({
      'item/:ky': {
        title: 'Edit',
        comp: function PageComponent() {
          const { ky } = useParams()
          const item = editorView.getItem(ky as string, {
            bodyVisible: true,
            fromRouter: true,
          })
          if (isEmpty(ky) || isEmpty(item)) {
            return <div>Not found</div>
          }
          useEffect(() => {
            setTimeout(() => {
              main?.setCrumbs(crumbs.getCrumbs(item) ?? [])
              editorView.currentItemKy = item.ky
            })
          }, [item])

          const EditorComponent = editorView.createComponent()

          return (
            <div
              className={cls`
              flex-basis: 100%;
              display: flex;
              justify-content: center;
  
              > .editor-view {
                padding: 60px 16px;
              }
              `}
            >
              <EditorComponent ky={ky as string} fromRouter />
            </div>
          )
        },
      },
    })

    this.addExtraItems({
      more: withMoreIcon({
        ...editorView.dropdownItems,

        deleteItem: {
          icon: icons.svg_trash,
          title: $t`common.delete`,
          onClick(e, { item, editor }) {
            if (window.confirm($t`common.delete_confirm`)) {
              // close editor first
              const editorDom = document.querySelector(
                `.editor-view[editor-id="${editor.editorId}"]`,
              )
              const floatViewerDom = editorDom?.closest('.dialog-float-viewer')
              if (editorDom?.classList.contains('editor-from-router')) {
                const parentNode =
                  item.pky && item.pky !== '-'
                    ? dbMemory.getItem(item.pky)
                    : null
                if (parentNode) router.to(parentNode.ky)
                else router.to('/diaries')
              } else if (floatViewerDom) {
                dialog.close(floatViewerDom.id)
              }
              dbMemory.deleteItem(item.ky, { isRecur: true })
            }
          },
        },
      }),
    })

    document.addEventListener('selectionchange', (e) => {
      handleItemFocus(e)
    })
  }
}

export function createEditorViewAddon(params: NewAddonParams) {
  return {
    editorView: new EditorView(),
    ...createBlockSelectionAddon(params)
  }
}
