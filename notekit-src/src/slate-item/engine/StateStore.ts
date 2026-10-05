import { TimeMilliSecond } from '../interfaces/unit'
import { makeAutoObservable } from 'mobx'

declare global {
  // App 的运行时状态
  interface AppStates {
    appStarted: TimeMilliSecond
    pageTitle: string
  }
}

export type AppStateName = keyof AppStates
export type StateSchemes<K extends AppStateName> = {
  [k in K]?: {
    cache?: boolean // 是否缓存状态值到 localStorage
    default?: AppStates[K] // 当没有定义时的默认值
    persist?: any // 是否保存到数据库
  }
}

export class StateStore {
  private values: AppStates = {} as any
  key: string
  schemes: StateSchemes<AppStateName>

  constructor(
    key: string,
    initialValues: Partial<AppStates> = {},
    schemes: StateSchemes<AppStateName> = {}
  ) {
    this.values = initialValues as any
    this.key = key
    this.schemes = schemes
    const cacheValues = this.restore()
    this.values = { ...this.values, ...cacheValues }
    makeAutoObservable(this)
  }

  set<K extends AppStateName>(
    key: K,
    value: AppStates[K],
    options: {
      cache?: boolean // 是否缓存状态值
      prefer?: boolean // 是否保存为偏好设置
    } = {}
  ): void {
    // this.values = produce(this.values, (draft) => {
    //   draft[key] = value;
    // });
    this.values[key] = value
    // const { cache = false } = options
    const willCache = options.cache ?? this.schemes[key]?.cache
    if (willCache) {
      this.save(key, value)
    }
  }

  save<K extends AppStateName>(key: K, value: AppStates[K]) {
    localStorage.setItem(`${this.key}-state-${key}`, JSON.stringify(value))
  }

  get<K extends AppStateName>(key: K): AppStates[K] {
    return this.values[key]
  }

  has(key: AppStateName) {
    return key in this.values
  }

  getValues() {
    return this.values
  }

  restore() {
    const values = {} as any
    for (const [k, v] of Object.entries(this.schemes)) {
      if (v?.default) {
        values[k as AppStateName] = v.default
      }
    }
    for (const [k, v] of Object.entries(localStorage)) {
      const prefix = `${this.key}-state-`
      if (k.startsWith(prefix)) {
        const name = k.replace(prefix, '') as AppStateName
        if (name in this.schemes && !this.schemes[name]?.cache) {
          continue
        }
        // this._values.set(name, JSON.parse(v));
        values[name] = JSON.parse(v)
      }
    }
    return values
  }
}
