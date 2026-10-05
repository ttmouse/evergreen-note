import { Item } from '../../interfaces/item';
import {
  datekit,
  YYYY_MM_DD,
  dateFmt,
  isDateFmt,
} from '../../utils/date/datekit';
import { isEmpty } from '../../utils/isEmpty';

export abstract class HeatmapStrategy {
  items = {};
  max = -1;

  check(item: UnitPersist) {
    return Item.isNormalStatus(item);
  }

  add(fmtDate: YYYY_MM_DD, val: number) {
    if (!this.items[fmtDate]) {
      this.items[fmtDate] = { val: 0, nodes: [] };
    }
    this.items[fmtDate].val += val;
    if (this.items[fmtDate].val > this.max) {
      this.max = this.items[fmtDate].val;
    }
  }

  abstract addItem(item: UnitPersist);

  getMaxVal() {
    return this.max;
  }

  getDayVal(fmtDate: YYYY_MM_DD) {
    return typeof this.items[fmtDate] !== 'undefined'
      ? this.items[fmtDate].val
      : 0;
  }

  getPercent(fmtDate: YYYY_MM_DD) {
    return this.getMaxVal() !== 0
      ? this.getDayVal(fmtDate) / this.getMaxVal()
      : 0;
  }

  getMsg(fmtDate: YYYY_MM_DD) {
    return '';
  }
}

export class HeatMapStrategyUpdatedChars extends HeatmapStrategy {
  addItem(item: UnitPersist) {
    if (!this.check(item)) {
      return false;
    }
    const fmtDate = datekit(item.updated).format(YYYY_MM_DD);
    const val = typeof item.ori === 'string' ? item.ori.length : 0;
    this.add(fmtDate, val);
  }

  check(item: UnitPersist) {
    return super.check(item) && !isEmpty(Item.headString(item));
  }
}

export class HeatMapStrategyUpdatedNodes extends HeatmapStrategy {
  addItem(item) {
    if (!this.check(item)) {
      return false;
    }

    const fmtDate = dateFmt(item.updated);
    this.add(fmtDate, 1);
  }

  getMsg(fmtDate: YYYY_MM_DD) {
    const val = this.getDayVal(fmtDate);
    if (val > 0) {
      return `更新了${val}个节点`;
    }
    return '';
  }
}

export class HeatMapStrategyCreatedNodes extends HeatmapStrategy {
  addItem(item) {
    if (!this.check(item)) {
      return false;
    }

    const fmtDate = dateFmt(item.created);
    this.add(fmtDate, 1);
  }

  getMsg(fmtDate: YYYY_MM_DD) {
    const val = this.getDayVal(fmtDate);
    if (val > 0) {
      return `更新了${val}个节点`;
    }
    return '';
  }
}
