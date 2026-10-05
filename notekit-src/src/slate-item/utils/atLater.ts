import { TimeMilliSecond } from '../interfaces/unit'
import { mkid } from './string/mkid'

const later = new Map()
const deferred = new Map<string, () => unknown>()

export function clearLater(key: string) {
  deferred.delete(key)
  if (later.has(key)) {
    clearTimeout(later.get(key))
    later.delete(key)
  }
}

/**
 * 延时节流执行脚本
 * @param fn
 * @param key
 * @param delay 延迟时间(毫秒), 若为负, 则立即同步执行
 * @returns
 */
export function atLater(
  fn: () => unknown,
  key: string,
  delay = 500,
  firstAtOnce = false
) {
  return new Promise((resolve) => {
    if (firstAtOnce && !later.has(key)) {
      resolve(fn())
      later.set(
        key,
        setTimeout(() => {}, delay)
      )
      return
    }
    clearLater(key)
    if (delay < 0) {
      resolve(fn())
    } else {
      const run = () => {
        clearLater(key)
        const value = fn()
        resolve(value)
        return value
      }
      deferred.set(key, run)
      later.set(key, setTimeout(run, delay))
    }
  })
}

/** 退出前执行指定的保存队列，包括保存回调新排入的下一层任务。 */
export async function flushLater(prefixes: string[]) {
  for (;;) {
    const tasks = [...deferred.entries()].filter(([key]) => prefixes.some(prefix => key.startsWith(prefix)))
    if (!tasks.length) return
    for (const [key, run] of tasks) {
      if (deferred.get(key) === run) await run()
    }
  }
}

/**
 * 在 duration 限定的时间内容，只执行第一个被传入的 fn
 * @param fn
 * @param duration
 * @returns
 */
const timerMap = {} as any
export function atFirst(fn: () => void, key: string, duration = 500): void {
  // Clear the existing timer for the given key, if any
  function clearTimer(): void {
    const timer = timerMap[key]
    if (timer) {
      clearTimeout(timer)
    }
  }

  // Execute the function and set the timer
  function executeAndSetTimer(): void {
    clearTimer()
    timerMap[key] = setTimeout(() => {
      fn()
      clearTimer()
    }, duration)
  }

  executeAndSetTimer()
}

const vars = {} as any
export const liveValue = {
  create(life: TimeMilliSecond, val: any, key = mkid()) {
    vars[key] = {
      value() {
        vars[key].live()
        return val
      },
      created: Date.now(),
      key,
      life,
      live(lifetime = life) {
        liveValue.del(key, lifetime)
      },
    }
    vars[key].live()
    return vars[key]
  },

  get(key: string) {
    return vars[key].value()
  },

  del(key: string, life?: TimeMilliSecond) {
    atLater(() => delete vars[key], `delete-${key}`, life ?? vars[key].life)
  },
}
