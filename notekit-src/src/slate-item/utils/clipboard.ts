export function copy(source: string) {
  return navigator.clipboard.writeText(source);
}
