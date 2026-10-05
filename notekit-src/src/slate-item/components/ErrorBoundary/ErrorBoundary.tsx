import React from 'react'
import { cls, colorBase } from '../../styles'

const errorStyle = cls`
  border-radius: 4px;
  padding: 12px;
  border: 1px solid ${[colorBase.danger, 500]};

  h1 {
    font-size: 24px;
  }

  a {
    display: inline-block;
    margin-left: 12px;
    border-bottom: 1px solid ${[colorBase.primary, 500]};
  }
`

export class ErrorBoundary extends React.Component {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: any) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error }
  }

  componentDidCatch(error: any, errorInfo: any) {
    // You can also log the error to an error reporting service
    console.error(error, errorInfo)
    // [还原期诊断] 把堆栈与组件栈留到 window.__errs，便于用 CDP 读取定位
    try {
      const w = window as any
      w.__errs = w.__errs || []
      w.__errs.push(
        'BOUNDARY: ' + String(error && error.stack) +
        '\n--componentStack--' + String(errorInfo && errorInfo.componentStack)
      )
    } catch (_) {
      /* ignore */
    }
  }

  render() {
    const { state, props } = this as any
    if (state.hasError) {
      // You can render any custom fallback UI
      return (
        <section className={errorStyle}>
          <h1>Something went wrong.</h1>
          <details>
            <summary>
              But don't worry, it is not your fault. Please
              <a href="#" onClick={() => window.location.reload()}>
                reload the page to continue
              </a>.<br />
              Error Information: {state.error.toString()}
            </summary>
            <p />
          </details>
        </section>
      )
    }

    return props.children
  }
}
