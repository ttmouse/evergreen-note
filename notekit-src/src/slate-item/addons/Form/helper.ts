import React from 'react'
import * as yup from 'yup'
import { getPubState } from '../../hooks/usePubState'
import { FormElProps, FormProps, Options } from './Form'
import { FormikValues } from 'formik'
import { $t } from '../../../i18n'
import { ContextOnChangeElement } from './FormContexts'

export function isTextType(type: string) {
  return [
    'text',
    'email',
    'password',
    'radio',
    'select',
    'number',
    'slider',
  ].includes(type)
}

export function getOptions(options?: Options) {
  if (Array.isArray(options)) {
    options = options.reduce((acc: any, o) => {
      acc[o] = o
      return acc
    }, {})
  }
  return options ?? {}
}

export function useSchema(props: FormProps<any>) {
  const { subitems } = props

  return React.useMemo(() => {
    const schema: any = {}
    for (const [key, elProps] of Object.entries(subitems)) {
      if (isTextType(elProps.type)) {
        schema[key] = yup.string()
      }
      if (elProps.required) {
        schema[key] = schema[key].required()
      }
      if (elProps.type === 'email') {
        schema[key] = schema[key].email()
      }
      if (elProps.type === 'number') {
        schema[key] = schema[key]?.matches(/^\d+$/)
      }
      if (elProps.min) {
        schema[key] = schema[key].min(elProps.min)
      }
      if (elProps.max) {
        schema[key] = schema[key].max(elProps.max)
      }
    }
    return yup.object(schema)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export const FORM_PUB_PREFIX = 'form-values:'

export function getFormPubKey(formName: string) {
  return `${FORM_PUB_PREFIX}${formName}`
}

export function useChange(props: FormElProps<any>) {
  const { name, onElChange, value, formik } = props
  const [val, setVal] = React.useState(value)
  const onChangeElement = React.useContext(ContextOnChangeElement)
  const onChange = (e: any, newVal: string) => {
    setVal(newVal)
    formik?.setFieldValue(name!, newVal)
    onElChange?.(e, newVal)
    onChangeElement?.(name!, newVal)
  }
  return onChange
}

export function getFormValues<V extends FormikValues>(formName: string): V {
  return getPubState(getFormPubKey(formName))
}

export const switchOptions = {
  on: $t`common.on`,
  off: $t`common.off`,
}
