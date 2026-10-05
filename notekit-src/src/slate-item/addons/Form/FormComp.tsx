/* eslint-disable @typescript-eslint/no-use-before-define */
import React from 'react'
import { FormikValues, useFormik } from 'formik'
import Box from '@mui/material/Box'
import { FormElProps, FormProps } from './Form'
import { getFormPubKey, useSchema } from './helper'
import { TextElComp } from './components/TextElComp'
import { usePubState } from '../../hooks/usePubState'
import { mkid } from '../../utils/string/mkid'
import { appendStyle } from '../../utils/dom/appendStyle'
import { cls } from '../../styles'
import { useAddons } from '../../hooks/useAddons'
import {
  ContextFormik,
  ContextFormValues,
  ContextOnChangeElement,
} from './FormContexts'
import FormHelperText from '@mui/material/FormHelperText'
import { isEmpty } from '../../utils/isEmpty'

appendStyle(cls`
  button {
    text-transform: none;
  }

  .dialog-body {
    padding: 0 12px;
  }

  .dialog-title + .dialog-body {
    padding: 10px 12px;
  }
`)

export function FormComp<T extends FormikValues>(formProps: FormProps<T>) {
  const {
    subitems,
    initialValues = {} as T,
    onSubmit = () => null,
    name = mkid(),
    onChange,
    onChangeElement = null,
    validate,
  } = formProps

  const validationSchema = useSchema(formProps)
  const [formValues, setFormValues] = usePubState(
    getFormPubKey(name),
    initialValues
  )

  const formik = useFormik<T>({
    initialValues,
    validationSchema,
    validate(vals) {
      const errors = validate?.(vals)
      if (!isEmpty(errors)) {
        return errors
      }
      setFormValues(vals)
      onChange?.(vals)
    },
    onSubmit,
  })

  usePubState(`formik-${name}`, formik)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    formik.handleSubmit(e)
  }

  return (
    <Box
      component="form"
      sx={{
        '& .MuiBox-root': { margin: '16px 8px', width: '25ch' },
      }}
      noValidate
      autoComplete="off"
      onSubmit={handleSubmit}
      onChange={formik.handleChange}
      className={name}
    >
      <ContextFormValues.Provider value={formValues}>
        <ContextFormik.Provider value={formik as any}>
          <ContextOnChangeElement.Provider value={onChangeElement}>
            <FormInnerComp {...formProps} formik={formik as any} />
          </ContextOnChangeElement.Provider>
        </ContextFormik.Provider>
      </ContextFormValues.Provider>
    </Box>
  )
}

export function FormInnerComp<T extends FormikValues>(
  props: FormProps<T> & { formik: ReturnType<typeof useFormik> }
) {
  const { subitems, size = 'small', quote } = props
  const formik = React.useContext(ContextFormik)

  const visible = {} as any
  const $ = useAddons()
  const { values, errors, touched } = formik as any
  const formValues = React.useContext(ContextFormValues)

  return (
    <>
      {!quote ? null : (
        <FormHelperText sx={{ margin: '16px 8px' }}>{quote}</FormHelperText>
      )}
      {Object.entries(subitems).map(([key, elProps]) => {
        const common = {
          value: formValues[key],
          error: touched[key] && Boolean(errors[key]),
          touched: touched[key],
          formik: formik as any,
          name: key,
          size,
        }

        if (typeof elProps === 'function') {
          const CustomRender = elProps as any
          return <CustomRender {...common} values={formValues} />
        }

        if (typeof elProps.render === 'function') {
          const { render: CustomRender } = elProps
          return <CustomRender {...elProps} />
        }

        if (typeof elProps.when !== 'undefined') {
          const w =
            typeof elProps.when === 'function'
              ? elProps.when(formik.values as any, visible)
              : elProps.when
          if (!w) {
            visible[key] = false
            return null
          }
          if (typeof w === 'object') {
            for (const [k, v] of Object.entries(w)) {
              if (values[k] !== v || !visible[k]) {
                visible[key] = false
                return null
              }
            }
          }
        }
        visible[key] = true

        const myProps: FormElProps<T> = {
          quote: touched[key] && errors[key],
          ...elProps,
          ...common,
        }

        const Comp = $.form.getElComponent(elProps.type)
        if (Comp) {
          return <Comp key={key} {...myProps} />
        }
        return <TextElComp key={key} {...myProps} />
      })}
    </>
  )
}

export type FormSetProps = {
  title?: string
  name?: string
  values?: any
  subitems: { [key: string]: FormProps<any> }
}

// export function FormSet(props: FormSetProps) {
//   const { title, subitems, name = mkid(), values = {} } = props;
//   // eslint-disable-next-line prettier/prettier
//   const [formSetValues, setFormSetValues] = usePubState(`form-set:${name}`, values);

//   React.useEffect(() => {
//     pub.on(pub.evt.setState, (pubKey, pubVal) => {
//       if (pubKey.startsWith(FORM_PUB_PREFIX)) {
//         pub.setState(`form-set:${name}`, )
//       }
//     });
//   }, []);

//   return (
//     <Box>
//       {title ? <InputLabel>{title}</InputLabel> : null}
//       {Object.entries(subitems).map(([key, formProps]) => {
//         return <FormComp key={key} {...formProps} />;
//       })}
//     </Box>
//   );
// }
