export const lang: any = new Proxy(
  {},
  {
    get(obj, k: string, target) {
      if (k in obj === false) {
        return k.slice(0, 1).toUpperCase() + k.slice(1).replace(/_/g, ' ');
      }
      return Reflect.get(obj, k, target);
    },
  }
);

export const $$ = (
  arr: TemplateStringsArray | string,
  ...vars: any[]
): string => {
  if (typeof arr === 'string') {
    arr = [arr] as any;
  }
  const strings = Array.from(arr);
  const result = [strings.shift()];
  for (let i = 0; i < vars.length; i++) {
    const v = typeof vars[i] === 'function' ? vars[i]() : vars[i];
    result.push(v);
    result.push(strings[i]);
  }

  return lang[result.join('')];
};
