import React from 'react'
import InputLabel from '@mui/material/InputLabel'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import { FormElProps } from '../Form'
import { FormikValues } from 'formik'
import { cls } from '../../../styles'
import { isEmpty } from '../../../utils/isEmpty'

export const alertStyle = cls`box-shadow: none !important; margin-top: 8px; margin-bottom: 28px;`

export function AlertElComp<V extends FormikValues>(
  props: FormElProps<V> & {
    severity?: 'error' | 'warning' | 'info' | 'success'
  }
) {
  const { title, name, quote, order = 10, severity = 'info' } = props

  return (
    <Box style={{ order }}>
      {!isEmpty(title) && (
        <InputLabel variant="standard" htmlFor={`uncontrolled-native${name}`}>
          {title}
        </InputLabel>
      )}
      <Alert severity={severity} className={alertStyle}>
        {quote}
      </Alert>
    </Box>
  )
}
