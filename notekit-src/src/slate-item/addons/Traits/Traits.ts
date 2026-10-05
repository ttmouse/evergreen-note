import { App, NewAddonParams, IAddon } from '../../engine/App'
import { KyString } from '../../interfaces/unit'
import { atLater } from '../../utils/atLater'
import { FalseLogic, Logic, LogicString } from './Logic'

/**
 * 检索的语法规则
 */
export class Traits implements IAddon {
  app!: App
  config = {}
  caches: { [ky: LogicString]: [Logic, number] } = {}

  createLogic(logicString: LogicString): Logic {
    const ctx = {
      traits: this,
      app: this.app,
      db: this.app.addons.dbMemory,
    } as any
    try {
      if (!this.caches[logicString]) {
        const logic = new Logic(ctx, logicString)
        this.caches[logicString] = [logic, Date.now()]
        atLater(
          () => {
            delete this.caches[logicString]
          },
          `delete-traits-${logicString}`,
          10000
        )
      }
      return this.caches[logicString][0]
    } catch (e) {
      console.error(`Failed to create logic for string, using FalseLogic instead: ${logicString}`, e)
      return new FalseLogic(ctx)
    }
  }

  /**
   * 判断一个 item 是否符合检索规则
   * @param logicString
   * @param item
   */
  match(logicString: LogicString, item: UnitPersist | KyString) {
    if (typeof item === 'string') {
      item = this.app.addons.dbMemory.getItem(item)
    }
    return this.createLogic(logicString).test(item)
  }

  addonBeforeRun() {}

  addonRun() {}
}

export function createTraitsAddon({ app, $ }: NewAddonParams) {
  return new Traits()
}
