import React from 'react'
import MuiSwitch from '@mui/material/Switch'
import { appendStyle } from '../../../utils/dom/appendStyle'

export type CheckboxNeededProps = {
  value: boolean
  onChange?: (e: React.ChangeEvent, val?: boolean) => void
}

appendStyle(`
  .inline-element .MuiSwitch-switchBase {
    margin-top: -4px !important;
    margin-left: 8px !important;
  }

  .inline-element .MuiSwitch-root {
    padding-top: 0;
    padding-bottom: 0;
    height: 14px;
    overflow: visible;
  }
`)

export function SwitcherComp(props: CheckboxNeededProps) {
  const { value, onChange } = props
  const [val, setVal] = React.useState<boolean>(value)
  const handleChange = (e: React.ChangeEvent) => {
    const v = (e.target as HTMLInputElement).checked
    setVal(v)
    onChange && onChange(e, val)
  }

  return (
    <MuiSwitch onChange={handleChange} style={{ padding: 0 }} checked={val} />
  )
}
