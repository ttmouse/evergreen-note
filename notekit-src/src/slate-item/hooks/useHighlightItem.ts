import React from 'react'
import { appendStyle } from '../utils/dom/appendStyle'
import { ContextEditorInfo } from '../addons/EditorView/EditorViewContexts'
import { UnitPersist } from '../interfaces/unit'
import { isVisibleWhenOverflow } from '../utils/dom/isVisibleWhenOverflow'
import { scrollIntoViewSmoothly } from '../utils/dom/scrollIntoView'

const duration = 5

appendStyle(`
.node-highlight {
  animation: highlight ${duration}s ease-in;
}

@keyframes highlight {
  0% {
    background-color: var(--cl-slate-300);
    border-radius: 4px;
  }
  100% {
    background-color: transparent;
    border-radius: 0;
  }
}
`)

export function useHighlightItem(
  item: UnitPersist,
  ref: React.MutableRefObject<HTMLElement>
) {
  const { props } = React.useContext(ContextEditorInfo)

  React.useEffect(() => {
    const el = ref.current

    if (!el || !props.highlightItems?.includes(item.ky)) {
      return
    }

    el.classList.add('node-highlight')
    setTimeout(() => {
      el.classList.remove('node-highlight')
    }, duration * 1000)

    setTimeout(() => {
      const { bottom } = el.getBoundingClientRect()
      if (!isVisibleWhenOverflow(el) || bottom > window.innerHeight) {
        // el.scrollIntoView()
        scrollIntoViewSmoothly(el)
      }
    }, 500)
  }, [item.ky, props.highlightItems, ref])
}
