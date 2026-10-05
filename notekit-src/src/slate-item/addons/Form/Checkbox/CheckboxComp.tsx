import React from 'react'
import MuiCheckbox from '@mui/material/Checkbox'

export type CheckboxNeededProps = {
  value: boolean
  onChange?: (e: React.ChangeEvent) => void
}

export function CheckboxComp(props: CheckboxNeededProps) {
  const { value, onChange } = props
  const [val, setVal] = React.useState<boolean>(value)
  const handleChange = (e: React.ChangeEvent) => {
    const v = (e.target as HTMLInputElement).checked
    setVal(v)
    onChange && onChange(e)
  }

  React.useEffect(() => {
    setVal(value)
  }, [value])

  return (
    <MuiCheckbox
      onChange={handleChange}
      disableRipple
      // CSS middle aligns to the Latin x-height, slightly below CJK glyphs.
      // Keep the line-box contribution at text size. MUI's 24px icon remains
      // centered and visible, but must not expand the surrounding text line.
      // MUI's root defaults to 48px wide; with height forced to 1em that leaves
      // a wide transparent box whose hover background renders as an ellipse.
      // Constrain both dimensions and kill the ripple/hover background.
      style={{ padding: 0, width: '1em', height: '1em', fontSize: 'inherit', transform: 'translateY(-0.1em)' }}
      sx={{ '&:hover': { backgroundColor: 'transparent' }, '&.Mui-checked:hover': { backgroundColor: 'transparent' } }}
      checked={val}
    />
  )
}
