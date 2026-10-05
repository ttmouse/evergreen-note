import React from 'react'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import { FormElProps } from '../Form'
import { FormikValues } from 'formik'
import { ContextOnChangeElement } from '../FormContexts'
import { useAddons } from '../../../hooks/useAddons'
import { getOptions } from '../helper'
import IconButton from '@mui/material/IconButton'
import { DotsThreeVerticalIcon as MoreVertIcon } from '@phosphor-icons/react';
import { isEmpty } from '../../../utils/isEmpty'
import { getUserKeys } from '../../Hotkey/helper'

export function KeyElComp<T extends FormikValues>(props: FormElProps<T>) {
  const {
    value,
    title,
    name,
    onElChange,
    type,
    error,
    quote,
    placeholder,
    order = 10,
    options,
    formik,
  } = props

  const onChangeElement = React.useContext(ContextOnChangeElement)
  const [val, setVal] = React.useState(value)

  const handleChange = (e: any) => {
    const v = getUserKeys(e)
    onElChange?.(e, v)
    onChangeElement?.(name!, v)
    setVal(v)
  }

  const $ = useAddons()

  const handleClickIcon = React.useCallback(
    (e: any) => {
      if (typeof options === 'object') {
        const handler = $.form.popup({
          initialValues: {
            suggestion: val,
          },
          subitems: {
            suggestion: {
              type: 'radio',
              options: getOptions(options),
            },
          },
          onChange(values) {
            setVal(values.suggestion as any)
            formik?.setFieldValue(name!, values.suggestion)
            handler.close()
          },
          SnapProps: {
            targetBox: (e.target as HTMLElement).closest('button') as HTMLElement,
            place: ['right-in', 'bottom-out'],
          },
        })
      }
    },
    [$.form, formik, name, options, val]
  )

  return (
    <Box style={{ order, position: 'relative' }}>
      <TextField
        fullWidth
        id={`${type}-${name}`}
        name={name}
        label={title}
        value={val}
        type={type}
        onChange={handleChange as any}
        error={error}
        helperText={quote}
        placeholder={placeholder}
        size="small"
      />
      {!isEmpty(options) && (
        <IconButton
          type="button"
          sx={{ p: '5px', position: 'absolute', right: '2px', top: '5px' }}
          aria-label="search"
          onClick={handleClickIcon}
        >
          <MoreVertIcon size={20} />
        </IconButton>
      )}
    </Box>
  )
}
