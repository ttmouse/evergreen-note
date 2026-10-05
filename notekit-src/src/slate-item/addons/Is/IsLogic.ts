import { Logic, LogicString } from '../Traits/Logic';
import * as condUtils from '../Traits/helper';

export interface IsLogicRule {
  [ruleName: string]: (item: UnitPersist) => boolean;
}

export class IsLogic extends Logic {
  static rules: IsLogicRule = {};

  static addRules(rules: IsLogicRule): void {
    for (const [ruleName, ruleFn] of Object.entries(rules)) {
      IsLogic.rules[ruleName.toLowerCase()] = ruleFn;
    }
  }

  append(...logics: any[]): Logic {
    for (let cond of logics) {
      cond = (cond as LogicString).replace(/^\((.+?)\)$/g, '$1');
      cond.split(/\s+/).forEach((c: string) => {
        this.children.push(c);
      });
    }
    return this;
  }

  exec(item: UnitPersist) {
    for (const cond of this.children) {
      const lowerCond = (cond as string).toLowerCase();
      if (lowerCond.includes('*')) {
        const pattern = new RegExp(condUtils.handleWildcard(lowerCond), 'igs');
        for (const [ruleName, ruleFn] of Object.entries(IsLogic.rules)) {
          if (pattern.test(ruleName) && !ruleFn(item)) {
            return false;
          }
        }
      }
      if (
        lowerCond in IsLogic.rules === false ||
        !IsLogic.rules[lowerCond](item)
      ) {
        return false;
      }
    }
    return true;
  }
}

Logic.register({ is: IsLogic });
