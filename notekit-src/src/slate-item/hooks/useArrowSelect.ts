import React from 'react'
import { UnitProps } from '../interfaces/unit'
import { scrollIntoView } from '../utils/dom/scrollIntoView'
import { useScrollIntoViewIfNeeded } from './useScrollIntoViewIfNeeded'

export function useArrowSelect(
  props: UnitProps
): [number, React.RefObject<HTMLElement>] {
  const {
    defaultSelected = -1,
    body,
    onSelect = null,
    handle = null,
    closeMenu = null,
  } = props
  const [selectedIndex, setSelected] = React.useState(Number(defaultSelected))
  React.useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229 || !body?.length) return
      if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        let s = e.key === 'ArrowDown' ? selectedIndex + 1 : selectedIndex - 1
        if (s < 0) {
          s = body!.length - 1
        } else if (s >= body!.length) {
          s = 0
        }
        setSelected(s)
      } else if (e.key === 'Enter') {
        const handleSelect = onSelect ?? handle
        if (!handleSelect || !body[selectedIndex]) return
        e.preventDefault()
        e.stopPropagation()
        handleSelect?.({
          item: body?.[selectedIndex],
          event: e,
          closeMenu,
        })
      }
    }
    // Handle menu navigation before the editor's React/Slate key handlers.
    document.addEventListener('keydown', handleKeydown, true)
    return () => {
      document.removeEventListener('keydown', handleKeydown, true)
    }
  }, [body, closeMenu, handle, onSelect, props, selectedIndex])

  const bodyRef = useScrollIntoViewIfNeeded('[data-selected="true"]')

  return [selectedIndex, bodyRef]
}

export type UseSelectProps = {
  length: number // 列表的长度
  bodyRef: React.RefObject<HTMLElement>
  defaultIndex?: number // 初始选中的项
  onChoose?: (index: number) => void // 在确认时调用
  onActive?: (index: number) => void // 在选中项变化时调用
  itemSelector?: string // 选中项的选择器
  activeClass?: string
  scrollSelector?: string
  deps: any[]
}

export const useSelect = (props: UseSelectProps) => {
  const {
    length,
    onActive,
    onChoose,
    bodyRef,
    itemSelector,
    scrollSelector,
    activeClass = 'active',
    deps,
  } = props

  React.useEffect(() => {
    const defaultIndex = props.defaultIndex?? -1
    let selectedIndex = Number(defaultIndex)
    let itemCache: HTMLElement | null = null

    const choose = (isDown: boolean) => {
      let s = isDown ? selectedIndex + 1 : selectedIndex - 1
      if (s < 0) {
        s = length - 1
      } else if (s >= length) {
        s = 0
      }
      selectedIndex = s
      onActive?.(selectedIndex)
      if (itemSelector) {
        itemCache?.classList.remove(activeClass)
        itemCache = bodyRef.current?.querySelector(
          `${itemSelector}:nth-child(${selectedIndex + 1})`
        ) as HTMLElement
        itemCache?.classList.add(activeClass)
        const scrollElement = scrollSelector
          ? itemCache?.closest(scrollSelector)
          : bodyRef.current
        scrollElement &&
          scrollIntoView(itemCache, scrollElement as HTMLElement, 120)
      }
    }

    choose(true)

    const handleKeydown = (e: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        choose(e.key === 'ArrowDown')
        e.preventDefault()
      } else if (e.key === 'Enter') {
        if (e.isComposing || e.keyCode === 229) return;
        let index = selectedIndex
        if (index < 0) {
          index = length - 1
        }
        onChoose?.(index)
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', handleKeydown)
    return () => {
      document.removeEventListener('keydown', handleKeydown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // useScrollIntoViewIfNeeded(`.${activeClass}`, bodyRef);
}
