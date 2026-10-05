/**
 * Check if the character is an escape character with /
 */
export function isEscape(ctxString: string, match: number | RegExpExecArray, escapeChar = '\\'): boolean {
  const matchIndex = typeof match === 'number' ? match : match.index;
  return ctxString[matchIndex - 1] === escapeChar;
}