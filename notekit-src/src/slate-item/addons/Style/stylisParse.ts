import { compile, serialize, stringify } from 'stylis'

// stylis 是 emotion 所使用的解析器

export function stylisParse(code: string) {
  return serialize(compile(code), stringify)
}
