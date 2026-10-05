/* eslint-disable prefer-spread */
import React from 'react'
import Button from '@mui/material/Button'
import MuiDialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Paper, { PaperProps } from '@mui/material/Paper'
import IconButton from '@mui/material/IconButton'
import { XIcon as CloseIcon } from '@phosphor-icons/react';
import Draggable from 'react-draggable'
import { fleetRender } from '../fleetRender'
import { ErrorBoundary } from '../../components/ErrorBoundary/ErrorBoundary'
import { mkid } from '../string/mkid'
import { pub } from '../pub'
import { atom, cls } from '../../styles'
import { ContextDialog } from './msgContexts'
import { usePubState } from '../../hooks/usePubState'
import { isEmpty } from '../isEmpty'
import { Placement, SnapCalcOptions } from '../calcSnap'
import { snap, SnapBaseBox } from '../../hooks/useSnap'
import { useAwait } from '../../hooks/useAwait'
import { until } from '../until'
import { TimeMilliSecond } from '../../interfaces/unit'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { PushPinIcon as PushPinOutlinedIcon } from '@phosphor-icons/react';
import MuiCheckbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import { topZIndex, useTopZIndex } from '../../hooks/useTopZIndex'
import { sleep } from '../sleep'

// appendStyle(`
//   .MuiDialog-paper {
//     box-shadow: 0px 0px 8px 1px #0000002e !important;
//   }
// `);

const dialogTitleStyle = cls`
  &.MuiDialogTitle-root {
    padding: 6px 12px;
    transition: opacity 0.2s ease-in-out;
    border-bottom: 1px solid #0000002e;

    &:hover {
      opacity: 1 !important;
    }
  }
`

export type DialogHandlerFunc<T> = (
  params: T & {
    setClose: (isClose: boolean) => void
    bottomChecked?: boolean
  }
) => T | void

export type DialogHanlderCommand<T> = {
  title: string | JSX.Element
  color?: 'success' | 'info' | 'secondary' | 'error' | 'warning'
  size?: 'small' | 'medium' | 'large'
  variant?: 'outlined' | 'contained'
  onClick?: DialogHandlerFunc<T>
}

export type DialogHandler<T> =
  | DialogHandlerFunc<T>
  | DialogHanlderCommand<T>
  | null

export type SnapProps = {
  targetBox: SnapBaseBox
  place: Placement
  opts?: SnapCalcOptions
}

export type DialogProps<T> = {
  title?: string | JSX.Element
  body: string | JSX.Element
  dialogId?: string
  clickAway?: boolean
  backdrop?: boolean
  shouldCloseOnMouseDown?: (evt: MouseEvent) => boolean
  buttons?: {
    [btnLabel: string]: DialogHandler<T>
  }
  classList?: string[]
  onClose?: (evt: Event, reason: string) => void
  beforeClose?: (evt: Event, reason: string) => void
  SnapProps?: SnapProps
  titleVisibility?: 'hover' | 'hidden' | 'visible'
  autoClose?: TimeMilliSecond
  width?: number
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  canPin?: boolean // 是否可固定
  isPin?: boolean // 是否固定
  bottomHint?: {
    checkbox?: boolean
    label: string | JSX.Element
    checked?: boolean
  }
}

export function DialogComp<T>(props: DialogProps<T>) {
  const {
    title,
    body,
    buttons = {},
    backdrop = false,
    clickAway = true,
    classList = [],
    dialogId = mkid(),
    onClose,
    beforeClose = () => {},
    SnapProps,
    titleVisibility = 'hover',
    autoClose,
    width,
    maxWidth,
    shouldCloseOnMouseDown,
    canPin = false,
    isPin = false,
    bottomHint,
  } = props

  const [pin, setPin] = React.useState(isPin)

  if (width) {
    classList.push(
      cls`.MuiPaper-root {
        min-width: ${width}px !important;
        ${atom.xs(`min-width: 100% !important; `)}
      }`
    )
  }

  classList.push('dialog-outer')
  const [close, setClose] = usePubState(`is-dialog-close:${dialogId}`, false)

  const handleClose =
    onClose ??
    ((e: any, reason: string) => {
      setClose(reason === 'backdropClick' && clickAway)
    })

  const [titleId] = React.useState(() => `dialog-title-${mkid()}`)
  const [contentId] = React.useState(() => `dialog-content-${mkid()}`)
  // 标题栏（也是唯一放关闭按钮的地方）是否被显式关掉。
  const hideTitleBar = isEmpty(title) || titleVisibility === 'hidden'
  const PaperComponent = React.useCallback(
    (paperProps: PaperProps) => {
      const Draggable1: any = Draggable
      return (
        <Draggable1
          handle={`#${titleId}`}
          cancel={'[class*="MuiDialogContent-root"]'}
        >
          <Paper {...paperProps} />
        </Draggable1>
      )
    },
    [titleId]
  )

  const closeIt = React.useCallback(() => {
    const el = document.getElementById(dialogId)
    if (el) {
      el.style.display = 'none'
      setClose(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogId])

  const spanRef = React.useRef<HTMLElement>(null)
  useAwait(async () => {
    if (!SnapProps) {
      return
    }
    await until(() => !!spanRef.current)
    const dom = spanRef.current!.closest('.MuiPaper-root') as HTMLElement
    if (!dom) {
      return
    }

    Object.assign(dom.style, {
      position: 'fixed',
    })

    snap(dom, SnapProps.targetBox, SnapProps.place, SnapProps?.opts)
    topZIndex(dom)
  }, [])

  if (typeof autoClose === 'number') {
    setTimeout(() => setClose(true), autoClose)
  }

  const theTheme = useTheme()
  const fullScreen = useMediaQuery(theTheme.breakpoints.down('xs'))

  React.useEffect(() => {
    if (!clickAway) {
      return
    }
    const fn = (e: any) => {
      if (pin) {
        return
      }
      const el = e.target as HTMLElement
      if (shouldCloseOnMouseDown) {
        if (shouldCloseOnMouseDown(e)) {
          closeIt()
        }
      } else if (!el.closest(`#${dialogId}`)) {
        closeIt()
      }
    }
    document.addEventListener('mousedown', fn)

    return () => {
      document.removeEventListener('mousedown', fn)
    }
  }, [clickAway, closeIt, dialogId, pin, shouldCloseOnMouseDown])

  const [bottomChecked, setBottomChecked] = React.useState(false)

  return (
    <ErrorBoundary>
      <ContextDialog.Provider value>
        {backdrop ? null : (
          <style>
            {`#${dialogId} {
              pointer-events: none;
            }
            #${dialogId} .MuiPaper-root {
              pointer-events: all;
            }
          `}
          </style>
        )}
        <MuiDialog
          fullScreen={fullScreen}
          open={!close}
          onClose={(...args: any) => {
            beforeClose.apply(null, args)
            handleClose.apply(null, args)
          }}
          maxWidth={maxWidth}
          PaperComponent={PaperComponent}
          aria-labelledby={titleId}
          disableRestoreFocus={true}
          hideBackdrop={!backdrop}
          className={classList.join(' ')}
          id={dialogId}
        >
          {/* 标题栏被关掉时关闭按钮也一起没了。若同时 clickAway=false（如插件设置浮窗），
              点击外部和 Esc 都不关，就没有任何出口，这里补一个悬浮关闭按钮；
              点击外部即关的小浮层（取色、候选）保持原样，不加入口。 */}
          {hideTitleBar ? (
            clickAway ? null : (
              <div
                className="dialog-floating-close"
                style={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}
              >
                <IconButton
                  aria-label="close"
                  sx={{ color: 'var(--cl-slate-400)' }}
                  onMouseDown={() => closeIt()}
                  onTouchStart={() => closeIt()}
                >
                  <CloseIcon />
                </IconButton>
              </div>
            )
          ) : (
            <DialogTitle
              style={{ cursor: 'move' }}
              id={titleId}
              className={['dialog-title', dialogTitleStyle].join(' ')}
            >
              <span className="dialog-title-inner">{title}</span>
              <span
                style={{
                  position: 'absolute',
                  right: 1,
                  top: 1,
                }}
              >
                {!canPin ? null : (
                  <IconButton
                    sx={{
                      color: pin ? `var(--cl-blue-400)` : `var(--cl-slate-400)`,
                    }}
                    aria-label="pin"
                    onMouseDown={() => setPin(!pin)}
                    onTouchStart={() => setPin(!pin)}
                  >
                    <PushPinOutlinedIcon />
                  </IconButton>
                )}
                <IconButton
                  aria-label="close"
                  sx={{ color: `var(--cl-slate-400)` }}
                  onMouseDown={() => closeIt()}
                  onTouchStart={() => closeIt()}
                >
                  <CloseIcon />
                </IconButton>
              </span>
            </DialogTitle>
          )}

          <DialogContent id={contentId} className="dialog-body">
            {body}
          </DialogContent>
          <span ref={spanRef} />
          {isEmpty(buttons) && isEmpty(bottomHint) ? null : (
            <DialogActions className="dialog-buttons">
              {bottomHint && (
                <FormControlLabel
                  label={bottomHint?.label ?? ''}
                  sx={{ position: 'relative', left: 12 }}
                  control={
                    <MuiCheckbox
                      onChange={(e, v) => setBottomChecked(v)}
                      style={{ padding: 0 }}
                      checked={bottomHint?.checked}
                      color="info"
                    />
                  }
                />
              )}
              {Object.entries(buttons).map(([label, handler]) => {
                if (handler !== null && typeof handler === 'object') {
                  const {
                    title: btnTitle,
                    color,
                    size = 'medium',
                    variant = 'outlined',
                    onClick,
                  } = handler as DialogHanlderCommand<T>
                  const fn = (params: any) => {
                    params = {
                      ...params,
                      bottomChecked,
                    }
                    const result = Boolean(onClick && onClick(params))
                    if (!result) {
                      setClose(true)
                    }
                  }
                  return (
                    <Button
                      size={size}
                      color={color}
                      variant={variant}
                      key={label}
                      onClick={fn}
                      sx={{ marginLeft: 'auto' }}
                    >
                      {btnTitle}
                    </Button>
                  )
                }
                if (typeof handler === 'function' || handler === null) {
                  const fn = (params: any) => {
                    const result = Boolean(handler && handler(params))
                    if (!result) {
                      setClose(true)
                    }
                  }
                  const variant = handler ? 'outlined' : 'text'
                  return (
                    <Button
                      size="small"
                      key={label}
                      variant={variant}
                      onClick={() => fn({ setClose, bottomChecked })}
                      sx={{ marginLeft: 'auto' }}
                    >
                      {label}
                    </Button>
                  )
                }
                return null
              })}
            </DialogActions>
          )}
        </MuiDialog>
      </ContextDialog.Provider>
    </ErrorBoundary>
  )
}

export function dialogShow<T>(props: DialogProps<T>) {
  const { dialogId = mkid() } = props
  const el = document.getElementById(dialogId)
  if (el) {
    el.style.display = 'block'
  } else {
    fleetRender(<DialogComp dialogId={dialogId} {...props} />)
  }
  return dialogId
}

export function dialogClose(id: string) {
  pub.setState(`is-dialog-close:${id}`, true)
}

export function dialogHide(id: string, isHide = true) {
  const display = isHide ? 'none' : 'block'
  const el = document.getElementById(id)
  if (el) {
    el.style.display = display
  }
}
