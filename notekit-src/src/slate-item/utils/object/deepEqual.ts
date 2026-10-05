/**
 * deep compare two object if they are equal
 * @param obj1
 * @param obj2
 * @returns
 */
export function deepEqual(obj1: any, obj2: any) {
  if (obj1 === obj2) {
    return true;
  }
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    return obj1 === obj2;
  }
  if (obj1 === null || obj2 === null) {
    return false;
  }
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length) {
    return false;
  }
  for (let i = 0; i < keys1.length; i += 1) {
    if (!keys2.includes(keys1[i])) {
      return false;
    }
    if (!deepEqual(obj1[keys1[i]], obj2[keys1[i]])) {
      return false;
    }
  }
  return true;
}
