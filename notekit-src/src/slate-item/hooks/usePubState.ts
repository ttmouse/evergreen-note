/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react'
import { pub } from '../utils/pub'
import { mkid } from '../utils/string/mkid'

export const PUB_STATES = new Map<string, any>()

export function declarePubState(pubKey?: string) {
  const key = pubKey ?? mkid()
  const combine = (extraKey?: string) => (extraKey ? `${key}:${extraKey}` : key)
  return {
    set(value: any, extraKey?: string) {
      setPubState(combine(extraKey), value)
    },

    get(extraKey?: string) {
      return getPubState(combine(extraKey))
    },
  }
}

export function getPubState(pubKey: string, defaultValue?: any) {
  if (!PUB_STATES.has(pubKey) && typeof defaultValue !== 'undefined') {
    PUB_STATES.set(pubKey, defaultValue)
  }
  if (!PUB_STATES.has(pubKey)) {
    throw new Error(`getPubState() pubKey not found: ${pubKey}`)
  }

  return PUB_STATES.get(pubKey)
}

export function setPubState(pubKey: string, val: any, more?: any) {
  pub.setState(pubKey, val, more)
  PUB_STATES.set(pubKey, val)
}

export function usePubState<T>(
  stateKey: string,
  defaultValue: T | (() => T) | null,
  options?: {
    clearWhenUnmount?: boolean
  }
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [val, setVal] = React.useState(defaultValue ?? ({} as T))
  PUB_STATES.set(stateKey, val)
  const { clearWhenUnmount = true } = options ?? {}

  const setValue = React.useCallback((v: any) => {
    setVal(v)
    pub.setState(stateKey, v)
    PUB_STATES.set(stateKey, v)
  }, [])

  React.useEffect(() => {
    pub.on(pub.evt.setState, (pubKey, pubVal) => {
      if (stateKey === pubKey) {
        setVal(pubVal)
      }
    })
    return () => {
      if (clearWhenUnmount) {
        PUB_STATES.delete(stateKey)
      }
    }
  }, [])
  return [val, setValue]
}

export const PUB_STATES_REDUCER = new Map<
  string,
  { states: any; dispatch: React.Dispatch<any> }
>()

export function getPubReducer(pubKey: string) {
  if (!PUB_STATES_REDUCER.has(pubKey)) {
    throw new Error(`getPubReducer() pubKey not found: ${pubKey}`)
  }

  return PUB_STATES_REDUCER.get(pubKey)
}

export function usePubReducer<T, A>(
  pubKey: string,
  reducer: (current: T, action: A) => T,
  initialState: T,
  initializer?: undefined
) {
  const [pubId] = React.useState(mkid())
  const [states, dispatch] = React.useReducer(
    (current: T, action: A) => {
      const newState = reducer(current, action)
      if (PUB_STATES_REDUCER.has(pubKey)) {
        PUB_STATES_REDUCER.set(pubKey, {
          states: newState,
          dispatch: (act: A) => dispatch(act),
        })
        // pub.emit(pub.evt.dispatch, pubKey, action, pubId)
      }
      return newState
    },
    initialState,
    initializer
  )
  const myDispath = (action: A) => {
    dispatch(action)
    pub.emit(pub.evt.dispatch, pubKey, action)
  }
  PUB_STATES_REDUCER.set(pubKey, { states, dispatch })
  React.useEffect(() => {
    pub.on(pub.evt.dispatch, (k, action: A, thePubId) => {
      if (k === pubKey && pubId !== thePubId) {
        dispatch(action)
      }
    })

    return () => {
      PUB_STATES_REDUCER.delete(pubKey)
    }
  }, [])

  return [states, myDispath] as const
}
