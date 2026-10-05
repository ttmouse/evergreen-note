import { UnitPart, UnitProps } from '../interfaces/unit';
import { isEmpty } from '../utils/isEmpty';
import { upperCaseFirst } from '../utils/string';
import { usePartProps } from './usePartProps';

export function usePartClassNames(
  props: Partial<UnitProps>,
  partName: UnitPart
): string {
  const unitClass = [props.className, props.partProps?.[partName]];
  unitClass.push(usePartProps(props.layoutDepth, partName).className ?? '');
  const classKey = `class${upperCaseFirst(partName)}`;
  if (!isEmpty(props[classKey])) {
    unitClass.push(props[classKey]);
  }
  return unitClass.join(' ').trim();
}
