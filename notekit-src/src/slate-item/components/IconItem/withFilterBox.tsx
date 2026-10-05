import React from 'react'
import Box from '@mui/material/Box'
import Input from '@mui/material/Input'
import { cls } from '../../styles'
import { UnitProps } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { filterItems } from '../../addons/SlashMenu/SlashMenu'

export type FilterBoxProps = {
  body?: Partial<UnitProps>[]
  subitems?: Partial<UnitProps>[]
}

const style = cls`& > * { padding: 4px 8px; }`

export function withFilterBox(Component: any, filterBoxProps: FilterBoxProps) {
  const { subitems, body } = filterBoxProps
  const theList = subitems ?? body
  return function FilterBox(props: Omit<UnitProps, 'body' | 'subitems'>) {
    const [list, setList] = React.useState(theList)
    const [keyword, setKeyword] = React.useState('')
    const onKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const evt = (e.nativeEvent as KeyboardEvent);
      if (!evt.isComposing && evt.keyCode !== 229) {
        const kw = e.currentTarget.value
        setList(filterItems(theList as any, kw))
        setKeyword(kw)
      }
    }

    return (
      <>
        <Box className={style}>
          <Input
            autoFocus
            onKeyUp={onKeyUp}
            fullWidth
            placeholder="Search..."
          />
        </Box>
        {isEmpty(list) ? null : (
          <Component
            keyword={keyword}
            defaultSelected={0}
            {...props}
            body={list}
          />
        )}
      </>
    )
  }
}
