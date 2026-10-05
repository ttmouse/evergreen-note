import { Logic } from '../../Traits/Logic';
import { ItemWithBlockStyle } from './BlockStyle';

/**
 * 支持 style:demo 的搜索语法
 */
export class StyleLogic extends Logic {
  exec(item: ItemWithBlockStyle) {
    if (Array.isArray(item?.blockStyle?.styles)) {
      return Boolean(item?.blockStyle?.styles.includes(this.logicStr[0]));
    }
    return false;
  }
}
