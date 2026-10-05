export function flip(obj: Object) {
  const ret: any = {};
  Object.entries(obj).forEach((k, v) => {
    ret[String(v)] = k;
  });
  return ret;
}
