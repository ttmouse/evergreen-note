export function getUrlParams(searchString?: string): { [key: string]: string } {
  const params = new URLSearchParams(searchString ?? window.location.search)
  const result = {} as any
  for (const [key, value] of params) {
    result[key] = value
  }
  return result
}
