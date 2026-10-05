// Add prefix to each property of an object
export function prefixEachProp(obj: any, prefix: string): any {
  const result: any = {};
  for (const key of Object.keys(obj)) {
    result[prefix + key] = obj[key];
  }
  return result;
}
