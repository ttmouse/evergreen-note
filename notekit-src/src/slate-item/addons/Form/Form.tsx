import React from 'react'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { mkid } from '../../utils/string/mkid'
import { FormComp } from './FormComp'
import { getPubState } from '../../hooks/usePubState'
import { DialogProps } from '../../utils/msg/showDialog'
import { FormikValues, useFormik } from 'formik'
import { BtnsElComp } from './components/BtnsElComp'
import { CodeElComp } from './components/CodeElComp'
import { FileElComp } from './components/FileElComp'
import { RadioElComp } from './components/RadioElComp'
import { SelectElComp } from './components/SelectElComp'
import { EditorElComp } from './components/EditorElComp'
import { FieldsetElComp } from './components/FieldsetElComp'
import { getFormValues } from './helper'
import { AlertElComp } from './components/AlertElComp'
import { TagsElComp } from './components/TagsElComp'
import { ButtonElComp } from './components/Button'
import { TextElComp } from './components/TextElComp'
import { TabsElComp } from './components/TabsElComp'
import { GroupElComp } from './components/GroupElComp'
import { DateElComp } from './components/DateElComp'
import { RatingElComp } from './components/RatingElComp'
import {
  ToggleButtonElComp,
  ToggleButtonElProps,
} from './components/ToggleButtonElComp'
import ListElComp from './components/ListElComp'
import { SwitchElComp } from './components/SwitchElComp'
import { SliderElComp } from './components/SliderElComp'
import { KeyElComp } from './components/KeyElComp'

export const FORM_EL_MAPS = {
  text: TextElComp,
  number: TextElComp,
  slider: SliderElComp,
  textarea: TextElComp,
  logicString: TextElComp,
  date: DateElComp,
  rating: RatingElComp,
  toggleButton: ToggleButtonElComp,
  list: ListElComp,
  key: KeyElComp,

  radio: RadioElComp,
  switch: SwitchElComp,
  select: SelectElComp,
  btns: BtnsElComp,
  file: FileElComp,
  code: CodeElComp,
  editor: EditorElComp,
  fieldset: FieldsetElComp,
  group: GroupElComp,
  alert: AlertElComp,
  tags: TagsElComp,
  button: ButtonElComp,
  tabs: TabsElComp,
} as const

export type FormEleType = keyof typeof FORM_EL_MAPS
export type Options = string[] | { [key: string]: any }
export type ReturnTypeOfFormik = typeof useFormik

export const FORM_EL: { [type in FormEleType]: type } = (() => {
  const obj: any = {}
  for (const k of Object.keys(FORM_EL_MAPS)) {
    obj[k] = k
  }
  return obj
})()

export type FormSubitems<V extends FormikValues> = {
  [key in keyof V]:
    | FormElProps<V>
    | ((props: FormElProps<V> & { values: V }) => JSX.Element)
}

export type BaseElProps<V extends FormikValues> = {
  type: FormEleType
  name?: string
  value?: string | object
  defaultValue?: string
  title?: string
  quote?: string | JSX.Element
  width?: number
  height?: number
  placeholder?: string
  min?: number
  max?: number
  step?: number
  options?: Options
  canMore?: boolean
  touched?: any
  error?: any
  size?: 'small' | 'medium'
  focused?: boolean
  autoFocus?: boolean
  order?: number
  multiple?: boolean
  rows?: number

  formik?: ReturnType<typeof useFormik>

  onClick?: (e: any) => void

  onElChange?: (e: any, v: any) => void
  required?: boolean | (() => boolean)
  disabled?: boolean | (() => boolean)
  readonly?: boolean | (() => boolean)
  accept?: string
  when?:
    | { [k in keyof V]?: V[k] }
    | ((values: V, visible?: { [k in keyof V]?: boolean }) => boolean)

  subitems?: FormSubitems<V>

  render?: (props: FormElProps<V>) => JSX.Element

  others?: any
}

export type TextElProps<V extends FormikValues> = BaseElProps<V>

export type FormElProps<V extends FormikValues> =
  | TextElProps<V>
  | ToggleButtonElProps<V>

export type FormProps<V extends FormikValues> = {
  name?: string
  title?: string
  initialValues?: V
  size?: 'small' | 'medium'
  quote?: string
  subitems: FormSubitems<V>
  validate?: (values: V) => any
  onSubmit?: (values: V) => void
  onChange?: (values: V) => void
  onChangeElement?: (k: string, v: any) => void
}

export type FormHanlder<V> = {
  dialogId: string
  close: () => void
  values: Promise<V | void>
  getValues: () => V
  setValues: (vals: Partial<V>) => void
}

export type PopupFormProps<V extends FormikValues> = FormProps<V> &
  Pick<DialogProps<V>, 'width' | 'buttons' | 'beforeClose'> & {
    SnapProps?: DialogProps<V>['SnapProps']
    DialogProps?: Partial<DialogProps<V>>
    FormWrap?: (props: any) => JSX.Element
  }

export function createFormAddon({ app, $ }: NewAddonParams) {
  class Form implements IAddon {
    app!: App
    config = {}

    maps = FORM_EL_MAPS

    getElComponent(type: FormEleType): React.FC | undefined {
      return (this.maps as any)[type]
    }

    registerComponents(comps: { [key: string]: React.FC }) {
      Object.assign(this.maps, comps)
    }

    /**
     * 以弹窗的形式显示表单
     * @param formProps
     * @returns 返回一个用于控制表单的处理对象
     */
    popup<V extends FormikValues>(
      formProps: PopupFormProps<V>
    ): FormHanlder<V> {
      const {
        title,
        name = mkid(),
        beforeClose,
        SnapProps,
        FormWrap = (props: any) => (
          <div className="form-wrap">{props.children}</div>
        ),
      } = formProps
      const getValues = (): V => {
        return getFormValues<V>(name) || formProps.initialValues
      }
      const buttons: DialogProps<V>['buttons'] = {} as any
      const values = new Promise<V>((resolve, reject) => {
        if (formProps.buttons) {
          for (const [btnName, btnProps] of Object.entries(formProps.buttons)) {
            if (typeof btnProps === 'function') {
              buttons![btnName] = () => {
                resolve(btnProps(getValues() as any) as any)
              }
            } else if (btnProps && typeof btnProps === 'object') {
              const { onClick = () => {}, ...rest } = btnProps!
              buttons![btnName] = {
                ...rest,
                onClick() {
                  resolve(onClick(getValues() as any) as any)
                },
              }
            } else {
              // null
              buttons![btnName] = btnProps
            }
          }
        }
      })

      const { width, DialogProps: dialogProps = {} } = formProps
      const dialogId = $.dialog.show({
        title,
        body: (
          <FormWrap>
            <FormComp {...formProps} name={name} />
          </FormWrap>
        ),
        buttons,
        beforeClose,
        SnapProps,
        width,
        ...dialogProps,
      })

      return {
        dialogId,
        close: () => $.dialog.remove(dialogId),
        values,
        getValues: () => getFormValues<V>(name),
        setValues: (vals) => {
          // eslint-disable-next-line prettier/prettier
          const formik = getPubState(`formik-${name}`) as ReturnType<typeof useFormik>
          for (const [key, val] of Object.entries(vals)) {
            formik.setFieldValue(key, val)
          }
        },
      }
    }

    addonRun() {}
  }

  return { form: new Form() }
}
