import { KyString, UnitPersist } from '../../../interfaces/unit';
import { todayFmt } from '../../../utils/date/datekit';
import { ItemWithReminder } from './Reminder';

export function getPlan(item: UnitPersist) {
  const plan = (item as ItemWithReminder).reminder?.plans?.[0]
  if (plan && !plan.timeDelta) plan.timeDelta = '0'
  return plan;
}

export function getRelativeDate(item: UnitPersist, today?: string) {
  let relativeDate = today ?? todayFmt()
  try {
    let current = item.GetParent()
    const visited = new Set<string>()
    while(current && !visited.has(current.ky)) {
      visited.add(current.ky)
      if (current.ky.endsWith('-remind')) {
        relativeDate = current.ky.replace(/-remind$/, '')
        break
      }
      current = current.GetParent()
    }
  } catch(e) {
    console.error('Error calculating next date:', e);
  }
  return relativeDate
}

export function makeDoneKy(ky: KyString, today?: string) {
  const t = today ?? todayFmt()
  return `${ky}-s${t.replace(/-/g, '')}`;
}
