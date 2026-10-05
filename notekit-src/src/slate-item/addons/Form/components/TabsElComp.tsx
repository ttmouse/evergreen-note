import React from 'react'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Box from '@mui/material/Box'
import InputLabel from '@mui/material/InputLabel'
import { FormElProps } from '../Form'
import { FormikValues } from 'formik'
import { getOptions } from '../helper'
import { isEmpty } from '../../../utils/isEmpty'

export type TabsElProps<V extends FormikValues> = {} & FormElProps<V>

export function TabsElComp<V extends FormikValues>(props: TabsElProps<V>) {
  const { value, onElChange, options, formik, name, title } = props
  const handleChange = (event: React.SyntheticEvent, newValue: any) => {
    formik?.setFieldValue(name!, newValue)
    onElChange?.(event, newValue)
  }
  return (
    <Box sx={{ width: '100%' }}>
      {isEmpty(title) ? null : <InputLabel>{title}</InputLabel>}
      <Tabs value={value} onChange={handleChange}>
        {Object.entries(getOptions(options)).map(([k, label]) => (
          <Tab label={label} value={k} key={k} />
        ))}
      </Tabs>
    </Box>
  )
}
