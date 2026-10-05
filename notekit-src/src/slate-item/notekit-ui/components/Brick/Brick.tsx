/* eslint-disable @typescript-eslint/no-use-before-define */
import React from 'react'
import { NPart, NPartProps } from '../NPart/NPart'
import { isEmpty } from '../../../utils/isEmpty'
import '../../styles/variables.less'
import { SvgIconName } from '../../../../components/SvgIcon'
import { Cue } from '../Cue/Cue'
import { pick } from '@/slate-item/utils/object/pick'

export type BrickJson = {
  id?: string
  title?: string
  body?: string
  subitems?: string
  footer?: BrickPropsContent
}

export interface BrickProps {
  id?: string
  icon?: SvgIconName | JSX.Element
  title?: string | JSX.Element
  body?: BrickPropsContent
  tip?: string | JSX.Element
  subitems?: BrickPropsContent
  footer?: BrickPropsContent
  extra?: BrickPropsContent
  render?: (params: BrickProps, ref: any) => JSX.Element
  cssClass?: NPartProps['cssClass']
  children?: React.ReactNode
  type?: string
  order?: number
  SubitemComponent?: React.ComponentType<any>
  canEdit?: boolean
  partClasses?: {
    outer?: string
    icon?: string
    head?: string
    title?: string
    body?: string
    subitems?: string
    footer?: string
    extra?: string
  }
  model?: BrickProps & { data?: any }
  [k: string]: any
}

export type BrickPropsList = BrickProps[]
export type BrickPropsMap = { [k: string]: BrickProps }
export type BrickPropsContent =
  | null
  | string
  | JSX.Element
  | BrickPropsList
  | BrickPropsMap

export const ATOMIC_CLASS_MAP = {
  outer: 'nui-atomic',
  icon: 'node-icon',
  head: 'node-head',
  title: 'node-text',
  body: 'node-body',
  subitems: 'node-subitems',
  footer: 'node-footer',
  extra: 'node-extra',
}

/**
 * 组件名称：Brick
 * 在 NotekitUI 的体系里，万物都是基于 Brick 的组件模型来构建的，
 * 无论是小到一个 icon、一个 button，还是大到一个 list、一个 dialog 或者是一个 page，
 * 它们的内部结构都是一样的，都是由 Outer、Head、Title、Body、Subitems、Footer、Extra 这些部件组成的。
 * 它们之间的区别只是在于它们的内容、样式、交互等等。
 * 通过这个模型机制，我们就可以用同一种数据结构来描述所有的组件，让这些组件在不同的情况下，可以无缝互相转换。
 */
export const Brick = React.forwardRef((props: BrickProps, ref: any) => {
  const { model } = props
  const {
    icon,
    title,
    body,
    subitems,
    footer,
    partClasses = {},
    extra,
    tip,
    children,
    type = 'node',
    cssClass,
    order,
    style = {},
    SubitemComponent,
    canEdit,
    render,
    ...outerProps
  } = model ?? props

  // 在 subitems 和 body 同时存在时，subitems 优先
  const theClass = Array.isArray(cssClass) ? cssClass : [cssClass]

  if (typeof order === 'number') {
    style.order = order
  }

  const comp = render?.(props, ref) ?? (
    <NPart
      {...outerProps}
      cssClass={[type, partClasses.outer, ...theClass]}
      ref={ref}
      style={style}
    >
      <BrickChildren {...props} />
    </NPart>
  )

  return isEmptyContent(tip) ? comp : <Cue title={tip as any}>{comp}</Cue>
})

export function BrickChildren(props: BrickProps) {
  const { children } = props

  const hasChildren: { [k: string]: any } = {}
  const others: any = []
  React.Children.forEach(children, (child) => {
    if (child) {
      const t = (child as any).type
      if (typeof t === 'function') {
        const name = t.name || t.displayName
        if (name.endsWith('Head')) {
          hasChildren.head = child
        } else if (name.endsWith('Body') || name.endsWith('Subitems')) {
          hasChildren.body = child
        } else if (name.endsWith('Footer')) {
          hasChildren.footer = child
        } else {
          others.push(child)
        }
      } else {
        others.push(child)
      }
    }
  })

  return (
    <>
      {hasChildren.head ?? (
        <BrickHead
          {...pick(props, [
            'icon',
            'title',
            'extra',
            'partClasses',
            'type',
            'canEdit',
          ])}
        />
      )}
      {hasChildren.body ?? (
        <BrickBody
          {...pick(props, [
            'body',
            'subitems',
            'partClasses',
            'type',
            'SubitemComponent',
          ])}
        />
      )}
      {hasChildren.footer ?? (
        <BrickFooter {...pick(props, ['footer', 'partClasses', 'type'])} />
      )}
      {...others}
    </>
  )
}

export function BrickHead(
  props: Pick<
    BrickProps,
    'icon' | 'title' | 'extra' | 'partClasses' | 'canEdit' | 'type'
  > & { children?: React.ReactNode }
) {
  const {
    icon,
    title,
    extra,
    partClasses = {},
    type = 'node',
    canEdit,
    children,
  } = props
  return children ? (
    <>{children}</>
  ) : (
    <>
      {(!isEmpty(icon) || !isEmpty(title) || !isEmptyContent(extra)) && (
        <NPart cssClass={[`${type}-head`, partClasses.head]}>
          {!isEmpty(icon) && (
            <NPart cssClass={[partClasses.icon]}>{icon}</NPart>
          )}
          {!isEmpty(title) && (
            <NPart
              cssClass={[`${type}-title`, partClasses.title]}
              contentEditable={canEdit}
            >
              {title}
            </NPart>
          )}
          {!isEmpty(extra) && (
            <NPart cssClass={[`${type}-extra`, partClasses.extra]}>
              <BrickContent content={extra} />
            </NPart>
          )}
        </NPart>
      )}
    </>
  )
}

export function BrickBody(
  props: Pick<
    BrickProps,
    'body' | 'subitems' | 'partClasses' | 'type' | 'SubitemComponent'
  > & { children?: React.ReactNode }
) {
  const {
    body,
    subitems,
    partClasses = {},
    type = 'node',
    children,
    SubitemComponent,
  } = props
  const subContent = subitems ?? body
  return children ? (
    <>{children}</>
  ) : (
    <>
      {!isEmpty(subContent) && (
        <NPart cssClass={[`${type}-body`, partClasses.body]}>
          <NPart cssClass={[`${type}-subitems`, partClasses.subitems]}>
            <BrickContent content={subContent} Component={SubitemComponent} />
          </NPart>
        </NPart>
      )}
    </>
  )
}

export function BrickContent<T extends BrickPropsContent>(props: {
  content: T | null | undefined
  Component?: React.ComponentType<any>
}): JSX.Element | null {
  const { content, Component = Brick } = props
  if (isBrickPropsList(content) || isBrickPropsMap(content)) {
    return (
      <>
        {Object.entries(content).map(([key, item]) => (
          <Component key={key} {...item} />
        ))}
      </>
    )
  }
  if (!isEmpty(content)) {
    return <>{content}</>
  }
  return null
}

export function BrickFooter(
  props: Pick<BrickProps, 'footer' | 'partClasses' | 'type'> & {
    children?: React.ReactNode
  }
) {
  const { footer, partClasses = {}, type = 'node', children } = props
  return children ? (
    <>{children}</>
  ) : (
    <>
      {!isEmpty(footer) && (
        <NPart cssClass={[`${type}-footer`, partClasses.footer]}>
          <BrickContent content={footer} />
        </NPart>
      )}
    </>
  )
}

export function isBrickList(v: any): v is BrickPropsList {
  return Array.isArray(v) && v.every(React.isValidElement)
}

export function isBrickProps(v: any): v is BrickProps {
  return (
    typeof v === 'object' &&
    Object.keys(v).some((k) =>
      ['icon', 'title', 'body', 'subitems'].includes(k)
    )
  )
}

export function isBrickPropsList(v: any): v is BrickProps[] {
  return Array.isArray(v) && v.every(isBrickProps)
}

export function isBrickPropsMap(v: any): v is { [k: string]: BrickProps } {
  return (
    typeof v === 'object' &&
    isBrickPropsList(Object.values(v)) &&
    Object.keys(v).every((k) => typeof k === 'string')
  )
}

export function isEmptyContent(v: any): boolean {
  // 对空的 React fragment 进行判断
  if (
    v &&
    typeof v === 'object' &&
    '$$typeof' in v &&
    typeof v.props === 'object' &&
    isEmpty(v.props.children)
  ) {
    return true
  }
  return isEmpty(v)
}
