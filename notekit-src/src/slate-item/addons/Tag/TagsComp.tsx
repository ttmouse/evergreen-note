import React from 'react'
import { useItem } from '../../hooks/useItem'
import Chip from '@mui/material/Chip'
import { trimSharp } from './helper'
import { XIcon as CloseIcon } from '@phosphor-icons/react';
import './tag.less'

export type TagsProps = {}

export function TagsComp(props: TagsProps) {
  const item = useItem()
  if (!Array.isArray(item.tags)) {
    return null
  }
  return (
    <span className="tags">
      {item.tags
        .filter((tag) => tag.endsWith('#'))
        .map((tag) => (
          <Chip
            label={trimSharp(tag)}
            key={tag}
            size="small"
            variant="outlined"
            color="primary"
            deleteIcon={<CloseIcon />}
            onDelete={() => {}}
          />
        ))}
    </span>
  )
}
