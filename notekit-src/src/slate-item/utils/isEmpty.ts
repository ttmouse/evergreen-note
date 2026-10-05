/* eslint-disable prettier/prettier */
/**
 * Check if a value is an empty thing in JavaScript
 * @param v
 * @returns
 */
export function isEmpty(v: any): boolean {
  if (v === undefined ||
    v === null ||
    v === false ||
    v === 0 ||
    v === '' ||
    Number.isNaN(v) ||
    (Array.isArray(v) && v.length < 1)) {
    return true
  }
  if (typeof v === 'object') {
    if ((v instanceof Set || v instanceof Map) && v.size < 1) {
      return true
    }
    if (Object.keys(v).length < 1) {
      return true
    }
  }
  return false
}

export function notEmpty<T>(v: any): v is T {
  return !isEmpty(v)
}
