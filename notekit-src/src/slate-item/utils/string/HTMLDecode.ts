/**
 * 对HTML字符的转义还原
 * @param text
 * @returns
 */
export function HTMLDecode(text: string) {
  let temp = document.createElement('div');
  temp.innerHTML = text;
  const output = temp.innerText || temp.textContent;
  temp = null as any;
  return output ?? '';
}
