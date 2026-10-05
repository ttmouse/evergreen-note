/* eslint-disable @typescript-eslint/no-use-before-define */
import { EventObject, evts } from './evts'

export function createPub() {
  const evtMap = new Map()
  for (const [key, fn] of Object.entries(evts)) {
    ;(fn as any).$pubkey = key
    evtMap.set(fn, [])
  }

  const pb = {
    evt: evts,
    handlers: evtMap,

    when<T extends keyof typeof evts>(
      evt: T,
      handler: (data: typeof evts[T]) => void
    ) {
      return pb.on(pb.evt[evt], handler as any)
    },

    on<F extends Function>(evtType: F, handler: F) {
      const handlers = pb.handlers.get(evtType)
      handlers.push(handler)
    },

    once<F extends Function>(evtType: F, handler: F) {
      pb.on(evtType, ((...args: any) => {
        handler(...args)
        pb.off(evtType, handler)
      }) as any)
    },

    emit<F extends (...args: any[]) => unknown>(
      evtType: F,
      ...args: Parameters<F>
    ) {
      try {
        let result = true
        const handlers = pb.handlers.get(evtType)
        if (handlers) {
          for (const handler of handlers) {
            result = handler(...args) && result
          }
        }
        return result
      } catch (e) {
        console.error(e)
        return false
      }
    },

    setState(id: string, nextState: any, more?: any) {
      pb.emit(pb.evt.setState, id, nextState, more)
    },

    off(evtType: Function, ...handlerList: any[]) {
      const handlers = pb.handlers.get(evtType)
      if (handlers) {
        if (handlerList.length === 0) {
          pb.handlers.set(evtType, [])
          return
        }
        pb.handlers.set(
          evtType,
          handlers.filter((handler: any) => !handlerList.includes(handler))
        )
      }
    },
  }

  return pb
}

export const pub = createPub()

export function createEv() {
  const pb = createPub()
  const ev: EventObject = {
    on: (event, callback) => {
      pb.on(evts[event], callback)
    },

    emit: (event, ...args) => {
      pb.emit(evts[event], ...args)
    },

    once: (event, callback) => {
      pb.once(evts[event], callback)
    },

    off: (event, ...handlerList) => {
      pb.off(evts[event], ...handlerList)
    },
  }

  return ev
}
