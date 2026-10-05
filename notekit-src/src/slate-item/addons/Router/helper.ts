/*
将网址解析成以下数据结构：
addon/method/key1:val1,key2:val2/arg1/arg2/arg3
{ addonName: "addon", methodName: "method", args: [{key1: val1, key2: val2}, arg1, arg2, arg3]}
*/
export function parseAddonUrlScheme(url: string) {
  const [addonName, methodName, ...args] = url.split('/')
  const newArgs = args.map((arg) => {
    if (/[\w]+:[\w]+,?/.test(arg)) {
      const parts = arg.split(',')
      const obj: any = {}
      parts.forEach((part) => {
        const [key, value] = part.split(':')
        obj[key] = value
      })
      return obj
    }
    return arg
  })
  return {
    addonName,
    methodName,
    args: newArgs,
  }
}
