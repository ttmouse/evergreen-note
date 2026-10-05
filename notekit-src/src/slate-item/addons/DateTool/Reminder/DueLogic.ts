import { todayFmt, YYYY_MM_DD, isDateFmt } from '../../../utils/date/datekit';
import { isNumber } from '../../../utils/regexp';
import { FuncLogic, Logic } from '../../Traits/Logic';

export class DueLogic extends FuncLogic {
  range: [number, number];
  currentDate: YYYY_MM_DD;
  count: number;
  isReminder: Logic;

  constructor(ctx, ...cond) {
    super(ctx, ...cond);
    const r = /\s*,\s*/;
    if (cond[0].split(r).length > 1) {
      this.range = cond[0].split(r).map((n) => Number(n));
    } else if (isDateFmt(cond[0])) {
      [this.currentDate] = cond;
    } else if (isNumber(cond[0])) {
      this.count = Number(cond[0]);
    }
    this.isReminder = new Logic(ctx, 'is:reminder');
  }

  exec(item: UnitPersist) {
    if (!this.isReminder.exec(item)) {
      return false;
    }
    const { reminder } = this.ctx.app.addons;
    const fmtToday = reminder.fmtToday;

    if (Array.isArray(this.range)) {
      const n = reminder.calcDueDays(
        (item as any).reminder?.plans?.[0],
        fmtToday
      );
      return n >= this.range[0] && n <= this.range[1];
    }
    if (typeof this.count === 'number') {
      const n = reminder.calcDueDays(item, fmtToday);
      return n === this.count;
    }
    if (this.currentDate) {
      return reminder.calcDueDays(item, this.currentDate) === 0;
    }
    return false;
  }
}
