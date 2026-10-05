import React from 'react'
import { css } from '@emotion/css'
import { UnitProps } from '../interfaces/unit'
import { isEmpty } from '../utils/isEmpty'
import { upperCaseFirst } from '../utils/string'
import { cls } from '../styles'
import Tooltip from '@mui/material/Tooltip'
import { Tip } from './Tip/Tip'

/**
 * 合并数据, 尤其是合并 classOuter、styleOuter、classHead 之类的
 * @param props
 * @param others
 * @returns
 */
export const mergeProps = (props: Partial<UnitProps>, others: any) => {
  const newProps = { ...props }
  Object.entries(others).forEach(([key, val]) => {
    const merged: any[] = []
    if (/^class[A-Z][a-z]+/.test(key)) {
      if (!isEmpty(props[key])) {
        merged.push(props[key])
      }
      merged.push(val)
      newProps[key] = merged.join(' ')
    } else if (/^style[A-Z][a-z]+/.test(key)) {
      newProps[key] = { ...props[key], ...(val as any) }
    }
  })
  return newProps
}

const handle = (props: any) => {
  if (!props['data-part']) {
    return props
  }
  let classKey = `class${upperCaseFirst(props['data-part'])}`
  if ('className' in props) {
    throw new Error(
      `To avoid confusion, please do not use className='*' in props, use ${classKey}='*' for ${props['data-part']} element instead.`
    )
  }

  const newProps: any = purify(props)

  const cssClass: string[] = []
  if (classKey === 'classNode') {
    classKey = 'classOuter'
  }

  if (typeof props[classKey] === 'object') {
    cssClass.push(css(props[classKey]))
  } else {
    cssClass.push(props[classKey])
  }

  const classes =
    props['data-part'] === 'outer' ? 'node' : `node-${props['data-part']}`
  cssClass.push(classes)

  if (!isEmpty(cssClass)) {
    newProps.className = cssClass.join(' ').replace(/\s+/g, ' ')
  }

  let styleKey = `style${upperCaseFirst(props['data-part'])}`
  if (styleKey === 'styleNode') {
    styleKey = 'styleOuter'
  }
  if ('style' in props) {
    throw new Error(
      `To avoid confusion, please do not use style='*' in props, use ${styleKey}='*' for ${props['data-part']} element instead.`
    )
  }
  if (!isEmpty(props[styleKey])) {
    newProps.style = props[styleKey]
  }
  if ('foldup' in props) {
    newProps.foldup = String(props.foldup)
  }
  return newProps
}

/**
 * We should never use a primitive HTML Tag to create a React Component.
 * Instead, we should build every React Component on top of PriEle.
 * So that we can easisy control the render logic for each of React Component.
 * @param props
 * @returns
 */
export const PriEle = React.forwardRef((props: any, ref) => {
  let EleTag = 'div'
  const { className, cond, ...newProps } = props

  if (typeof cond === 'function' && !cond()) {
    return null
  }

  const { eleTag, children } = props
  if (eleTag) {
    EleTag = eleTag
  }

  for (const [k, v] of Object.entries(newProps)) {
    if (/class[A-Z][a-z]+$/.test(k) && Array.isArray(v)) {
      newProps[k] = v.join(' ')
    }
  }
  if (newProps.classList) {
    newProps.className ??= ''
    newProps.className = (newProps.className + newProps.classList).trim()
  }

  if (props.order) {
    newProps.classOuter ??= ''
    newProps.classOuter += ` ${cls`order:${props.order}`}`
  }
  const handledProps = handle(newProps)

  // React's native focus prop must not become the custom attribute tab-index.
  if ('tabIndex' in props) {
    delete handledProps['tab-index']
    handledProps.tabIndex = props.tabIndex
  }

  if ('contentEditable' in props) {
    handledProps.contentEditable = props.contentEditable
  }

  if (!isEmpty(className)) {
    handledProps.className = `${className} ${handledProps.className}`
  }

  return (
    <EleTag {...handledProps} ref={ref}>
      {children}
    </EleTag>
  )

  // return isEmpty(help) ? (
  //   <EleTag {...handledProps} ref={ref}>
  //     {children}
  //   </EleTag>
  // ) : (
  //   <Tooltip title={help} arrow>
  //     <EleTag {...handledProps} ref={ref}>
  //       {children}
  //     </EleTag>
  //   </Tooltip>
  // );
})

export const PriSpan = React.forwardRef((props: any, ref) => {
  const { children, help, ...rest } = props
  const ele = (
    <span {...rest} ref={ref}>
      {children}
    </span>
  )
  return isEmpty(help) ? ele : <Tip title={help}>{ele}</Tip>
})

export const EleOuter = React.forwardRef((props: any, ref) => {
  const { children } = props
  const newProps = {
    ...props,
  }
  return (
    <PriEle data-part="outer" eleTag="section" {...newProps} ref={ref}>
      {children}
    </PriEle>
  )
})

export const EleIcon = React.forwardRef((props: any, ref) => {
  const { children } = props
  return (
    <PriEle data-part="icon" {...props} ref={ref}>
      {children}
    </PriEle>
  )
})

export const EleCrumbs = React.forwardRef((props: any, ref) => {
  const { children } = props
  return (
    <PriEle data-part="crumbs" {...props} ref={ref}>
      {children}
    </PriEle>
  )
})

export const EleHead = React.forwardRef((props: any, ref) => {
  const { children } = props
  return (
    <PriEle data-part="head" {...props} ref={ref}>
      {children}
    </PriEle>
  )
})

export const EleBody = React.forwardRef((props: any, ref) => {
  const { children } = props
  return (
    <PriEle data-part="body" eleTag="main" {...props} ref={ref}>
      {children}
    </PriEle>
  )
})

export const EleSubitems = React.forwardRef((props: any, ref) => {
  const { children } = props
  return (
    <PriEle data-part="child" {...props} ref={ref}>
      {children}
    </PriEle>
  )
})

export const EleExtra = React.forwardRef((props: any, ref) => {
  const { children } = props
  return (
    <PriEle data-part="extra" {...props} ref={ref}>
      {children}
    </PriEle>
  )
})

export const EleFoot = React.forwardRef((props: any, ref) => {
  const { children } = props
  return (
    <PriEle data-part="foot" eleTag="footer" {...props} ref={ref}>
      {children}
    </PriEle>
  )
})

const purify = (props: any): Object => {
  const tmpProps: any = {}
  Object.keys(props).forEach((k) => {
    if (
      (['undefined', 'object'].includes(typeof props[k]) === false &&
        String(props[k]).length > 0 &&
        [
          'title',
          'icon',
          'mode',
          'contentEditable',
          'className',
          'eleTag',
          'data-part',
          'isSelected',
        ].includes(k) === false &&
        (typeof props[k] !== 'function' || k.startsWith('on')) &&
        /(^class[A-Z][a-z]+)/.test(k) === false) ||
      // 为了避免 on 事件的混淆, 不允许在 purify() 中添加 on 事件
      // && /^on[A-Z][a-z]+/.test(k) === false
      k === 'style'
    ) {
      const s =
        k === 'className' || typeof props[k] === 'function'
          ? k
          : k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
      tmpProps[s] = props[k]
    }
  })

  delete tmpProps.extra
  delete tmpProps.foot
  return tmpProps
}
