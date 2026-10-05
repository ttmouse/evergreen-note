import { useContext } from 'react'
import { ContextApp } from '../addons/UI/UIContexts'

export function useApp() {
  return useContext(ContextApp)
}

export function useConf() {
  const app = useApp()
  return app.cfg
}

export function useHookable(
  hookName: string,
  params: Object,
  callback: () => any
) {
  const app = useApp()
  return app.invoke(hookName, params, callback)
}
