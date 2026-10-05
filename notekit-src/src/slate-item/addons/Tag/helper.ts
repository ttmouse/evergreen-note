export function trimSharp(str: string) {
  return str.replace(/^#+|#+$/g, '')
}
