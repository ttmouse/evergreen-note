import { FormikValues } from 'formik'
import React from 'react'
import { FormElProps } from '../Form'
import { useChange } from '../helper'
import { CustomElComp } from './CustomElComp'
import Rating from '@mui/material/Rating'

export type DateElProps<V extends FormikValues> = FormElProps<V> & {}

export const RatingElComp = (props: FormElProps<any>) => {
  const { value, name } = props
  const [val, setVal] = React.useState<number | null>(Number(value) ?? 2)
  const onChange = useChange(props)
  const handleChange = (
    event: React.ChangeEvent<{}>,
    newValue: number | null
  ) => {
    onChange(null, newValue as any)
    setVal(newValue)
  }

  return (
    <CustomElComp {...props}>
      <Rating onChange={handleChange} name={name} value={val} />
    </CustomElComp>
  )
}
