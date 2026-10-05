import React from 'react'
import { cls, colorBase } from '../../styles'
import './conf.less'

const classList = [
  cls`
    display: flex;
    flex-wrap: nowrap;
    overflow: hidden;
    min-width: 600px;

    > * {
      height: 100%;
      overflow-y: auto;
    }

    .form-fieldset {
      &.active {
        outline: 1px solid ${[colorBase.primary, 400]};
        border-radius: 4px;
        > label {
          background-color: ${[colorBase.primary, 400]};
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
        }
      }
    }

    > form {
      flex-grow: 1;
      display: flex;
      flex-wrap: wrap;
    }

    .conf-tabs {
      flex-basis: 200px;
      flex-shrink: 0;
      flex-grow: 0;
      border-right: 1px solid var(--cl-slate-200);

      .conf-tab-item {
        padding: 6px 16px;
        cursor: pointer;

        &.active {
          background-color: var(--cl-slate-200);
          cursor: text;
        }

        &:not(.active):hover {
          background-color: var(--cl-slate-100);
        }
      }
    }
  `,
  'form-wrap',
  'conf-form-wrap',
]

export function ConfFormWrapComp(props: any) {
  const { children, fields, activeKey, hideTabs } = props
  const ref = React.useRef<HTMLDivElement>(null)
  const [active, setActive] = React.useState('')
  React.useEffect(() => {
    document.querySelector('.form-fieldset.active')?.classList.remove('active')
    const fieldsetDom = document.querySelector(`.form-fieldset-${active}`)
    if (fieldsetDom) {
      fieldsetDom.scrollIntoView()
      fieldsetDom.classList.add('active')
    }

    // 当表单内容高度超过容器高度时，让它可以滚动
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const rect2 = ref.current.parentElement?.getBoundingClientRect()
      if (rect2 && rect.height > rect2.height) {
        // 用父容器的真实高度，而不是猜测的视口偏移量
        ref.current.style.height = `${rect2.height}px`
      }
    }
  }, [active])

  React.useEffect(() => {
    activeKey && setActive(activeKey)
  }, [activeKey])

  const allFields = React.useMemo(() => {
    return Object.entries(fields).sort((a: any, b: any) => {
      return (a[1].order ?? 10) - (b[1].order ?? 10)
    })
  }, [fields])

  return (
    <div className={classList.join(' ')} ref={ref}>
      {!hideTabs && (
        <div className="conf-tabs">
          {allFields.map(([k, field]: any) => {
            const classes = ['conf-tab-item', `${k}-tab-item`]
            if (k === active) {
              classes.push('active')
            }
            const handleClick = () => {
              setActive(k)
            }
            return (
              <div
                style={{ order: field.order }}
                onClick={handleClick}
                className={classes.join(' ')}
                key={k}
              >
                {field.title}
              </div>
            )
          })}
        </div>
      )}
      {children}
    </div>
  )
}
