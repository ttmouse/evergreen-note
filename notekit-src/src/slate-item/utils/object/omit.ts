// type OmitFn = (key: string, val: any) => boolean;

// export function omit(obj: any, keys: string[] | OmitFn) {
//   const result: any = {};
//   for (const key of Object.keys(obj)) {
//     if (Array.isArray(keys)) {
//       if (!keys.includes(key)) {
//         result[key] = obj[key];
//       }
//     } else if (typeof keys === 'function') {
//       if (!keys(key, obj[key])) {
//         result[key] = obj[key];
//       }
//     }
//   }
//   return result;
// }

type OmitFn<T> = (key: keyof T, value: T[keyof T]) => boolean

export function omit<T extends object>(
  obj: T,
  keys: Array<keyof T> | OmitFn<T>
): Partial<T> {
  const result: Partial<T> = {}

  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (Array.isArray(keys)) {
      if (!keys.includes(key)) {
        result[key] = obj[key]
      }
    } else if (typeof keys === 'function') {
      const omitFn = keys as OmitFn<T>
      if (!omitFn(key, obj[key])) {
        result[key] = obj[key]
      }
    }
  }

  return result
}
