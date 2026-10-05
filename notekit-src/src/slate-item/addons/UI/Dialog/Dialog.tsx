import { makeAutoObservable, runInAction } from 'mobx'
import React from 'react'
import ReactDOM from 'react-dom'
import { IAddon, App, NewAddonParams } from '../../../engine/App'
import { createTmpDom } from '../../../utils/dom/createTmpDom'
import {
  DialogComp,
  DialogHandlerFunc,
  DialogProps as ShowDialogProps,
} from '../../../utils/msg/showDialog'
import { pub } from '../../../utils/pub'
import { mkid } from '../../../utils/string/mkid'
import { DialogContainer } from './DialogContainer'
import { $t } from '../../../../i18n'
import { isEmpty } from '../../../utils/isEmpty'
import Alert from '@mui/material/Alert'
import {
  Dialog as NUIDialog,
  DialogProps as NUIDialogProps,
} from '../../../notekit-ui/components/Dialog/Dialog'

type DialogInstance = {
  id: string
  comp: React.FC<any>
}

export type DialogEntry = {
  id: string
  visible: boolean
  folded: boolean
  pinned: boolean
  position: { left: number; top: number }
  size: { width: number; height: number }
  zIndex: number
  rendered: boolean
  comp?: React.FC<any>
}

export enum CONFIRM_RESULT {
  YES = 'yes',
  NO = 'no',
}

export class DialogStore {
  entries: Map<string, DialogEntry> = new Map()
  order: string[] = []
  dialogComponents: DialogInstance[] = []
  private _zIndexCounter: number = 10001

  constructor() {
    makeAutoObservable(this)
  }

  nextZIndex(): number {
    return this._zIndexCounter++
  }

  register(id: string, entry: Partial<DialogEntry> & { pos?: number } = {}) {
    const existing = this.entries.get(id)
    if (existing) {
      runInAction(() => {
        existing.visible = entry.visible ?? true
      })
      return existing
    }
    const newEntry: DialogEntry = {
      id,
      visible: entry.visible ?? true,
      folded: entry.folded ?? false,
      pinned: entry.pinned ?? false,
      position: entry.position ?? { left: -10000, top: -10000 },
      size: entry.size ?? { width: 0, height: 0 },
      zIndex: entry.zIndex ?? this.nextZIndex(),
      rendered: entry.rendered ?? false,
      comp: entry.comp,
    }
    runInAction(() => {
      this.entries.set(id, newEntry)
      if (!this.order.includes(id)) {
        if (typeof entry.pos === 'number' && entry.pos >= 0) {
          this.order = [
            ...this.order.slice(0, entry.pos),
            id,
            ...this.order.slice(entry.pos),
          ]
        } else {
          this.order.push(id)
        }
      }
    })
    return newEntry
  }

  unregister(id: string) {
    runInAction(() => {
      this.entries.delete(id)
      this.order = this.order.filter((oid) => oid !== id)
    })
  }

  update(id: string, patch: Partial<DialogEntry>) {
    const entry = this.entries.get(id)
    if (!entry) return
    runInAction(() => {
      Object.assign(entry, patch)
    })
  }

  setPosition(id: string, left: number, top: number) {
    const entry = this.entries.get(id)
    if (!entry) return
    runInAction(() => {
      entry.position = { left, top }
    })
  }

  setSize(id: string, width: number, height: number) {
    const entry = this.entries.get(id)
    if (!entry) return
    runInAction(() => {
      entry.size = { width, height }
    })
  }

  setFolded(id: string, folded: boolean) {
    const entry = this.entries.get(id)
    if (!entry) return
    runInAction(() => {
      entry.folded = folded
    })
  }

  setPinned(id: string, pinned: boolean) {
    const entry = this.entries.get(id)
    if (!entry) return
    runInAction(() => {
      entry.pinned = pinned
    })
  }

  setVisible(id: string, visible: boolean) {
    const entry = this.entries.get(id)
    if (!entry) return
    runInAction(() => {
      entry.visible = visible
    })
  }

  setRendered(id: string, rendered: boolean) {
    const entry = this.entries.get(id)
    if (!entry) return
    runInAction(() => {
      entry.rendered = true
    })
  }

  bringToFront(id: string) {
    const entry = this.entries.get(id)
    if (!entry) return
    runInAction(() => {
      entry.zIndex = this.nextZIndex()
    })
  }

  has(id: string): boolean {
    return this.entries.has(id)
  }

  get(id: string): DialogEntry | undefined {
    return this.entries.get(id)
  }

  reorder(id: string, newIndex: number) {
    runInAction(() => {
      const oldIndex = this.order.indexOf(id)
      if (oldIndex === -1) return
      this.order.splice(oldIndex, 1)
      this.order.splice(newIndex, 0, id)
    })
  }

  swap(id1: string, id2: string) {
    runInAction(() => {
      const i1 = this.order.indexOf(id1)
      const i2 = this.order.indexOf(id2)
      if (i1 === -1 || i2 === -1) return
      this.order[i1] = id2
      this.order[i2] = id1
    })
  }

  applyOrderToDom() {
    this.order.forEach((id, index) => {
      const el = document.getElementById(id)
      if (el) {
        el.style.order = String(index)
      }
    })
  }

  addDialogComponent(instance: DialogInstance) {
    runInAction(() => {
      this.dialogComponents.push(instance)
    })
  }

  removeDialogComponent(id: string) {
    runInAction(() => {
      this.dialogComponents = this.dialogComponents.filter(
        (one) => one.id !== id
      )
    })
  }

  clearAll() {
    runInAction(() => {
      this.entries.clear()
      this.order = []
      this.dialogComponents = []
    })
  }
}

/*
 为了让 Dialog 组件也可以读取到 App 的 context 变量，
 需要将 Dialog 挂载到 App 的组件树上。
 */
export function createDialogAddon({ $ }: NewAddonParams) {
  class Dialog implements IAddon {
    app!: App
    config = {}
    store = new DialogStore()

    get dialogComponents() {
      return this.store.dialogComponents
    }

    set dialogComponents(val: DialogInstance[]) {
      this.store.dialogComponents = val
    }

    show<T>(props: ShowDialogProps<T>) {
      const { dialogId = mkid() } = props as any
      const el = document.getElementById(dialogId)
      if (el) {
        el.style.display = 'block'
        this.store.register(dialogId, { visible: true })
      } else {
        const container = createTmpDom()
        this.store.addDialogComponent({
          id: dialogId,
          comp: React.memo(() => {
            return ReactDOM.createPortal(
              <DialogComp dialogId={dialogId} {...(props as any)} />,
              container
            )
          }),
        })
        this.store.register(dialogId, { visible: true })
      }
      return dialogId
    }

    popup(props: NUIDialogProps & { pos?: number }) {
      const {
        dialogId,
        id,
        container = (this.app as any).addons?.ui?.container,
        pos,
        ...rest
      } = props
      const dlgId = dialogId || id || mkid()
      const el = document.getElementById(dlgId)
      if (el) {
        el.style.display = 'block'
        this.store.register(dlgId, {
          visible: true,
          pos: pos,
        })
      } else {
        // Register position before mounting; onMounted also registers the dialog.
        this.store.register(dlgId, {
          visible: true,
          pos: pos,
        })
        this.store.addDialogComponent({
          id: dlgId,
          comp: React.memo(() => {
            return ReactDOM.createPortal(
              <NUIDialog
                onClose={() => this.close(dlgId)}
                id={dlgId}
                {...rest}
              />,
              container
            )
          }),
        })
      }
      return dlgId
    }

    confirm(
      message: string | JSX.Element,
      options:
        | DialogHandlerFunc<any>
        | {
            onConfirm: DialogHandlerFunc<any>
            confirmLabel?: string
            cancelLabel?: string
            // 记住用户的选择
            canRembember?: boolean | { dontShowAgainLabel?: string }
            dialogId?: string // 假如 canRemember 为 true，那么需要指定 dialogId
            severity?: 'success' | 'info' | 'warning' | 'error'
            DialogProps?: Partial<any>
          }
    ) {
      if (typeof options === 'function') {
        options = { onConfirm: options }
      }
      const {
        onConfirm,
        confirmLabel = $t`common.confirm`,
        cancelLabel = $t`common.cancel`,
        canRembember = false,
        dialogId = '',
        DialogProps: dialogProps = {},
        severity,
      } = options

      const rememberKey = `remember-${dialogId}`
      if (canRembember) {
        if (isEmpty(dialogId)) {
          throw new Error(
            'options.dialogId is required when options.canRemember is true'
          )
        }
        const remembered = localStorage.getItem(rememberKey!)
        if (remembered) {
          if (remembered === CONFIRM_RESULT.YES) {
            onConfirm({})
          }
          return
        }
      }

      const body = isEmpty(severity) ? (
        message
      ) : (
        <Alert severity={severity}>{message}</Alert>
      )

      let dontShowAgainLabel = `Don't show this again`
      if (typeof canRembember === 'object' && canRembember.dontShowAgainLabel) {
        dontShowAgainLabel = canRembember.dontShowAgainLabel
      }

      this.show({
        title: $t`common.notice`,
        body,
        dialogId: isEmpty(dialogId) ? mkid() : dialogId,
        bottomHint: !canRembember
          ? undefined
          : {
              checkbox: true,
              label: dontShowAgainLabel,
            },
        buttons: {
          [confirmLabel]: (params: any) => {
            const { bottomChecked } = params
            if (bottomChecked) {
              localStorage.setItem(rememberKey!, CONFIRM_RESULT.YES)
            }
            onConfirm({
              ...params,
              bottomChecked,
            })
          },
          [cancelLabel]: (params: any) => {
            const { bottomChecked } = params
            if (bottomChecked) {
              localStorage.setItem(rememberKey!, CONFIRM_RESULT.NO)
            }
          },
        },
        onClose() {
          if (canRembember) {
            localStorage.setItem(rememberKey!, CONFIRM_RESULT.NO)
          }
        },
        maxWidth: 'xs',
        ...(dialogProps as any),
      })
    }

    add(dialogInstance: DialogInstance, options?: { pos?: number }) {
      this.store.addDialogComponent(dialogInstance, options)
    }

    hide(dialogId: string) {
      const el = document.getElementById(dialogId)
      if (el) {
        el.style.display = 'none'
      }
      this.store.setVisible(dialogId, false)
    }

    remove(dialogId: string) {
      this.store.removeDialogComponent(dialogId)
      this.store.unregister(dialogId)
    }

    close(dialogId: string) {
      this.remove(dialogId)
    }

    closeAll() {
      this.store.clearAll()
    }

    addonBeforeRun() {
      const $ = (this.app as any).addons
      $.hotkey.addCommands({
        closeAllDialog: {
          title: 'Close all dialog',
          hotkey: 'mod+shift+esc',
          context: 'everywhere',
          handle() {
            $.dialog.closeAll()
          },
        },
      })
    }

    addonRun() {
      const $ = (this.app as any).addons
      const { ui } = this.app.addons
      ui.pushComponent(DialogContainer)

      pub.on(pub.evt.setState, (id: string, newState: any) => {
        if (id.startsWith('is-dialog-close:') && newState) {
          const dialogId = id.replace('is-dialog-close:', '')
          this.remove(dialogId)
        }
      })
    }
  }

  return { dialog: new Dialog() }
}
