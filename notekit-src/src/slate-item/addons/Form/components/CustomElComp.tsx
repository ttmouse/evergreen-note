import React from 'react'
import { FormElProps } from '../Form'
import { mkid } from '../../../utils/string/mkid'
import InputLabel from '@mui/material/InputLabel'
import FormHelperText from '@mui/material/FormHelperText'
import { cls } from '../../../styles'
import { isEmpty } from '../../../utils/isEmpty'

export const CustomElComp = React.forwardRef(
  (props: FormElProps<any>, ref: React.ForwardedRef<any>) => {
    const { title, quote, name = mkid(), children, className } = props as any
    const styles = [
      cls`margin: 16px 8px; .MuiTextField-root { min-width: 100%; }`,
    ]
    if (!isEmpty(className)) {
      styles.push(className)
    }

    return (
      <div ref={ref} className={styles.join(' ')}>
        {!title ? null : <InputLabel htmlFor={name}>{title}</InputLabel>}
        {children}
        {!quote ? null : <FormHelperText>{quote}</FormHelperText>}
      </div>
    )
  }
)
