import { Node } from 'slate'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { Item } from '../../interfaces/item'
import { isEmpty } from '../../utils/isEmpty'
import { isDate } from '../Daily/Daily'
import { PLAN_STATUS } from '../DateTool/Reminder/countdown'
import { LogicString } from '../Traits/Logic'
import { IsLogic, IsLogicRule } from './IsLogic'

export function createIsAddon({ app, $ }: NewAddonParams) {
  class Is implements IAddon {
    app!: App
    config = {}

    addRules(rules: IsLogicRule) {
      IsLogic.addRules(rules)
    }

    addRule(ruleName: string, ruleString: LogicString) {
      const logic = $.traits.createLogic(ruleString)
      $.is.addRules({ [ruleName]: logic.exec.bind(logic) })
    }

    addonBeforeRun() {
      const { dbMemory, star } = this.app.addons
      const isTodo = (item: UnitPersist) =>
        // $.checkbox.verify(Item.trimLeaves(item.leaves)?.[0])
        (item.leaves as Node[])?.some((e: Node)=>$.checkbox.verify(e));

      const isDone = (item: UnitPersist) => {
        const checkboxes = (item.leaves as Node[])?.filter((e: Node) => $.checkbox.verify(e));
        return checkboxes && checkboxes.length > 0 && checkboxes.every(e=>e.value);
      }

      this.addRules({
        todo(item) {
          return (
            (isTodo(item) && !isDone(item)) ||
            ($.reminder?.isReminder(item) &&
              $.reminder?.isTodo(item))
          ) ? true : false;
        },

        done(item) {
          return (
            isDone(item) ||
            ($.reminder?.isReminder(item) &&
              $.reminder?.getPlan(item)?.repeatPlan === "once" &&
              !/#事件|#event/.test(Item.headString(item)) &&
              !$.reminder?.isTodo(item))
          )
        },

        markedDone(item) {
          return isDone(item) ||
            ($.reminder?.isReminder(item) &&
              $.reminder?.getPlan(item)?.status === PLAN_STATUS.done)
        },

        image(item) {
          return (item.leaves && item.leaves.some(e=>(e.blockType && e.blockType=="img")));
        },

        file(item) {
          return (item.leaves && item.leaves.some(e=>(e.blockType && e.blockType=="attachment")));
        },

        foldup(item) {
          return !!item.foldup
        },

        topic(item) {
          return !isEmpty(item.topic)
        },

        daily(item) {
          return isDate(item.topic)
        },

        'no-child': (item) => {
          return !isEmpty(dbMemory.indexed.pky[item.ky])
        },

        'no-text': (item) => {
          return isEmpty(Item.headString(item))
        },

        finished(item) {
          return !!(item as any).finished
        },

        trash(item) {
          return Number(item.status) === -1 && !isEmpty(Item.headString(item))
        },

        star(item) {
          return star.isStar(item.ky)
        },

        task(item) {
          const head = Item.headString(item)
          return (
            (!isEmpty(head) &&
              (/(^\]\s+|\[[\syx]?\]\s+)/i.test(head) ||
                /\{\{pomo\s*.*\}\}|\{\{todo\}\}/i.test(head) ||
                /#(todo|待办)\s/i.test(head) ||
                /#(todo|待办)$/i.test(head))) ||
            isTodo(item) ||
            isDone(item)
          )
        },

        'no-mentions': (item) => {
          return !!(
            item.topic &&
            item.topic in dbMemory.indexed.mentions === false &&
            item.ky in dbMemory.indexed.referText === false &&
            item.ky in dbMemory.indexed.referBlock === false
          )
        },

        referred(item) {
          return (
            !isEmpty(dbMemory.indexed.referText[item.ky]) ||
            !isEmpty(dbMemory.indexed.referBlock[item.ky])
          )
        },

        untitled(item) {
          return (
            !item.topic &&
            !isEmpty(Item.headString(item)) &&
            (isEmpty(item.pky) || item.pky in dbMemory.nodes === false)
          )
        },
      })
    }

    addonRun() {
      // Initialization for this Is
    }
  }

  return new Is()
}
