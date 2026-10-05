import React from 'react'
import Snackbar from '@mui/material/Snackbar'
import { createTmpDom } from '../dom/createTmpDom'
import MuiAlert, { AlertProps } from '@mui/material/Alert'
import { pub } from '../pub'
import LinearProgress from '@mui/material/LinearProgress'
import { mkid } from '../string/mkid'
import { TimeMilliSecond } from '../../interfaces/unit'
import { reactRender } from '../common'

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  props,
  ref
) {
  return <MuiAlert elevation={6} ref={ref} variant="filled" {...props} />
})

export type SnackbarProps = {
  vertical: 'top' | 'bottom'
  horizontal: 'left' | 'center' | 'right'
  content: string | JSX.Element
  open: boolean
  severity: 'success' | 'info' | 'warning' | 'error' | 'default'
  autoClose: number // milliseconds
  id?: string
  progress?: number | boolean // [0, 100]
  clickAway?: boolean
  ClickAwayListenerProps?: {
    onClickAway?: Function
    mouseEvent?:
      | 'onClick'
      | 'onMouseDown'
      | 'onMouseUp'
      | 'onPointerDown'
      | 'onPointerUp'
      | false
    touchEvent?: 'onTouchEnd' | 'onTouchStart' | false
  }
}

export function MySnack(params: Partial<SnackbarProps>) {
  const [state, setState] = React.useState<SnackbarProps>({
    open: true,
    vertical: 'top',
    horizontal: 'center',
    content: '',
    severity: 'default',
    autoClose: 3000,
    clickAway: true,
    ...params,
  })
  const {
    clickAway,
    vertical,
    horizontal,
    open,
    content,
    severity,
    autoClose,
    progress,
  } = state

  const ClickAwayListenerProps = clickAway
    ? {}
    : {
        mouseEvent: false,
        touchEvent: false,
      }

  const handleClose = () => {
    setState({ ...state, open: false })
  }

  React.useEffect(() => {
    let timer: NodeJS.Timeout
    if (autoClose > 0) {
      timer = setTimeout(handleClose, autoClose)
    }

    const fn = (id: string, values: any) => {
      if (id === state.id && typeof values === 'object') {
        const { autoClose: auto, ...rest } = values
        setState({ ...state, ...rest })
        if (typeof auto === 'number') {
          if (timer) {
            clearTimeout(timer)
          }
          setTimeout(handleClose, auto)
        }
      }
    }
    pub.on(pub.evt.setState, fn)

    return () => {
      pub.off(pub.evt.setState, fn)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 显示进度条
  const message =
    typeof progress !== 'number' ? (
      content
    ) : (
      <>
        {content}
        <div style={{ marginTop: 10 }}>
          <LinearProgress variant="determinate" value={progress} />
        </div>
      </>
    )

  if (severity === 'default') {
    return (
      <Snackbar
        id={state.id}
        anchorOrigin={{ vertical, horizontal }}
        open={open}
        onClose={handleClose}
        message={message}
        key={vertical + horizontal}
        ClickAwayListenerProps={ClickAwayListenerProps as any}
      />
    )
  }

  return (
    <Snackbar
      id={state.id}
      anchorOrigin={{ vertical, horizontal }}
      open={open}
      onClose={handleClose}
      key={vertical + horizontal}
      ClickAwayListenerProps={ClickAwayListenerProps as any}
    >
      <Alert severity={severity}>{message}</Alert>
    </Snackbar>
  )
}

export type SnackHanlder = {
  id: string
  update: (newVal: Partial<SnackbarProps>) => void
  close: (wait: TimeMilliSecond) => void
  progress: (num_0_to_100: number) => void
  success: (content?: string) => void
  setMsg: (msg: string) => void
}

export function updateSnack(id: string, newVal: Partial<SnackbarProps>) {
  pub.emit(pub.evt.setState, id, newVal)
}

export function showSnack(
  params: string | Partial<SnackbarProps>
): SnackHanlder {
  if (typeof params === 'string') {
    params = { content: params }
  }

  params.id ??= mkid()

  reactRender(createTmpDom(), <MySnack {...params} />)

  const update = (newVal: Partial<SnackbarProps>) => {
    updateSnack((params as SnackbarProps).id!, newVal)
  }

  // Return a handler to control <Snackbar /> after rendering
  return {
    id: params.id,

    update,

    close(wait: TimeMilliSecond = 3000) {
      update({ autoClose: wait })
    },

    progress(num_0_to_100: number) {
      update({ progress: num_0_to_100 })
      if (num_0_to_100 >= 100) {
        this.success()
      }
    },

    setMsg(msg: string) {
      update({ content: msg })
    },

    success(content = 'Completed !') {
      update({
        content,
        progress: false,
        autoClose: 3000,
        severity: 'success',
      })
    },
  }
}

export function showError(msg: string, autoClose = 60000) {
  showSnack({
    content: msg,
    severity: 'error',
    autoClose,
  })
}
