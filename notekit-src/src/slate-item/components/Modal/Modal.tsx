import React, { useState } from 'react'
import { UnitProps } from '../..'
import { fleetRender } from '../../utils/fleetRender'
import { lang } from '../../utils/lang'
import { PopupBox } from '../PopupBox'
import { UnitLayout } from '../UnitLayout'
import { modalStyle } from './Modal.style'

export const MarkLayer = ({ children }: any) => {
  const [visible, setVisible] = useState(true)
  const destory = () => {
    setVisible(false)
  }
  return visible ? (
    <div onClick={destory} className="bg-black opacity-5">
      {children}
    </div>
  ) : (
    <></>
  )
}

/*
  foldup: Modal 最小化
  expand: Modal 恢复正常尺寸
  zoomin: Modal 最大化
  destroy: Modal 销毁
*/

export function Modal(
  props: Partial<UnitProps> & {
    width?: number
    height?: number
  }
) {
  const newProps: any = { ...props }

  const { width = 500, height = 350 } = newProps

  return (
    <PopupBox>
      <UnitLayout
        classOuter="layout-modal"
        layoutType="modal"
        layoutProps={modalStyle()}
        styleOuter={{
          width: `${width}px`,
          height: `${height}px`,
        }}
        {...newProps}
      />
    </PopupBox>
  )
}

export function showModal(props: Partial<UnitProps>) {
  if (typeof props === 'string') {
    props = {
      title: props,
    }
  }
  const newProps = { ...props }
  newProps.extra ??= []
  newProps.extra.push(
    // {
    //   title: <MaterialIcon name="edit_off" />,
    //   shape: "circle"
    // },
    // {
    //   title: <MaterialIcon name="highlight_alt" />,
    //   shape: "circle"
    // },
    {
      title: 'close',
      shape: 'circle',
    }
  )

  fleetRender(<Modal {...newProps} />)
}

type ConfirmParams = {
  textTrue?: string
  textFalse?: string
  onConfirm?: () => void
  onCancel?: () => void
}

export function showConfirm(msg: string, params: ConfirmParams = {}) {
  const newParams = {
    textTrue: lang.got_it,
    textFalse: lang.cancel,
    ...params,
  }
  return new Promise((resolve) => {
    showModal({
      title: ' ',
      body: [{ title: msg }],
      width: 450,
      buttons: [
        {
          title: newParams.textFalse,
          bgColor: ['transparent'],
          onClick: ({ closeModal }: any) => {
            resolve(false)
            closeModal(true)
          },
        },
        {
          title: newParams.textTrue,
          bgColor: ['sky', 500],
          onClick: ({ closeModal }: any) => {
            resolve(true)
            closeModal(true)
          },
        },
      ],
    })
  })
}
