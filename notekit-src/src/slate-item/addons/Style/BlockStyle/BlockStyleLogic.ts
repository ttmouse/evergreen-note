import { Logic, LogicContext } from '../../Traits/Logic';

export class BlockStyleLogic extends Logic {
  styles: string[] = [];

  constructor(ctx: LogicContext, ...cond: any[]) {
    super(ctx, ...cond);
    this.styles = cond[0].split(',');
  }

  exec(item: UnitPersist) {
    return this.ctx.app.addons.blockStyle.hasStyle(item, this.styles);
  }
}
