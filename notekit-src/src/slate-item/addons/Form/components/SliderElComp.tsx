import React from 'react'
import InputLabel from '@mui/material/InputLabel'
import { cls } from '../../../styles'
import { FormElProps } from '../Form'
import { FormikValues } from 'formik'
import FormHelperText from '@mui/material/FormHelperText'
import { ContextOnChangeElement } from '../FormContexts'
import MuiSlider from '@mui/material/Slider'
import { mkid } from '../../../utils/string/mkid'
import { notEmpty } from '@/slate-item/utils/isEmpty'

export type SwitchElProps<V extends FormikValues> = FormElProps<V>

const style = cls`
  margin: 0px 8px;

  label {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
`

export function SliderElComp<V extends FormikValues>(props: SwitchElProps<V>) {
  const {
    title,
    value,
    defaultValue,
    min,
    max,
    step,
    name = mkid(),
    quote,
    width,
    onElChange,
    formik,
    others,
  } = props
  const [val, setVal] = React.useState(Number(value ?? defaultValue ?? 0))
  const onChangeElement = React.useContext(ContextOnChangeElement)
  const onChange = (e: any, newVal: number | number[]) => {
    newVal = Array.isArray(newVal) ? newVal[0] : newVal
    setVal(newVal)
    formik?.setFieldValue(name, newVal)
    onElChange?.(e, newVal)
    onChangeElement?.(name, newVal)
  }

  return (
    <div className={style} style={{ width }} data-name={name}>
      {notEmpty(title) && (
        <InputLabel htmlFor={name}>
          {title}: {val}
        </InputLabel>
      )}

      <MuiSlider
        name={name}
        aria-label="Small steps"
        defaultValue={val}
        step={step}
        marks={others?.marks ?? true}
        min={min}
        max={max}
        valueLabelDisplay="auto"
        onChange={onChange}
      />
      {notEmpty(quote) && <FormHelperText>{quote}</FormHelperText>}
    </div>
  )
}
