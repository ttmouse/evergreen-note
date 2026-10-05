import { handleWildcard } from '../Traits/helper'
import { FuncLogic, Logic, LogicContext } from '../Traits/Logic'
import { isEmpty } from '../../utils/isEmpty'

export class LayoutLogic extends FuncLogic {
  reg: RegExp

  constructor(ctx: LogicContext, ...cond: any[]) {
    super(ctx, ...cond)
    this.reg = new RegExp(handleWildcard(cond[0]), 'i')
  }

  exec(item: UnitPersist) {
    return !isEmpty(item.layout) && this.reg.test(item.layout)
  }
}

Logic.register({
  layout: LayoutLogic,
})
