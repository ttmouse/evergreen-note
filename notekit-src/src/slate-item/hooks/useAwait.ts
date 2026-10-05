import React from 'react'

export function useAwait(fn: () => void, vars: any[]) {
  React.useLayoutEffect(() => {
    fn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, vars)
}
