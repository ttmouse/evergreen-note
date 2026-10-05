import React from 'react'
import InputLabel from '@mui/material/InputLabel'
import { cls } from '../../../styles'
import { FormElProps } from '../Form'
import { FormikValues } from 'formik'
import FormHelperText from '@mui/material/FormHelperText'
import { ContextOnChangeElement } from '../FormContexts'
import MuiSwitch from '@mui/material/Switch'
import { mkid } from '../../../utils/string/mkid'

export type SwitchElProps<V extends FormikValues> = FormElProps<V>

const style = cls`
  margin: 0px 8px;

  label {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
`

export function SwitchElComp<V extends FormikValues>(props: SwitchElProps<V>) {
  const { title, value, name = mkid(), quote, onElChange, formik } = props
  const [val, setVal] = React.useState(!!value)
  const onChangeElement = React.useContext(ContextOnChangeElement)
  const onChange = (e: any, newVal: boolean) => {
    setVal(newVal)
    formik?.setFieldValue(name, newVal)
    onElChange?.(e, newVal)
    onChangeElement?.(name, newVal)
  }
  return (
    <div className={style}>
      <InputLabel htmlFor={name}>
        {title}
        <MuiSwitch onChange={onChange} checked={val} />
      </InputLabel>
      {!quote ? null : <FormHelperText>{quote}</FormHelperText>}
    </div>
  )
}
