import React from 'react'
import { isBrickProps } from '../Brick/Brick'
import { SnapBaseBox, snap } from '../../hooks/useSnap'
import { Placement } from '../../../utils/calcSnap'
import { reactRender } from '../../../utils/common'
import { movable } from './helper'
import { computeDialogMoveConstrainBox } from './dialogConstrain'
import { PANEL_CLASS_MAP, Panel, PanelProps } from '../Panel/Panel'
import { SYMBOL_SIZE, SymbolList, SymbolProps } from '../Symbol/Symbol'
import { ResizeHelper } from './ResizeHelper'
import { useClickAway } from '../../../hooks/useClickAway'
import { useTopZIndex, topZIndex } from '../../../hooks/useTopZIndex'
import { createTmpDom } from '../../../utils/dom/createTmpDom'
import { ButtonList, ButtonProps } from '../Button/Button'
import MuiCheckbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import { NPart } from '../NPart/NPart'
import { Mask } from '../Mask/Mask'
import { isEmpty } from '../../../utils/isEmpty'
import { deepClone } from '../../../utils/object/deepClone'
import { pub } from '../../../utils/pub'
import './Dialog.less'
import '../Symbol/Symbol.less'
import { observer } from 'mobx-react'

export enum KEEP_DIALOG {
  YES = 'YES',
  NO = 'NO',
}

export type DialogProps = PanelProps & {
  width?: number | 'sm' | 'md' | 'lg' | 'xl' | 'full'
  height?: number
  SnapProps?: {
    targetBox: SnapBaseBox
    place: Placement
  }
  // 在底部显示一个带复选框的提示信息
  footerMsg?: {
    text: string | JSX.Element
    checkbox?: boolean
    checked?: boolean
  }
  buttons?: {
    [k: string]:
      | ((
          e: React.MouseEvent,
          states: DialogStates,
          dispatch: DialogDispatch
        ) => void | KEEP_DIALOG)
      | null
      | ButtonProps
  }

  canClickWay?: boolean | ((ev: MouseEvent) => boolean)
  canResize?:
    | boolean
    | {
        remember?: boolean
      }
  canMove?: boolean
  canClose?: boolean
  canFold?: boolean // minimize
  canPin?:
    | boolean
    | {
        pin?: boolean
      }
  canMinimize?: boolean
  mask?: boolean | number

  // 一些为了特殊需求而给 Dialog 的 DOM 添加的属性
  attributes?: { [attrName: string]: string | number | boolean }

  /**
   * 自定义状态管理
   * 如果有返回值，则会覆盖默认的状态管理
   * 若无返回值，则采用默认的状态管理
   */
  reducer?: React.Reducer<DialogStates, DialogAction>

  /**
   * 关闭时的回调
   * 在 React 中，一个组件并不能真正地自我销毁（Unmount)，
   * 所以，在组件内部返回 null 并不会触发 unnmounted，
   * 要真正地销毁一个组件，只能通过父组件的重新渲染来实现，
   * 所以，可以传入一个外部的 onClose，以达到真正销毁 Dialog 组件
   *
   * @param states
   * @returns 返回 true 或者 undefined 则关闭，返回 false 则不关闭
   */
  onClose?: (
    e: Event,
    params: Pick<DialogEventParams, 'states' | 'dom'>
  ) => void | boolean

  onUnMounted?: (e: Event, params: Omit<DialogEventParams, 'dom'>) => void
  onMounted?: (e: Event, params: DialogEventParams) => void
  // Trigger for each render
  onRendered?: (e: Event, params: DialogEventParams) => void
  onDispatched?: (
    e: Event,
    params: DialogEventParams & {
      action: DialogAction
      prev: DialogStates
      next: DialogStates
    }
  ) => void
  onActive?: () => void
  onMoveEnd?: (e: Event, params: { left: number; top: number }) => void
  dialogZIndex?: number
}

export type DialogEventParams = {
  dom: HTMLElement
  states: DialogStates
  dispatch: React.Dispatch<DialogAction>
}

export type DialogAction =
  | {
      type: 'set_visible'
      payload: boolean
      triggerOnDispatch?: boolean
    }
  | {
      type: 'set_position'
      triggerOnDispatch?: boolean
      payload: {
        left: number
        top: number
      }
    }
  | {
      type: 'set_footer_checked'
      triggerOnDispatch?: boolean
      payload: boolean
    }
  | {
      type: 'set_size'
      triggerOnDispatch?: boolean
      payload: {
        width: number
        height: number
      }
    }
  | {
      type: 'set_pin'
      payload: boolean
      triggerOnDispatch?: boolean
    }
  | {
      type: 'set_foldup'
      triggerOnDispatch?: boolean
      payload: boolean | 'toggle'
    }
  | {
      type: 'set_attributes'
      triggerOnDispatch?: boolean
      payload: DialogProps['attributes']
    }

export type DialogStates = {
  visible: boolean
  footerChecked?: boolean
  pin?: boolean
  foldup?: boolean
  position: {
    left: number
    top: number
  }
  size: {
    width: number
    height: number
  }
  attributes?: DialogProps['attributes']
}

export type DialogDispatch = React.Dispatch<DialogAction>

export function dialogDispatch(dialogId: string, action: DialogAction) {
  pub.emit(pub.evt.dispatch, dialogId, action)
}

export const DialogResizer = observer((props: {
  onResize: (e: MouseEvent, size: { size: { width: number; height: number } }) => void,
  attributes?: { [attrName: string]: string | number | boolean }
}) => {
  return <ResizeHelper
    axis={props.attributes?.['dialog-list-mode']==='andy'?'x':'both'}
    onResize={props.onResize}
  />
})

export const Dialog = (props: DialogProps) => {
  const {
    canClickWay = true,
    canMove = true,
    canResize = true,
    canClose = true,
    canPin = false,
    canFold = false,
    SnapProps = { targetBox: window, place: ['center', 'top-in'] },
    buttons,
    footerMsg,
    mask = false,
    width = 0,
    height = 0,
    cssClass = [],
    attributes = {},
    onMounted,
    onUnMounted,
    onDispatched,
    onRendered,
    onClose,
    reducer,
    ...rest
  } = props

  const ref = React.useRef<HTMLElement>(null)
  const [maskContainer, setMaskContainer] = React.useState<HTMLElement | null>(null)

  const [states, dispatch] = React.useReducer(
    (current: DialogStates, action: DialogAction) => {
      let newStates = reducer?.(current, action)
      if (newStates) {
        return newStates
      }
      switch (action.type) {
        case 'set_visible':
          if (
            !action.payload &&
            onClose?.(new Event('dialog.close'), {
              states: current,
              dom: ref.current!,
            }) === false
          ) {
            return current
          }
          newStates = {
            ...current,
            visible: action.payload,
          }
          break
        case 'set_position':
          newStates = {
            ...current,
            position: action.payload,
          }
          break
        case 'set_footer_checked':
          newStates = {
            ...current,
            footerChecked: action.payload,
          }
          break
        case 'set_size':
          newStates = {
            ...current,
            size: action.payload,
          }
          pub.emit(pub.evt.dialogResized, props.id!, action.payload)
          break
        case 'set_pin':
          newStates = {
            ...current,
            pin: action.payload,
          }
          break
        case 'set_foldup': {
          newStates = {
            ...current,
            foldup:
              action.payload === 'toggle' ? !current.foldup : action.payload,
            pin: true,
          }
          break
        }
        case 'set_attributes': {
          newStates = {
            ...current,
            attributes: {
              ...current.attributes,
              ...action.payload,
            },
          }
          break
        }
      }
      if (action.triggerOnDispatch !== false) {
        onDispatched?.(new Event('dialog.statesChanged'), {
          dom: ref.current!,
          action,
          prev: deepClone(current),
          next: newStates,
          states: newStates,
          dispatch: (theAction: DialogAction) => {
            if (typeof theAction.triggerOnDispatch === 'undefined') {
              theAction.triggerOnDispatch = false
            }
            dispatch(theAction)
          },
        })
      }
      return newStates
    },
    {
      size: { width: typeof width === 'number' ? width : 0, height },
      position: { left: -10000, top: -10000 },
      visible: true,
      footerChecked: false,
      pin: typeof canPin === 'object' ? !!canPin.pin : false,
      attributes,
    }
  )

  // const [size, setSize] = React.useState<{
  //   width: number
  //   height: number
  // }>({ width: typeof width === 'number' ? width : 0, height })

  React.useEffect(() => {
    const rect = ref.current?.getBoundingClientRect()
    if (rect) {
      dispatch({
        type: 'set_size',
        payload: {
          width: rect.width,
          height: rect.height,
        },
      })
    }
    onMounted?.(new Event('dialog.mounted'), {
      dom: ref.current!,
      states,
      dispatch,
    })

    if (typeof canPin === 'object' && canPin.pin) {
      dispatch({
        type: 'set_pin',
        payload: true,
      })
    }

    return () => {
      onUnMounted?.(new Event('dialog.unmounted'), {
        states,
        dispatch,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [winSizeChanged, setWinSizeChanged] = React.useState(Date.now())
  const foldupRef = React.useRef(states.foldup)
  foldupRef.current = states.foldup
  const winChangedDuringFoldup = React.useRef(false)

  const rememberedPositionRef = React.useRef<{
    left: number
    top: number
  } | null>(null)
  const rememberedSizeRef = React.useRef<{
    width: number
    height: number
  } | null>(null)
  // 用户手动拖动过窗口后，不再因内容尺寸变化而自动重新居中
  const userDraggedRef = React.useRef(false)

  React.useEffect(() => {
    const dlgDom = ref.current
    if (!dlgDom) return
    const dlgHead = dlgDom.querySelector('.nui-dialog-head')
    const handleDblClick = () => {
      if (props.attributes?.['dialog-list-mode'] === 'andy') return
      if (!rememberedPositionRef.current || !rememberedSizeRef.current) {
        const rect = dlgDom.getBoundingClientRect()
        rememberedPositionRef.current = {
          left: rect.left,
          top: rect.top,
        }
        rememberedSizeRef.current = {
          width: rect.width,
          height: rect.height,
        }
        dialogDispatch(props.id!, {
          type: 'set_size',
          payload: {
            width: window.innerWidth,
            height:
              window.innerHeight -
              parseFloat(getComputedStyle(document.body).fontSize) * 2.5,
          },
        })
        dialogDispatch(props.id!, {
          type: 'set_position',
          payload: {
            left: 0,
            top: 0,
          },
        })
      } else {
        dialogDispatch(props.id!, {
          type: 'set_size',
          payload: rememberedSizeRef.current,
        })
        dialogDispatch(props.id!, {
          type: 'set_position',
          payload: rememberedPositionRef.current,
        })
        rememberedPositionRef.current = null
        rememberedSizeRef.current = null
      }
    }
    dlgHead?.addEventListener('dblclick', handleDblClick)
    return () => {
      dlgHead?.removeEventListener('dblclick', handleDblClick)
    }
  }, [])

  React.useEffect(() => {
    const dlgDom = ref.current
    if (!dlgDom) {
      return
    }
    dlgDom.style.opacity = '1'

    const handleDialogSnap = () => {
      snap(
        dlgDom,
        SnapProps?.targetBox ?? window,
        SnapProps?.place ?? ['center', 'top-in'],
        {
          onComplete({ left, top }) {
            dispatch({
              type: 'set_position',
              payload: { left, top },
            })
          },
        }
      )
    }
    handleDialogSnap()
    const onWinowResize = () => {
      if (foldupRef.current) {
        winChangedDuringFoldup.current = true
      } else {
        handleDialogSnap()
      }
      setWinSizeChanged(Date.now())
    }
    window.addEventListener('resize', onWinowResize)

    return () => {
      window.removeEventListener('resize', onWinowResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 内容异步加载导致 dialog 尺寸变化时，自动重新居中（用户手动拖动过窗口后不再自动调整）
  React.useEffect(() => {
    const dlgDom = ref.current
    if (!dlgDom || !ResizeObserver) return
    let lastWidth = dlgDom.offsetWidth
    let lastHeight = dlgDom.offsetHeight
    const ro = new ResizeObserver(() => {
      if (userDraggedRef.current) return
      if (foldupRef.current) return
      const w = dlgDom.offsetWidth
      const h = dlgDom.offsetHeight
      // 尺寸变化超过 1px 才重新 snap，避免抖动
      if (Math.abs(w - lastWidth) > 1 || Math.abs(h - lastHeight) > 1) {
        lastWidth = w
        lastHeight = h
        snap(
          dlgDom,
          SnapProps?.targetBox ?? window,
          SnapProps?.place ?? ['center', 'top-in'],
          {
            onComplete({ left, top }) {
              dispatch({
                type: 'set_position',
                payload: { left, top },
              })
            },
          }
        )
      }
    })
    ro.observe(dlgDom)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (states.foldup) {
      winChangedDuringFoldup.current = false
      return
    }
    if (!winChangedDuringFoldup.current) return
    winChangedDuringFoldup.current = false
    const dlgDom = ref.current
    if (!dlgDom) return
    snap(
      dlgDom,
      SnapProps?.targetBox ?? window,
      SnapProps?.place ?? ['center', 'top-in'],
      {
        onComplete({ left, top }) {
          dispatch({
            type: 'set_position',
            payload: { left, top },
          })
        },
      }
    )
    setWinSizeChanged(Date.now())
  }, [states.foldup])

  // 单独处理 pub/sub 监听器，确保 props.id 变化时能正确重新注册
  React.useEffect(() => {
    const fn: typeof pub.evt.dispatch<any> = (
      dialogId,
      action: DialogAction
    ) => {
      if (dialogId === props.id) {
        dispatch(action)
      }
    }
    pub.on(pub.evt.dispatch, fn)

    return () => {
      pub.off(pub.evt.dispatch, fn)
    }
  }, [props.id]) // 明确依赖 props.id

  React.useEffect(() => {
    if (canMove) {
      const dlgDom = ref.current
      if (!dlgDom) {
        return
      }
      // 拖动约束每次移动时实时计算：窗口可以移出视口，但必须始终保留
      // 一段可操作的标题栏（含 pin/fold/close 控件）在视口内，
      // 且右下角 resize 手柄不离开视口；窗口尺寸、缩放、视口 resize 即时生效。
      return movable(dlgDom, {
        handle: '.nui-dialog-head',
        axis: canMove ? 'both' : 'none',
        constrain: () =>
          computeDialogMoveConstrainBox({
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            width: dlgDom.offsetWidth,
            height: dlgDom.offsetHeight,
          }),
        onMove(e, { left, top }) {
          dlgDom.style.left = `${left}px`
          dlgDom.style.top = `${top}px`
        },
        onEnd(e, { left, top }) {
          rememberedSizeRef.current = null
          userDraggedRef.current = true
          dispatch({
            type: 'set_position',
            payload: { left, top },
          })
          props.onMoveEnd?.(e, { left, top })
        },
      })
    }
  }, [
    canMove,
    winSizeChanged, // winSizeChanged 更新之后，constrain 的区域也要随之更新
  ])

  React.useEffect(() => {
    onRendered?.(new Event('dialog.rendered'), {
      dom: ref.current!,
      states,
      dispatch,
    })
  })

  const { visible } = states
  React.useLayoutEffect(() => {
    if (!visible || !mask || states.attributes?.['dialog-list-mode'] === 'andy') return
    const container = ref.current?.parentElement
    if (container) setMaskContainer(container)
  }, [visible, mask, states.attributes?.['dialog-list-mode']])

  const setVisible = (v: boolean) =>
    dispatch({ type: 'set_visible', payload: v })

  const isAwayRef = React.useRef((ev: MouseEvent) => {})
  isAwayRef.current = (ev: MouseEvent) => {
    if (
      (states.pin && (!mask || states.attributes?.['dialog-list-mode'] === 'andy')) ||
      !canClickWay
    ) {
      return
    }
    if (typeof canClickWay === 'function' && !canClickWay(ev)) {
      return
    }
    setVisible(false)
  }
  useClickAway(ref as any, (ev) => {
    isAwayRef.current(ev)
  })

  React.useEffect(() => {
    const dlgDom = ref.current
    if (!dlgDom) return
    const handleMouseDown = () => {
      if (props.dialogZIndex != null) {
        dlgDom.style.zIndex = String(props.dialogZIndex)
      } else {
        topZIndex(dlgDom)
      }
      props.onActive?.()
    }
    dlgDom.addEventListener('mousedown', handleMouseDown)
    return () => {
      dlgDom.removeEventListener('mousedown', handleMouseDown)
    }
  })
  const symbolList: SymbolProps[] = []
  if (canPin) {
    symbolList.push({
      icon: 'svg_pin',
      size: SYMBOL_SIZE.XS,
      order: 1000,
      color: states.pin ? 'info' : 'default',
      onClick() {
        dispatch({ type: 'set_pin', payload: !states.pin })
      },
    })
  }
  if (canFold) {
    symbolList.push({
      icon: 'svg_minus',
      size: SYMBOL_SIZE.XS,
      order: 2000,
      onClick() {
        dispatch({ type: 'set_foldup', payload: !states.foldup })
        return KEEP_DIALOG.NO
      },
    })
  }
  if (canClose) {
    symbolList.push({
      icon: 'svg_close',
      size: SYMBOL_SIZE.XS,
      order: 10000,
      onClick() {
        setVisible(false)
      },
    })
  }
  const extraContent = isEmpty(symbolList) ? null : (
    <SymbolList subitems={symbolList} />
  )

  const setFooterChecked = (v: boolean) =>
    dispatch({ type: 'set_footer_checked', payload: v })

  let footerContent: JSX.Element | null = null
  if (typeof buttons === 'object') {
    for (const [k, v] of Object.entries(buttons as any)) {
      if (v === null) {
        ;(buttons as any)[k] = {
          title: k,
          onClick: () => setVisible(false),
          color: 'text',
        } as any
      }
    }

    const msgCom = footerMsg && (
      <FormControlLabel
        label={footerMsg.text ?? ''}
        sx={{ position: 'relative', left: 12 }}
        control={
          !footerMsg.checkbox ? (
            <></>
          ) : (
            <MuiCheckbox
              onChange={(e, v) => setFooterChecked(v)}
              style={{ padding: 0 }}
              checked={states.footerChecked}
              color="info"
            />
          )
        }
      />
    )

    footerContent = !buttons ? null : (
      <>
        {isEmpty(msgCom) && isEmpty(buttons) ? null : (
          <NPart className="footer-msg">{msgCom}</NPart>
        )}
        <ButtonList
          subitems={Object.entries(buttons).map(([key, info]) => {
            if (isBrickProps(info)) {
              return {
                ...info,
                onClick: (e: React.MouseEvent) => {
                  const result = info.onClick?.(e, states, dispatch)
                  if (!result || result === KEEP_DIALOG.NO) {
                    setVisible(false)
                  }
                },
              }
            }
            let onClick = (e: React.MouseEvent) => {}
            if (typeof info === 'function') {
              onClick = (e: React.MouseEvent) => {
                const result = info(e, states, dispatch)
                if (!result || result === KEEP_DIALOG.NO) {
                  setVisible(false)
                }
              }
            }
            return {
              title: key,
              onClick,
              color: typeof info === 'function' ? 'primary' : 'text',
            } as ButtonProps
          })}
        />
      </>
    )
  }

  const classes = [
    ...cssClass,
    {
      'size-sm': isEmpty(width),
      [`size-${width}`]: typeof width === 'string',
      'is-foldup': states.foldup,
      'is-pin': states.pin,
    },
  ]

  const { size } = states
  const theSize = {}
  if (!isEmpty(size.width)) {
    ;(theSize as any).width = size.width
  }
  if (!isEmpty(size.height)) {
    ;(theSize as any).height = size.height
  }
  // if (!isEmpty(size.height)) {
  //   ;(theSize as any).height = size.height
  // }
  return (
    <>
      {!visible ? null : (
        <Panel
          partClasses={{
            ...PANEL_CLASS_MAP,
            outer: 'nui-panel',
          }}
          {...rest}
          {...states.attributes}
          style={{ ...theSize, ...states.position, zIndex: props.dialogZIndex }}
          cssClass={classes}
          ref={ref}
          extra={extraContent}
          footer={footerContent}
          type="nui-dialog"
        >
          {mask && maskContainer && states.attributes?.['dialog-list-mode'] !== 'andy' && (
            <Mask
              container={maskContainer}
              opacity={typeof mask === 'number' ? mask : undefined}
            />
          )}
          {canResize && (
            <DialogResizer
              attributes={states.attributes}
              onResize={(_, { size: nextSize }) => {
                rememberedSizeRef.current = null
                userDraggedRef.current = true
                dispatch({ type: 'set_size', payload: nextSize })
              }}
            />
          )}
        </Panel>
      )}
    </>
  )
}

export type DialogListProps = {
  subitems: DialogProps[]
}

export const dialogShow = (props: DialogProps) => {
  reactRender(createTmpDom(), <Dialog {...props} />)
}

export default Dialog
